/**
 * TOCTOU (Time-of-Check-Time-of-Use) Mitigation Tests
 *
 * Tests for re-evaluating approved actions against the current policy at claim time.
 * This closes the window where an approved action could be executed after the policy
 * has changed to deny it (CVE-2026 pattern).
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { newDb } from 'pg-mem';
import crypto from 'crypto';

// Mock pg with an in-memory adapter before importing app/db
const mem = newDb();
const pg = mem.adapters.createPg();
vi.mock('pg', () => pg);

const { initDb, db } = await import('../db.js');
const { createApp } = await import('../app.js');

const app = createApp();

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

describe('TOCTOU Mitigation', () => {
  const adminToken = 'authensor_admin_toctou_test';
  const executorToken = 'authensor_executor_toctou_test';

  beforeAll(async () => {
    await initDb();
  });

  beforeEach(async () => {
    await db.query('DELETE FROM api_keys');
    await db.query('DELETE FROM receipts');
    await db.query('DELETE FROM policies');
    await db.query('DELETE FROM active_policies');

    // Create admin and executor keys
    await db.query(
      `INSERT INTO api_keys (id, name, role, key_hash) VALUES ($1, $2, $3, $4)`,
      [crypto.randomUUID(), 'Test Admin', 'admin', hashToken(adminToken)]
    );
    await db.query(
      `INSERT INTO api_keys (id, name, role, key_hash) VALUES ($1, $2, $3, $4)`,
      [crypto.randomUUID(), 'Test Executor', 'executor', hashToken(executorToken)]
    );
  });

  afterEach(() => {
    // Reset TOCTOU env var to default
    delete process.env.AUTHENSOR_TOCTOU_REEVALUATE;
  });

  /**
   * Helper: create a policy that requires approval for a specific action type.
   */
  async function createApprovalPolicy(
    policyId: string,
    version: string,
    actionType: string,
    effect: 'require_approval' | 'allow' | 'deny' = 'require_approval'
  ) {
    const policy = {
      id: policyId,
      name: `Test Policy ${policyId}`,
      version,
      rules: [
        {
          id: `rule-${effect}`,
          effect,
          description: `${effect} for ${actionType}`,
          condition: { 'action.type': { equals: actionType } },
          ...(effect === 'require_approval'
            ? { approvalConfig: { requiredApprovals: 1, expiresIn: '24h' } }
            : {}),
        },
      ],
      defaultEffect: 'deny' as const,
    };

    await app.request('/policies', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(policy),
    });

    await app.request('/policies/active', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ policy_id: policyId, version }),
    });
  }

  /**
   * Helper: evaluate an envelope (creates a receipt).
   */
  async function evaluateAction(actionType: string) {
    const envelopeId = crypto.randomUUID();
    const response = await app.request('/evaluate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        id: envelopeId,
        timestamp: new Date().toISOString(),
        action: { type: actionType, resource: 'test://resource' },
        principal: { type: 'agent', id: 'test-agent' },
        context: { environment: 'development' },
      }),
    });

    expect(response.status).toBe(200);
    return response.json();
  }

  /**
   * Helper: approve a receipt.
   */
  async function approveReceipt(receiptId: string) {
    const response = await app.request(`/approvals/${receiptId}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(response.status).toBe(200);
    return response.json();
  }

  /**
   * Helper: claim a receipt.
   */
  async function claimReceipt(receiptId: string) {
    return app.request(`/receipts/${receiptId}/claim`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${executorToken}` },
    });
  }

  describe('Approved action with unchanged policy', () => {
    it('executes normally when policy has not changed', async () => {
      // 1. Create policy requiring approval
      await createApprovalPolicy('test-policy', '1.0.0', 'payment.send');

      // 2. Evaluate action -> require_approval
      const evalResult = await evaluateAction('payment.send');
      expect(evalResult.decision.outcome).toBe('require_approval');

      // 3. Approve the receipt
      await approveReceipt(evalResult.receiptId);

      // 4. Claim the receipt — policy unchanged, should succeed
      const claimResponse = await claimReceipt(evalResult.receiptId);
      expect(claimResponse.status).toBe(200);

      const claimBody = await claimResponse.json();
      expect(claimBody.claimId).toBeDefined();

      // 5. Verify re-evaluation metadata is recorded
      const receiptResponse = await app.request(`/receipts/${evalResult.receiptId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const receipt = await receiptResponse.json();
      expect(receipt.approval?.reEvaluatedAt).toBeDefined();
      expect(receipt.approval?.policyChangedSinceApproval).toBe(false);
    });
  });

  describe('Approved action with changed policy that now denies', () => {
    it('rejects the claim when policy changed to deny', async () => {
      // 1. Create policy requiring approval for payment.send
      await createApprovalPolicy('test-policy', '1.0.0', 'payment.send');

      // 2. Evaluate action -> require_approval
      const evalResult = await evaluateAction('payment.send');
      expect(evalResult.decision.outcome).toBe('require_approval');

      // 3. Approve the receipt
      await approveReceipt(evalResult.receiptId);

      // 4. Change the policy to deny payment.send
      await createApprovalPolicy('test-policy', '2.0.0', 'payment.send', 'deny');

      // 5. Attempt to claim — should be rejected
      const claimResponse = await claimReceipt(evalResult.receiptId);
      expect(claimResponse.status).toBe(403);

      const claimBody = await claimResponse.json();
      expect(claimBody.error.code).toBe('TOCTOU_POLICY_CHANGED');
      expect(claimBody.error.message).toContain('Policy changed since approval');
      expect(claimBody.error.message).toContain('deny');
    });

    it('records TOCTOU rejection in the receipt', async () => {
      // 1. Create policy requiring approval
      await createApprovalPolicy('test-policy', '1.0.0', 'payment.send');

      // 2. Evaluate + approve
      const evalResult = await evaluateAction('payment.send');
      await approveReceipt(evalResult.receiptId);

      // 3. Change policy to deny
      await createApprovalPolicy('test-policy', '2.0.0', 'payment.send', 'deny');

      // 4. Attempt claim (will fail)
      await claimReceipt(evalResult.receiptId);

      // 5. Verify receipt records TOCTOU rejection
      const receiptResponse = await app.request(`/receipts/${evalResult.receiptId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const receipt = await receiptResponse.json();

      expect(receipt.status).toBe('cancelled');
      expect(receipt.approval?.toctouRejectedAt).toBeDefined();
      expect(receipt.approval?.toctouReason).toContain('Policy changed since approval');
    });
  });

  describe('Approved action with changed policy that still allows', () => {
    it('executes when new policy still allows the action', async () => {
      // 1. Create policy requiring approval for payment.send
      await createApprovalPolicy('test-policy', '1.0.0', 'payment.send');

      // 2. Evaluate action -> require_approval
      const evalResult = await evaluateAction('payment.send');
      expect(evalResult.decision.outcome).toBe('require_approval');

      // 3. Approve the receipt
      await approveReceipt(evalResult.receiptId);

      // 4. Change policy to allow payment.send (no longer requires approval)
      await createApprovalPolicy('test-policy', '2.0.0', 'payment.send', 'allow');

      // 5. Claim — should succeed because new policy still allows
      const claimResponse = await claimReceipt(evalResult.receiptId);
      expect(claimResponse.status).toBe(200);

      const claimBody = await claimResponse.json();
      expect(claimBody.claimId).toBeDefined();

      // 6. Verify re-evaluation recorded policy change
      const receiptResponse = await app.request(`/receipts/${evalResult.receiptId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const receipt = await receiptResponse.json();
      expect(receipt.approval?.reEvaluatedAt).toBeDefined();
      expect(receipt.approval?.policyChangedSinceApproval).toBe(true);
    });
  });

  describe('TOCTOU can be disabled via env var', () => {
    it('skips re-evaluation when AUTHENSOR_TOCTOU_REEVALUATE=false', async () => {
      process.env.AUTHENSOR_TOCTOU_REEVALUATE = 'false';

      // 1. Create policy requiring approval
      await createApprovalPolicy('test-policy', '1.0.0', 'payment.send');

      // 2. Evaluate + approve
      const evalResult = await evaluateAction('payment.send');
      await approveReceipt(evalResult.receiptId);

      // 3. Change policy to deny
      await createApprovalPolicy('test-policy', '2.0.0', 'payment.send', 'deny');

      // 4. Claim — should succeed because TOCTOU is disabled
      const claimResponse = await claimReceipt(evalResult.receiptId);
      expect(claimResponse.status).toBe(200);

      const claimBody = await claimResponse.json();
      expect(claimBody.claimId).toBeDefined();
    });
  });

  describe('Policy removed since approval', () => {
    it('rejects the claim when active policy is removed', async () => {
      // 1. Create policy requiring approval
      await createApprovalPolicy('test-policy', '1.0.0', 'payment.send');

      // 2. Evaluate + approve
      const evalResult = await evaluateAction('payment.send');
      await approveReceipt(evalResult.receiptId);

      // 3. Remove the active policy pointer
      await db.query('DELETE FROM active_policies');

      // 4. Claim — should be rejected (no active policy = fail closed)
      const claimResponse = await claimReceipt(evalResult.receiptId);
      expect(claimResponse.status).toBe(403);

      const claimBody = await claimResponse.json();
      expect(claimBody.error.code).toBe('TOCTOU_POLICY_CHANGED');
      expect(claimBody.error.message).toContain('No active policy');
    });
  });

  describe('Allow-decision receipts skip TOCTOU', () => {
    it('does not re-evaluate for allow decisions (only require_approval)', async () => {
      // Create a receipt that was directly allowed (not via approval)
      const receiptId = crypto.randomUUID();
      const envelopeId = crypto.randomUUID();

      await db.query(
        `INSERT INTO receipts (id, envelope_id, status, decision_outcome, tool_name, envelope, decision, created_at, updated_at)
         VALUES ($1, $2, 'pending', 'allow', 'payment', $3, $4, now(), now())`,
        [
          receiptId,
          envelopeId,
          JSON.stringify({
            id: envelopeId,
            timestamp: new Date().toISOString(),
            action: { type: 'payment.send', resource: 'test://resource' },
            principal: { type: 'agent', id: 'test-agent' },
            context: { environment: 'development' },
          }),
          JSON.stringify({
            outcome: 'allow',
            evaluatedAt: new Date().toISOString(),
            policyId: 'test-policy',
            policyVersion: '1.0.0',
          }),
        ]
      );

      // Even if no active policy exists, claim should succeed for allow decisions
      // because TOCTOU only applies to require_approval
      const claimResponse = await claimReceipt(receiptId);
      expect(claimResponse.status).toBe(200);
    });
  });
});
