/**
 * Receipt Chain Tests
 *
 * Tests for cross-agent receipt correlation:
 * - parentReceiptId persistence in receipts
 * - GET /receipts/:id/chain endpoint
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

// Helper to hash tokens
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

describe('Receipt Chain (cross-agent correlation)', () => {
  let adminToken: string;

  beforeAll(async () => {
    await initDb();
  });

  beforeEach(async () => {
    await db.query('DELETE FROM api_keys');
    // Clear parent references first to avoid FK constraint violations
    await db.query('UPDATE receipts SET parent_receipt_id = NULL');
    await db.query('DELETE FROM receipts');

    adminToken = 'authensor_admin_token';
    await db.query(
      `INSERT INTO api_keys (id, name, role, key_hash) VALUES ($1, $2, $3, $4)`,
      [crypto.randomUUID(), 'Admin Key', 'admin', hashToken(adminToken)]
    );
  });

  describe('parentReceiptId persistence', () => {
    it('stores parentReceiptId when provided in envelope context', async () => {
      // Create the parent receipt first
      const parentEnvelopeId = crypto.randomUUID();
      const parentResponse = await app.request('/evaluate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          id: parentEnvelopeId,
          timestamp: new Date().toISOString(),
          action: { type: 'plan.create', resource: 'plan://tasks' },
          principal: { type: 'agent', id: 'orchestrator' },
          context: { environment: 'development' },
        }),
      });

      expect(parentResponse.status).toBe(200);
      const parentResult = await parentResponse.json();
      const parentReceiptId = parentResult.receiptId;

      // Create child receipt referencing parent
      const childEnvelopeId = crypto.randomUUID();
      const childResponse = await app.request('/evaluate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          id: childEnvelopeId,
          timestamp: new Date().toISOString(),
          action: { type: 'web.search', resource: 'https://example.com' },
          principal: { type: 'agent', id: 'researcher' },
          context: {
            environment: 'development',
            parentReceiptId,
          },
        }),
      });

      expect(childResponse.status).toBe(200);
      const childResult = await childResponse.json();

      // Fetch the child receipt and verify parentReceiptId
      const receiptResponse = await app.request(
        `/receipts/${childResult.receiptId}`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${adminToken}` },
        },
      );

      expect(receiptResponse.status).toBe(200);
      const receipt = await receiptResponse.json();
      expect(receipt.parentReceiptId).toBe(parentReceiptId);
    });

    it('stores undefined parentReceiptId when not provided', async () => {
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
          action: { type: 'test.action', resource: 'test://resource' },
          principal: { type: 'agent', id: 'test-agent' },
          context: { environment: 'development' },
        }),
      });

      expect(response.status).toBe(200);
      const result = await response.json();

      const receiptResponse = await app.request(
        `/receipts/${result.receiptId}`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${adminToken}` },
        },
      );

      expect(receiptResponse.status).toBe(200);
      const receipt = await receiptResponse.json();
      expect(receipt.parentReceiptId).toBeUndefined();
    });
  });

  describe('GET /receipts/:id/chain', () => {
    it('returns 404 for nonexistent receipt', async () => {
      const response = await app.request(
        `/receipts/${crypto.randomUUID()}/chain`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${adminToken}` },
        },
      );

      expect(response.status).toBe(404);
    });

    it('returns chain with single receipt (no parent, no children)', async () => {
      const envelopeId = crypto.randomUUID();
      const evalResponse = await app.request('/evaluate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          id: envelopeId,
          timestamp: new Date().toISOString(),
          action: { type: 'test.action', resource: 'test://resource' },
          principal: { type: 'agent', id: 'test-agent' },
          context: { environment: 'development' },
        }),
      });

      const { receiptId } = await evalResponse.json();

      const chainResponse = await app.request(
        `/receipts/${receiptId}/chain`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${adminToken}` },
        },
      );

      expect(chainResponse.status).toBe(200);
      const body = await chainResponse.json();
      expect(body.receiptId).toBe(receiptId);
      expect(body.chain).toHaveLength(1);
      expect(body.chainLength).toBe(1);
      expect(body.chain[0].id).toBe(receiptId);
    });

    it('returns full chain for multi-level parent-child relationships', async () => {
      // Create root receipt
      const rootEnvelopeId = crypto.randomUUID();
      const rootResponse = await app.request('/evaluate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          id: rootEnvelopeId,
          timestamp: new Date().toISOString(),
          action: { type: 'plan.create', resource: 'plan://tasks' },
          principal: { type: 'agent', id: 'orchestrator' },
          context: { environment: 'development' },
        }),
      });
      const { receiptId: rootReceiptId } = await rootResponse.json();

      // Create child receipt
      const childEnvelopeId = crypto.randomUUID();
      const childResponse = await app.request('/evaluate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          id: childEnvelopeId,
          timestamp: new Date().toISOString(),
          action: { type: 'web.search', resource: 'https://example.com' },
          principal: { type: 'agent', id: 'researcher' },
          context: {
            environment: 'development',
            parentReceiptId: rootReceiptId,
          },
        }),
      });
      const { receiptId: childReceiptId } = await childResponse.json();

      // Create grandchild receipt
      const grandchildEnvelopeId = crypto.randomUUID();
      const grandchildResponse = await app.request('/evaluate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          id: grandchildEnvelopeId,
          timestamp: new Date().toISOString(),
          action: { type: 'text.summarize', resource: 'text://results' },
          principal: { type: 'agent', id: 'summarizer' },
          context: {
            environment: 'development',
            parentReceiptId: childReceiptId,
          },
        }),
      });
      const { receiptId: grandchildReceiptId } = await grandchildResponse.json();

      // Query chain from the middle (child)
      const chainResponse = await app.request(
        `/receipts/${childReceiptId}/chain`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${adminToken}` },
        },
      );

      expect(chainResponse.status).toBe(200);
      const body = await chainResponse.json();
      expect(body.chainLength).toBe(3);

      const ids = body.chain.map((r: { id: string }) => r.id);
      // Should contain all three, ordered root to leaf
      expect(ids).toContain(rootReceiptId);
      expect(ids).toContain(childReceiptId);
      expect(ids).toContain(grandchildReceiptId);
      expect(ids.indexOf(rootReceiptId)).toBeLessThan(ids.indexOf(childReceiptId));
      expect(ids.indexOf(childReceiptId)).toBeLessThan(ids.indexOf(grandchildReceiptId));
    });

    it('requires admin role', async () => {
      const executorToken = 'authensor_executor_token';
      await db.query(
        `INSERT INTO api_keys (id, name, role, key_hash) VALUES ($1, $2, $3, $4)`,
        [crypto.randomUUID(), 'Executor Key', 'executor', hashToken(executorToken)]
      );

      const response = await app.request(
        `/receipts/${crypto.randomUUID()}/chain`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${executorToken}` },
        },
      );

      expect(response.status).toBe(403);
    });

    it('returns chain with fan-out (multiple children)', async () => {
      // Create root
      const rootEnvelopeId = crypto.randomUUID();
      const rootResponse = await app.request('/evaluate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          id: rootEnvelopeId,
          timestamp: new Date().toISOString(),
          action: { type: 'plan.create', resource: 'plan://tasks' },
          principal: { type: 'agent', id: 'orchestrator' },
          context: { environment: 'development' },
        }),
      });
      const { receiptId: rootReceiptId } = await rootResponse.json();

      // Create two children from the same parent
      const child1EnvelopeId = crypto.randomUUID();
      await app.request('/evaluate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          id: child1EnvelopeId,
          timestamp: new Date().toISOString(),
          action: { type: 'web.search', resource: 'https://example.com' },
          principal: { type: 'agent', id: 'agent-b' },
          context: {
            environment: 'development',
            parentReceiptId: rootReceiptId,
          },
        }),
      });

      const child2EnvelopeId = crypto.randomUUID();
      await app.request('/evaluate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          id: child2EnvelopeId,
          timestamp: new Date().toISOString(),
          action: { type: 'db.query', resource: 'db://users' },
          principal: { type: 'agent', id: 'agent-c' },
          context: {
            environment: 'development',
            parentReceiptId: rootReceiptId,
          },
        }),
      });

      // Query chain from root
      const chainResponse = await app.request(
        `/receipts/${rootReceiptId}/chain`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${adminToken}` },
        },
      );

      expect(chainResponse.status).toBe(200);
      const body = await chainResponse.json();
      expect(body.chainLength).toBe(3); // root + 2 children
    });
  });
});
