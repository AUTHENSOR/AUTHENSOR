/**
 * End-to-end integration test
 *
 * Tests the full pipeline: create policy → evaluate envelope → get receipt →
 * claim → execute → verify hash chain → multi-party approval flow.
 */

import { beforeAll, describe, expect, it, vi } from 'vitest';
import { newDb } from 'pg-mem';
import crypto from 'crypto';

// Mock pg with an in-memory adapter before importing app/db
const mem = newDb();
const pg = mem.adapters.createPg();
vi.mock('pg', () => pg);

const { initDb, db } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');

const app = createApp();

// Auth setup
const adminToken = 'e2e_admin_token';
const adminKeyHash = crypto.createHash('sha256').update(adminToken).digest('hex');
const ingestToken = 'e2e_ingest_token';
const ingestKeyHash = crypto.createHash('sha256').update(ingestToken).digest('hex');
const executorToken = 'e2e_executor_token';
const executorKeyHash = crypto.createHash('sha256').update(executorToken).digest('hex');

const adminAuth = { Authorization: `Bearer ${adminToken}` };
const ingestAuth = { Authorization: `Bearer ${ingestToken}` };
const executorAuth = { Authorization: `Bearer ${executorToken}` };
const json = { 'Content-Type': 'application/json' };

function makeEnvelope(actionType: string, resource: string) {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    action: { type: actionType, resource, operation: 'execute' as const },
    principal: { type: 'agent' as const, id: 'test-agent' },
    context: { environment: 'development' as const },
  };
}

describe('E2E Pipeline: policy → evaluate → claim → execute → verify', () => {
  beforeAll(async () => {
    await initDb();

    // Create API keys for all roles
    await db.query(
      `INSERT INTO api_keys (id, name, role, key_hash) VALUES ($1, $2, $3, $4)`,
      [crypto.randomUUID(), 'E2E Admin', 'admin', adminKeyHash]
    );
    await db.query(
      `INSERT INTO api_keys (id, name, role, key_hash) VALUES ($1, $2, $3, $4)`,
      [crypto.randomUUID(), 'E2E Ingest', 'ingest', ingestKeyHash]
    );
    await db.query(
      `INSERT INTO api_keys (id, name, role, key_hash) VALUES ($1, $2, $3, $4)`,
      [crypto.randomUUID(), 'E2E Executor', 'executor', executorKeyHash]
    );
  });

  let receiptId: string;
  let claimId: string;

  it('creates and activates a policy', async () => {
    const policy = {
      id: 'e2e-policy',
      name: 'E2E Test Policy',
      version: '1.0.0',
      enabled: true,
      priority: 100,
      rules: [
        {
          id: 'allow-http',
          name: 'Allow HTTP reads',
          effect: 'allow',
          condition: {
            all: [{ field: 'action.type', operator: 'eq', value: 'http.request' }],
          },
        },
        {
          id: 'require-approval-stripe',
          name: 'Require approval for Stripe',
          effect: 'require_approval',
          condition: {
            all: [{ field: 'action.type', operator: 'eq', value: 'stripe.charges.create' }],
          },
          approvalConfig: {
            requiredApprovals: 2,
            expiresIn: '1h',
          },
        },
      ],
      defaultEffect: 'deny',
    };

    // Create policy
    const createRes = await app.request('/policies', {
      method: 'POST',
      body: JSON.stringify(policy),
      headers: { ...json, ...adminAuth },
    });
    expect(createRes.status).toBe(201);

    // Activate policy
    const activateRes = await app.request('/policies/active', {
      method: 'POST',
      body: JSON.stringify({ policy_id: policy.id, version: policy.version }),
      headers: { ...json, ...adminAuth },
    });
    expect(activateRes.status).toBe(200);
  });

  it('evaluates an allowed action and gets a receipt', async () => {
    const envelope = makeEnvelope('http.request', 'https://example.com');

    const res = await app.request('/evaluate', {
      method: 'POST',
      body: JSON.stringify(envelope),
      headers: { ...json, ...ingestAuth },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.decision.outcome).toBe('allow');
    expect(body.receiptId).toBeTruthy();
    receiptId = body.receiptId;
  });

  it('gets the receipt with hash chain fields', async () => {
    const res = await app.request(`/receipts/${receiptId}`, {
      headers: adminAuth,
    });
    expect(res.status).toBe(200);
    const receipt = await res.json() as any;

    expect(receipt.id).toBe(receiptId);
    expect(receipt.status).toBe('pending');
    expect(receipt.decision.outcome).toBe('allow');
    expect(receipt.receiptHash).toBeTruthy();
    // First receipt has no prev hash
    expect(receipt.prevReceiptHash).toBeUndefined();
  });

  it('claims the receipt for execution', async () => {
    const res = await app.request(`/receipts/${receiptId}/claim`, {
      method: 'POST',
      headers: executorAuth,
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.claimId).toBeTruthy();
    claimId = body.claimId;
  });

  it('finalizes execution with result', async () => {
    const res = await app.request(`/receipts/${receiptId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'executed',
        claimId,
        execution: {
          completedAt: new Date().toISOString(),
          durationMs: 42,
          result: { statusCode: 200, body: 'OK' },
        },
      }),
      headers: { ...json, ...executorAuth },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.status).toBe('executed');
  });

  it('verifies the hash chain is intact', async () => {
    const res = await app.request('/receipts/verify', { headers: adminAuth });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.chainIntact).toBe(true);
    expect(body.broken).toBe(0);
    expect(body.verified).toBeGreaterThanOrEqual(1);
  });

  // Second receipt chains to the first
  it('creates a second receipt that chains to the first', async () => {
    const envelope = makeEnvelope('http.request', 'https://example.org');
    const res = await app.request('/evaluate', {
      method: 'POST',
      body: JSON.stringify(envelope),
      headers: { ...json, ...ingestAuth },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    const secondReceiptId = body.receiptId;

    // Get the second receipt and check it chains to the first
    const getRes = await app.request(`/receipts/${secondReceiptId}`, {
      headers: adminAuth,
    });
    const receipt = await getRes.json() as any;
    expect(receipt.prevReceiptHash).toBeTruthy();
    expect(receipt.receiptHash).toBeTruthy();
    expect(receipt.prevReceiptHash).not.toBe(receipt.receiptHash);
  });

  it('chain is still intact after second receipt', async () => {
    const res = await app.request('/receipts/verify', { headers: adminAuth });
    const body = await res.json() as any;
    expect(body.chainIntact).toBe(true);
    expect(body.verified).toBeGreaterThanOrEqual(2);
  });
});

describe('E2E: Multi-party approval flow', () => {
  let approvalReceiptId: string;

  it('evaluates a require_approval action', async () => {
    const envelope = makeEnvelope('stripe.charges.create', 'stripe://charges');
    const res = await app.request('/evaluate', {
      method: 'POST',
      body: JSON.stringify(envelope),
      headers: { ...json, ...ingestAuth },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.decision.outcome).toBe('require_approval');
    approvalReceiptId = body.receiptId;
  });

  it('receipt is pending with requiredApprovals=2', async () => {
    const res = await app.request(`/receipts/${approvalReceiptId}`, {
      headers: adminAuth,
    });
    const receipt = await res.json() as any;
    expect(receipt.status).toBe('pending');
    expect(receipt.approval.status).toBe('pending');
    expect(receipt.approval.requiredApprovals).toBe(2);
  });

  it('claim is blocked before approval', async () => {
    const res = await app.request(`/receipts/${approvalReceiptId}/claim`, {
      method: 'POST',
      headers: executorAuth,
    });
    const body = await res.json() as any;
    expect(body.error).toBeTruthy();
  });

  it('first approval does not reach quorum', async () => {
    const res = await app.request(`/approvals/${approvalReceiptId}/respond`, {
      method: 'POST',
      body: JSON.stringify({
        responderId: 'alice',
        responderName: 'Alice',
        decision: 'approve',
        comment: 'Looks good',
      }),
      headers: { ...json, ...adminAuth },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.quorumReached).toBe(false);
    expect(body.approveCount).toBe(1);
    expect(body.requiredApprovals).toBe(2);
  });

  it('second approval reaches quorum', async () => {
    const res = await app.request(`/approvals/${approvalReceiptId}/respond`, {
      method: 'POST',
      body: JSON.stringify({
        responderId: 'bob',
        responderName: 'Bob',
        decision: 'approve',
      }),
      headers: { ...json, ...adminAuth },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.quorumReached).toBe(true);
    expect(body.approveCount).toBe(2);
  });

  it('receipt is now approved and claimable', async () => {
    const res = await app.request(`/receipts/${approvalReceiptId}/claim`, {
      method: 'POST',
      headers: executorAuth,
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.claimId).toBeTruthy();
  });

  it('approval status endpoint shows quorum reached', async () => {
    const res = await app.request(`/approvals/${approvalReceiptId}`, {
      headers: adminAuth,
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.status).toBe('approved');
    expect(body.quorumReached).toBe(true);
    expect(body.responses).toHaveLength(2);
  });

  it('duplicate response from same responder is rejected', async () => {
    const res = await app.request(`/approvals/${approvalReceiptId}/respond`, {
      method: 'POST',
      body: JSON.stringify({
        responderId: 'alice',
        decision: 'approve',
      }),
      headers: { ...json, ...adminAuth },
    });
    expect(res.status).toBe(400);
  });
});

describe('E2E: Denied action', () => {
  it('denies an action not matching any rule', async () => {
    const envelope = makeEnvelope('unknown.action', 'unknown://resource');
    const res = await app.request('/evaluate', {
      method: 'POST',
      body: JSON.stringify(envelope),
      headers: { ...json, ...ingestAuth },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.decision.outcome).toBe('deny');
  });
});
