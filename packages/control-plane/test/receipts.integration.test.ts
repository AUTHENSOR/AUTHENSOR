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

// Test admin token and auth header
const adminToken = 'test_admin_token';
const adminKeyHash = crypto.createHash('sha256').update(adminToken).digest('hex');
const authHeaders = { Authorization: `Bearer ${adminToken}` };

const envelope = {
  id: '33333333-3333-3333-3333-333333333333',
  timestamp: new Date().toISOString(),
  action: {
    type: 'http.request',
    resource: 'https://example.com',
    operation: 'read',
    parameters: { method: 'GET' },
  },
  principal: {
    type: 'agent',
    id: 'agent-integration',
  },
  context: {
    environment: 'development',
  },
};

describe('control-plane receipts flow (pg-mem)', () => {
  beforeAll(async () => {
    await initDb();
    // Create admin key for auth
    await db.query(
      `INSERT INTO api_keys (id, name, role, key_hash) VALUES ($1, $2, $3, $4)`,
      [crypto.randomUUID(), 'Test Admin', 'admin', adminKeyHash]
    );
  });

  it('creates, lists, and updates receipts', async () => {
    const evaluateResponse = await app.request('/evaluate', {
      method: 'POST',
      body: JSON.stringify(envelope),
      headers: { 'Content-Type': 'application/json', ...authHeaders },
    });

    expect(evaluateResponse.status).toBe(200);
    const evaluation = await evaluateResponse.json();
    expect(evaluation.receiptId).toBeTruthy();

    const listResponse = await app.request('/receipts', { headers: authHeaders });
    expect(listResponse.status).toBe(200);
    const list = await listResponse.json();
    expect(list.receipts.length).toBeGreaterThan(0);

    const receiptId = evaluation.receiptId as string;
    const claimResp = await app.request(`/receipts/${receiptId}/claim`, {
      method: 'POST',
      headers: authHeaders,
    });
    expect(claimResp.status).toBe(200);
    const claim = await claimResp.json();

    const patchResponse = await app.request(`/receipts/${receiptId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        claimId: claim.claimId,
        status: 'executed',
        execution: {
          completedAt: new Date().toISOString(),
          durationMs: 5,
          result: { ok: true },
        },
      }),
      headers: { 'Content-Type': 'application/json', ...authHeaders },
    });
    expect(patchResponse.status).toBe(200);
    const patched = await patchResponse.json();
    expect(patched.status).toBe('executed');
    expect(patched.execution?.result?.ok).toBe(true);
  });
});
