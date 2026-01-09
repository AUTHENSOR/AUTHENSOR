/**
 * Controls Tests
 *
 * Tests for kill switch and per-tool execution controls.
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

describe('Controls', () => {
  let adminToken: string;
  let executorToken: string;

  beforeAll(async () => {
    await initDb();
  });

  beforeEach(async () => {
    // Clear and reset data
    await db.query('DELETE FROM api_keys');
    await db.query('DELETE FROM receipts');
    await db.query(
      'UPDATE controls SET disable_execution = false, disable_http = false, disable_github = false, disable_stripe = false'
    );

    // Create admin and executor keys
    adminToken = 'authensor_admin_token';
    executorToken = 'authensor_executor_token';

    await db.query(
      `INSERT INTO api_keys (id, name, role, key_hash) VALUES ($1, $2, $3, $4)`,
      [crypto.randomUUID(), 'Admin Key', 'admin', hashToken(adminToken)]
    );
    await db.query(
      `INSERT INTO api_keys (id, name, role, key_hash) VALUES ($1, $2, $3, $4)`,
      [crypto.randomUUID(), 'Executor Key', 'executor', hashToken(executorToken)]
    );
  });

  describe('GET /controls', () => {
    it('admin can read controls', async () => {
      const response = await app.request('/controls', {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toHaveProperty('disable_execution', false);
      expect(body).toHaveProperty('disable_http', false);
      expect(body).toHaveProperty('disable_github', false);
      expect(body).toHaveProperty('disable_stripe', false);
    });

    it('executor can read controls', async () => {
      const response = await app.request('/controls', {
        method: 'GET',
        headers: { Authorization: `Bearer ${executorToken}` },
      });

      expect(response.status).toBe(200);
    });

    it('ingest cannot read controls', async () => {
      const ingestToken = 'authensor_ingest_token';
      await db.query(
        `INSERT INTO api_keys (id, name, role, key_hash) VALUES ($1, $2, $3, $4)`,
        [crypto.randomUUID(), 'Ingest Key', 'ingest', hashToken(ingestToken)]
      );

      const response = await app.request('/controls', {
        method: 'GET',
        headers: { Authorization: `Bearer ${ingestToken}` },
      });

      expect(response.status).toBe(403);
    });
  });

  describe('POST /controls', () => {
    it('admin can update controls', async () => {
      const response = await app.request('/controls', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ disable_execution: true }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.disable_execution).toBe(true);
    });

    it('executor cannot update controls', async () => {
      const response = await app.request('/controls', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${executorToken}`,
        },
        body: JSON.stringify({ disable_execution: true }),
      });

      expect(response.status).toBe(403);
    });
  });

  describe('Claim blocked by controls', () => {
    it('claim blocked when disable_execution=true', async () => {
      // First create a receipt via evaluate
      const envelopeId = crypto.randomUUID();
      const evaluateResponse = await app.request('/evaluate', {
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

      expect(evaluateResponse.status).toBe(200);
      const evalResult = await evaluateResponse.json();
      const receiptId = evalResult.receiptId;

      // Enable kill switch
      await db.query('UPDATE controls SET disable_execution = true');

      // Try to claim - should be blocked
      const claimResponse = await app.request(`/receipts/${receiptId}/claim`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${executorToken}` },
      });

      expect(claimResponse.status).toBe(403);
      const claimBody = await claimResponse.json();
      expect(claimBody.error.code).toBe('EXECUTION_DISABLED');
    });

    it('claim blocked when disable_http=true for http tool', async () => {
      // Create a receipt with http tool
      const receiptId = crypto.randomUUID();
      const envelopeId = crypto.randomUUID();

      await db.query(
        `INSERT INTO receipts (id, envelope_id, status, decision_outcome, tool_name, envelope, decision)
         VALUES ($1, $2, 'pending', 'allow', 'http', $3, $4)`,
        [
          receiptId,
          envelopeId,
          JSON.stringify({
            id: envelopeId,
            timestamp: new Date().toISOString(),
            action: { type: 'http.request', resource: 'https://example.com' },
            principal: { type: 'agent', id: 'test-agent' },
            context: { environment: 'development' },
          }),
          JSON.stringify({ outcome: 'allow' }),
        ]
      );

      // Disable http tool
      await db.query('UPDATE controls SET disable_http = true');

      // Try to claim - should be blocked
      const claimResponse = await app.request(`/receipts/${receiptId}/claim`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${executorToken}` },
      });

      expect(claimResponse.status).toBe(403);
      const claimBody = await claimResponse.json();
      expect(claimBody.error.code).toBe('TOOL_DISABLED');
    });

    it('claim blocked when disable_github=true for github tool', async () => {
      // Create a receipt with github tool
      const receiptId = crypto.randomUUID();
      const envelopeId = crypto.randomUUID();

      await db.query(
        `INSERT INTO receipts (id, envelope_id, status, decision_outcome, tool_name, envelope, decision)
         VALUES ($1, $2, 'pending', 'allow', 'github', $3, $4)`,
        [
          receiptId,
          envelopeId,
          JSON.stringify({
            id: envelopeId,
            timestamp: new Date().toISOString(),
            action: { type: 'github.create_issue', resource: 'github://repo/issues' },
            principal: { type: 'agent', id: 'test-agent' },
            context: { environment: 'development' },
          }),
          JSON.stringify({ outcome: 'allow' }),
        ]
      );

      // Disable github tool
      await db.query('UPDATE controls SET disable_github = true');

      // Try to claim - should be blocked
      const claimResponse = await app.request(`/receipts/${receiptId}/claim`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${executorToken}` },
      });

      expect(claimResponse.status).toBe(403);
      const claimBody = await claimResponse.json();
      expect(claimBody.error.code).toBe('TOOL_DISABLED');
    });

    it('claim succeeds when tool not disabled', async () => {
      // Create a receipt with http tool
      const receiptId = crypto.randomUUID();
      const envelopeId = crypto.randomUUID();

      await db.query(
        `INSERT INTO receipts (id, envelope_id, status, decision_outcome, tool_name, envelope, decision)
         VALUES ($1, $2, 'pending', 'allow', 'http', $3, $4)`,
        [
          receiptId,
          envelopeId,
          JSON.stringify({
            id: envelopeId,
            timestamp: new Date().toISOString(),
            action: { type: 'http.request', resource: 'https://example.com' },
            principal: { type: 'agent', id: 'test-agent' },
            context: { environment: 'development' },
          }),
          JSON.stringify({ outcome: 'allow' }),
        ]
      );

      // Don't disable anything - claim should succeed
      const claimResponse = await app.request(`/receipts/${receiptId}/claim`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${executorToken}` },
      });

      expect(claimResponse.status).toBe(200);
      const claimBody = await claimResponse.json();
      expect(claimBody.claimId).toBeDefined();
    });
  });

  describe('GET /controls/check', () => {
    it('returns allowed=true when tool is enabled', async () => {
      const response = await app.request('/controls/check?tool=http', {
        method: 'GET',
        headers: { Authorization: `Bearer ${executorToken}` },
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.allowed).toBe(true);
    });

    it('returns allowed=false when tool is disabled', async () => {
      await db.query('UPDATE controls SET disable_http = true');

      const response = await app.request('/controls/check?tool=http', {
        method: 'GET',
        headers: { Authorization: `Bearer ${executorToken}` },
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.allowed).toBe(false);
      expect(body.code).toBe('TOOL_DISABLED');
    });

    it('returns allowed=false when execution disabled', async () => {
      await db.query('UPDATE controls SET disable_execution = true');

      const response = await app.request('/controls/check?tool=http', {
        method: 'GET',
        headers: { Authorization: `Bearer ${executorToken}` },
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.allowed).toBe(false);
      expect(body.code).toBe('EXECUTION_DISABLED');
    });
  });
});
