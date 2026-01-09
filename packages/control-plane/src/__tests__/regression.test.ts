/**
 * Regression Tests
 *
 * Tests for bugs found during partner readiness testing.
 * These tests ensure the bugs never come back.
 *
 * BUG-001: Invalid UUID in :id routes caused 500 (PostgreSQL error leak)
 * BUG-002: Race condition in claim - parallel claims both succeeded
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
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

describe('Regression Tests', () => {
  const adminToken = 'authensor_admin_regression_test';
  const executorToken = 'authensor_executor_regression_test';

  beforeAll(async () => {
    await initDb();
  });

  beforeEach(async () => {
    await db.query('DELETE FROM api_keys');
    await db.query('DELETE FROM receipts');

    // Create admin key
    await db.query(
      `INSERT INTO api_keys (id, name, role, key_hash) VALUES ($1, $2, $3, $4)`,
      [crypto.randomUUID(), 'Test Admin', 'admin', hashToken(adminToken)]
    );

    // Create executor key
    await db.query(
      `INSERT INTO api_keys (id, name, role, key_hash) VALUES ($1, $2, $3, $4)`,
      [crypto.randomUUID(), 'Test Executor', 'executor', hashToken(executorToken)]
    );
  });

  describe('BUG-001: UUID Validation on :id Routes', () => {
    const invalidUUIDs = [
      'not-a-uuid',
      '12345',
      'invalid',
      '00000000-0000-0000-0000-00000000000', // missing digit
      '00000000-0000-0000-0000-0000000000000', // extra digit
      'GGGGGGGG-GGGG-GGGG-GGGG-GGGGGGGGGGGG', // invalid hex
      '../../../etc/passwd', // path traversal attempt
      "'; DROP TABLE receipts; --", // SQL injection attempt
    ];

    describe('GET /receipts/:id', () => {
      it.each(invalidUUIDs)('returns 400 for invalid UUID: %s', async (invalidId) => {
        const response = await app.request(`/receipts/${encodeURIComponent(invalidId)}`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        });

        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.error).toBe('Invalid receipt ID format');
        // Ensure no SQL/stack trace leak
        expect(JSON.stringify(body)).not.toContain('PostgreSQL');
        expect(JSON.stringify(body)).not.toContain('stack');
        expect(JSON.stringify(body)).not.toContain('uuid.c');
      });
    });

    describe('GET /receipts/:id/view', () => {
      it.each(invalidUUIDs)('returns 400 for invalid UUID: %s', async (invalidId) => {
        const response = await app.request(`/receipts/${encodeURIComponent(invalidId)}/view`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        });

        expect(response.status).toBe(400);
        const body = await response.text();
        expect(body).toContain('Invalid receipt ID format');
        expect(body).not.toContain('PostgreSQL');
      });
    });

    describe('PATCH /receipts/:id', () => {
      it.each(invalidUUIDs)('returns 400 for invalid UUID: %s', async (invalidId) => {
        const response = await app.request(`/receipts/${encodeURIComponent(invalidId)}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: 'executed' }),
        });

        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.error).toBe('Invalid receipt ID format');
      });
    });

    describe('POST /receipts/:id/claim', () => {
      it.each(invalidUUIDs)('returns 400 for invalid UUID: %s', async (invalidId) => {
        const response = await app.request(`/receipts/${encodeURIComponent(invalidId)}/claim`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${executorToken}` },
        });

        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.error).toBe('Invalid receipt ID format');
      });
    });

    describe('POST /approvals/:id/approve', () => {
      it.each(invalidUUIDs)('returns 400 for invalid UUID: %s', async (invalidId) => {
        const response = await app.request(`/approvals/${encodeURIComponent(invalidId)}/approve`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${adminToken}` },
        });

        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.error).toBe('Invalid receipt ID format');
      });
    });

    describe('POST /approvals/:id/reject', () => {
      it.each(invalidUUIDs)('returns 400 for invalid UUID: %s', async (invalidId) => {
        const response = await app.request(`/approvals/${encodeURIComponent(invalidId)}/reject`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${adminToken}` },
        });

        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.error).toBe('Invalid receipt ID format');
      });
    });

    describe('POST /approvals/:id/expire', () => {
      it.each(invalidUUIDs)('returns 400 for invalid UUID: %s', async (invalidId) => {
        const response = await app.request(`/approvals/${encodeURIComponent(invalidId)}/expire`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${adminToken}` },
        });

        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.error).toBe('Invalid receipt ID format');
      });
    });

    describe('POST /keys/:id/revoke', () => {
      it.each(invalidUUIDs)('returns 400 for invalid UUID: %s', async (invalidId) => {
        const response = await app.request(`/keys/${encodeURIComponent(invalidId)}/revoke`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${adminToken}` },
        });

        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.error.code).toBe('INVALID_INPUT');
      });
    });

    describe('POST /keys/:id/rotate', () => {
      it.each(invalidUUIDs)('returns 400 for invalid UUID: %s', async (invalidId) => {
        const response = await app.request(`/keys/${encodeURIComponent(invalidId)}/rotate`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${adminToken}` },
        });

        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.error.code).toBe('INVALID_INPUT');
      });
    });

    it('accepts valid UUIDs', async () => {
      const validUUID = crypto.randomUUID();
      const response = await app.request(`/receipts/${validUUID}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      // Should be 404 (not found) not 400 (invalid format)
      expect(response.status).toBe(404);
    });
  });

  describe('BUG-002: Claim Race Condition', () => {
    async function createTestReceipt(): Promise<string> {
      const receiptId = crypto.randomUUID();
      const envelopeId = crypto.randomUUID();

      await db.query(
        `INSERT INTO receipts (id, envelope_id, status, decision_outcome, envelope, decision, created_at, updated_at)
         VALUES ($1, $2, 'pending', 'allow', $3, $4, now(), now())`,
        [
          receiptId,
          envelopeId,
          JSON.stringify({
            id: envelopeId,
            timestamp: new Date().toISOString(),
            action: { type: 'test.action', resource: 'test://resource' },
            principal: { type: 'agent', id: 'test-agent' },
            context: {},
          }),
          JSON.stringify({
            outcome: 'allow',
            evaluatedAt: new Date().toISOString(),
            policyId: 'test-policy',
            policyVersion: '1.0.0',
            reason: 'Test policy',
            matchedRules: [],
          }),
        ]
      );

      return receiptId;
    }

    it('allows exactly one winner when multiple claims race', async () => {
      const receiptId = await createTestReceipt();

      // Fire 20 parallel claim requests
      const claimPromises = Array.from({ length: 20 }, () =>
        app.request(`/receipts/${receiptId}/claim`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${executorToken}` },
        })
      );

      const responses = await Promise.all(claimPromises);
      const statuses = responses.map((r) => r.status);

      // Count successes and failures
      const successes = statuses.filter((s) => s === 200);
      const conflicts = statuses.filter((s) => s === 409);

      // Exactly one should succeed
      expect(successes.length).toBe(1);

      // All others should be conflicts (already claimed)
      expect(conflicts.length).toBe(19);

      // Verify the receipt has exactly one claim
      const { rows } = await db.query('SELECT claim_id FROM receipts WHERE id = $1', [receiptId]);
      expect(rows[0].claim_id).toBeTruthy();
    });

    it('returns consistent error shape for claim conflicts', async () => {
      const receiptId = await createTestReceipt();

      // First claim succeeds
      const firstResponse = await app.request(`/receipts/${receiptId}/claim`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${executorToken}` },
      });
      expect(firstResponse.status).toBe(200);
      const firstBody = await firstResponse.json();
      expect(firstBody.claimId).toBeTruthy();

      // Second claim fails with 409
      const secondResponse = await app.request(`/receipts/${receiptId}/claim`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${executorToken}` },
      });
      expect(secondResponse.status).toBe(409);

      const secondBody = await secondResponse.json();
      expect(secondBody.error).toBe('Receipt already claimed');
      expect(secondBody.retryAfterSeconds).toBeGreaterThan(0);
    });

    it('allows re-claim after TTL expires', async () => {
      const receiptId = await createTestReceipt();

      // First claim
      const firstResponse = await app.request(`/receipts/${receiptId}/claim`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${executorToken}` },
      });
      expect(firstResponse.status).toBe(200);

      // Manually expire the claim in the database
      await db.query(
        `UPDATE receipts SET claim_expires_at = now() - interval '1 second' WHERE id = $1`,
        [receiptId]
      );

      // Second claim should succeed after expiry
      const secondResponse = await app.request(`/receipts/${receiptId}/claim`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${executorToken}` },
      });
      expect(secondResponse.status).toBe(200);

      const body = await secondResponse.json();
      expect(body.claimId).toBeTruthy();
    });

    it('prevents double finalization with same claimId', async () => {
      const receiptId = await createTestReceipt();

      // Claim
      const claimResponse = await app.request(`/receipts/${receiptId}/claim`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${executorToken}` },
      });
      expect(claimResponse.status).toBe(200);
      const claimBody = await claimResponse.json();
      const claimId = claimBody.claimId;
      expect(claimId).toBeTruthy();

      // First finalize succeeds
      const firstFinalize = await app.request(`/receipts/${receiptId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${executorToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'executed',
          claimId,
          execution: {
            completedAt: new Date().toISOString(),
            result: { success: true },
          },
        }),
      });

      // If failing, log the error for debugging
      if (firstFinalize.status !== 200) {
        const errorBody = await firstFinalize.text();
        console.error('First finalize failed:', firstFinalize.status, errorBody);
      }
      expect(firstFinalize.status).toBe(200);

      // Second finalize with same claimId fails
      const secondFinalize = await app.request(`/receipts/${receiptId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${executorToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'executed',
          claimId,
          execution: {
            completedAt: new Date().toISOString(),
            result: { success: true },
          },
        }),
      });
      expect(secondFinalize.status).toBe(400);
    });
  });
});
