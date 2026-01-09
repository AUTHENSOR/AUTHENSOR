/**
 * Authorization Tests
 *
 * Tests for API key authentication and role-based access control.
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

describe('Authorization', () => {
  beforeAll(async () => {
    await initDb();
  });

  beforeEach(async () => {
    // Clear api_keys table before each test
    await db.query('DELETE FROM api_keys');
  });

  describe('401 Unauthorized', () => {
    it('returns 401 when no API key is provided and keys exist', async () => {
      // Create an admin key so auth is enabled
      const token = 'authensor_test_token_123';
      await db.query(
        `INSERT INTO api_keys (id, name, role, key_hash) VALUES ($1, $2, $3, $4)`,
        [crypto.randomUUID(), 'Test Admin', 'admin', hashToken(token)]
      );

      const response = await app.request('/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          action: { type: 'test.action', resource: 'test://resource' },
          principal: { type: 'agent', id: 'test-agent' },
          context: { environment: 'development' },
        }),
      });

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 when invalid API key is provided', async () => {
      // Create an admin key
      const validToken = 'authensor_valid_token';
      await db.query(
        `INSERT INTO api_keys (id, name, role, key_hash) VALUES ($1, $2, $3, $4)`,
        [crypto.randomUUID(), 'Test Admin', 'admin', hashToken(validToken)]
      );

      const response = await app.request('/evaluate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer invalid_token',
        },
        body: JSON.stringify({
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          action: { type: 'test.action', resource: 'test://resource' },
          principal: { type: 'agent', id: 'test-agent' },
          context: { environment: 'development' },
        }),
      });

      expect(response.status).toBe(401);
    });

    it('returns 401 when revoked API key is provided', async () => {
      const token = 'authensor_revoked_token';
      await db.query(
        `INSERT INTO api_keys (id, name, role, key_hash, revoked_at) VALUES ($1, $2, $3, $4, now())`,
        [crypto.randomUUID(), 'Revoked Key', 'admin', hashToken(token)]
      );

      const response = await app.request('/evaluate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          action: { type: 'test.action', resource: 'test://resource' },
          principal: { type: 'agent', id: 'test-agent' },
          context: { environment: 'development' },
        }),
      });

      expect(response.status).toBe(401);
    });
  });

  describe('403 Forbidden - Role Insufficient', () => {
    it('ingest cannot GET /receipts/:id', async () => {
      const token = 'authensor_ingest_token';
      await db.query(
        `INSERT INTO api_keys (id, name, role, key_hash) VALUES ($1, $2, $3, $4)`,
        [crypto.randomUUID(), 'Ingest Key', 'ingest', hashToken(token)]
      );

      const response = await app.request('/receipts/some-id', {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('executor cannot POST /policies', async () => {
      const token = 'authensor_executor_token';
      await db.query(
        `INSERT INTO api_keys (id, name, role, key_hash) VALUES ($1, $2, $3, $4)`,
        [crypto.randomUUID(), 'Executor Key', 'executor', hashToken(token)]
      );

      const response = await app.request('/policies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: 'test-policy',
          name: 'Test Policy',
          version: 'v1',
          rules: [],
        }),
      });

      expect(response.status).toBe(403);
    });

    it('ingest cannot access /metrics/summary', async () => {
      const token = 'authensor_ingest_token';
      await db.query(
        `INSERT INTO api_keys (id, name, role, key_hash) VALUES ($1, $2, $3, $4)`,
        [crypto.randomUUID(), 'Ingest Key', 'ingest', hashToken(token)]
      );

      const response = await app.request('/metrics/summary', {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(response.status).toBe(403);
    });
  });

  describe('Admin can access everything', () => {
    it('admin can POST /evaluate', async () => {
      const token = 'authensor_admin_token';
      await db.query(
        `INSERT INTO api_keys (id, name, role, key_hash) VALUES ($1, $2, $3, $4)`,
        [crypto.randomUUID(), 'Admin Key', 'admin', hashToken(token)]
      );

      const response = await app.request('/evaluate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          action: { type: 'test.action', resource: 'test://resource' },
          principal: { type: 'agent', id: 'test-agent' },
          context: { environment: 'development' },
        }),
      });

      expect(response.status).toBe(200);
    });

    it('admin can GET /receipts', async () => {
      const token = 'authensor_admin_token';
      await db.query(
        `INSERT INTO api_keys (id, name, role, key_hash) VALUES ($1, $2, $3, $4)`,
        [crypto.randomUUID(), 'Admin Key', 'admin', hashToken(token)]
      );

      const response = await app.request('/receipts', {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(response.status).toBe(200);
    });

    it('admin can access /metrics/summary', async () => {
      const token = 'authensor_admin_token';
      await db.query(
        `INSERT INTO api_keys (id, name, role, key_hash) VALUES ($1, $2, $3, $4)`,
        [crypto.randomUUID(), 'Admin Key', 'admin', hashToken(token)]
      );

      const response = await app.request('/metrics/summary', {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(response.status).toBe(200);
    });
  });

  describe('Bootstrap mode (safe-by-default)', () => {
    it('returns 503 BOOTSTRAP_REQUIRED for protected endpoints when no keys exist', async () => {
      // Ensure no keys exist
      await db.query('DELETE FROM api_keys');

      const response = await app.request('/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          action: { type: 'test.action', resource: 'test://resource' },
          principal: { type: 'agent', id: 'test-agent' },
          context: { environment: 'development' },
        }),
      });

      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body.error.code).toBe('BOOTSTRAP_REQUIRED');
    });

    it('allows /health when no keys exist', async () => {
      await db.query('DELETE FROM api_keys');

      const response = await app.request('/health', { method: 'GET' });
      expect(response.status).toBe(200);
    });

    it('blocks POST /keys without bootstrap token when no keys exist', async () => {
      await db.query('DELETE FROM api_keys');

      const response = await app.request('/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test Key', role: 'admin' }),
      });

      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body.error.code).toBe('BOOTSTRAP_REQUIRED');
    });
  });

  describe('x-authensor-key header fallback', () => {
    it('accepts API key via x-authensor-key header', async () => {
      const token = 'authensor_admin_token';
      await db.query(
        `INSERT INTO api_keys (id, name, role, key_hash) VALUES ($1, $2, $3, $4)`,
        [crypto.randomUUID(), 'Admin Key', 'admin', hashToken(token)]
      );

      const response = await app.request('/receipts', {
        method: 'GET',
        headers: { 'x-authensor-key': token },
      });

      expect(response.status).toBe(200);
    });
  });

  describe('Ingest role - least privilege', () => {
    it('ingest CAN POST /evaluate', async () => {
      const token = 'authensor_ingest_token';
      await db.query(
        `INSERT INTO api_keys (id, name, role, key_hash) VALUES ($1, $2, $3, $4)`,
        [crypto.randomUUID(), 'Ingest Key', 'ingest', hashToken(token)]
      );

      const response = await app.request('/evaluate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          action: { type: 'test.action', resource: 'test://resource' },
          principal: { type: 'agent', id: 'test-agent' },
          context: { environment: 'development' },
        }),
      });

      expect(response.status).toBe(200);
    });

    it('ingest cannot POST /receipts/:id/claim', async () => {
      const token = 'authensor_ingest_token';
      await db.query(
        `INSERT INTO api_keys (id, name, role, key_hash) VALUES ($1, $2, $3, $4)`,
        [crypto.randomUUID(), 'Ingest Key', 'ingest', hashToken(token)]
      );

      const response = await app.request('/receipts/some-id/claim', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(response.status).toBe(403);
    });

    it('ingest cannot PATCH /receipts/:id', async () => {
      const token = 'authensor_ingest_token';
      await db.query(
        `INSERT INTO api_keys (id, name, role, key_hash) VALUES ($1, $2, $3, $4)`,
        [crypto.randomUUID(), 'Ingest Key', 'ingest', hashToken(token)]
      );

      const response = await app.request('/receipts/some-id', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: 'executed' }),
      });

      expect(response.status).toBe(403);
    });

    it('ingest cannot GET /controls', async () => {
      const token = 'authensor_ingest_token';
      await db.query(
        `INSERT INTO api_keys (id, name, role, key_hash) VALUES ($1, $2, $3, $4)`,
        [crypto.randomUUID(), 'Ingest Key', 'ingest', hashToken(token)]
      );

      const response = await app.request('/controls', {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(response.status).toBe(403);
    });

    it('ingest cannot GET /keys', async () => {
      const token = 'authensor_ingest_token';
      await db.query(
        `INSERT INTO api_keys (id, name, role, key_hash) VALUES ($1, $2, $3, $4)`,
        [crypto.randomUUID(), 'Ingest Key', 'ingest', hashToken(token)]
      );

      const response = await app.request('/keys', {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(response.status).toBe(403);
    });
  });

  describe('Executor role - claim/finalize only', () => {
    it('executor cannot GET /receipts (list)', async () => {
      const token = 'authensor_executor_token';
      await db.query(
        `INSERT INTO api_keys (id, name, role, key_hash) VALUES ($1, $2, $3, $4)`,
        [crypto.randomUUID(), 'Executor Key', 'executor', hashToken(token)]
      );

      const response = await app.request('/receipts', {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(response.status).toBe(403);
    });

    it('executor cannot POST /keys', async () => {
      const token = 'authensor_executor_token';
      await db.query(
        `INSERT INTO api_keys (id, name, role, key_hash) VALUES ($1, $2, $3, $4)`,
        [crypto.randomUUID(), 'Executor Key', 'executor', hashToken(token)]
      );

      const response = await app.request('/keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: 'New Key', role: 'ingest' }),
      });

      expect(response.status).toBe(403);
    });

    it('executor cannot POST /controls', async () => {
      const token = 'authensor_executor_token';
      await db.query(
        `INSERT INTO api_keys (id, name, role, key_hash) VALUES ($1, $2, $3, $4)`,
        [crypto.randomUUID(), 'Executor Key', 'executor', hashToken(token)]
      );

      const response = await app.request('/controls', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ disable_execution: true }),
      });

      expect(response.status).toBe(403);
    });

    it('executor CAN GET /controls', async () => {
      const token = 'authensor_executor_token';
      await db.query(
        `INSERT INTO api_keys (id, name, role, key_hash) VALUES ($1, $2, $3, $4)`,
        [crypto.randomUUID(), 'Executor Key', 'executor', hashToken(token)]
      );

      const response = await app.request('/controls', {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(response.status).toBe(200);
    });

    it('executor CAN GET /controls/check', async () => {
      const token = 'authensor_executor_token';
      await db.query(
        `INSERT INTO api_keys (id, name, role, key_hash) VALUES ($1, $2, $3, $4)`,
        [crypto.randomUUID(), 'Executor Key', 'executor', hashToken(token)]
      );

      const response = await app.request('/controls/check?tool=http', {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(response.status).toBe(200);
    });

    it('executor cannot POST /approvals/:id/approve', async () => {
      const token = 'authensor_executor_token';
      await db.query(
        `INSERT INTO api_keys (id, name, role, key_hash) VALUES ($1, $2, $3, $4)`,
        [crypto.randomUUID(), 'Executor Key', 'executor', hashToken(token)]
      );

      const response = await app.request('/approvals/some-id/approve', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(response.status).toBe(403);
    });
  });

  describe('GET /whoami', () => {
    it('returns auth context for any authenticated key', async () => {
      const keyId = crypto.randomUUID();
      const token = 'authensor_executor_token';
      await db.query(
        `INSERT INTO api_keys (id, name, role, key_hash) VALUES ($1, $2, $3, $4)`,
        [keyId, 'Executor Key', 'executor', hashToken(token)]
      );

      const response = await app.request('/whoami', {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.keyId).toBe(keyId);
      expect(body.role).toBe('executor');
      expect(body.name).toBe('Executor Key');
    });

    it('returns 401 without valid auth', async () => {
      const token = 'authensor_valid_token';
      await db.query(
        `INSERT INTO api_keys (id, name, role, key_hash) VALUES ($1, $2, $3, $4)`,
        [crypto.randomUUID(), 'Admin Key', 'admin', hashToken(token)]
      );

      const response = await app.request('/whoami', {
        method: 'GET',
        headers: { Authorization: 'Bearer invalid_token' },
      });

      expect(response.status).toBe(401);
    });
  });
});
