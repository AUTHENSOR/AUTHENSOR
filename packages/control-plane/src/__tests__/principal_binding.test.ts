/**
 * Principal Binding Tests
 *
 * Tests for principal identity verification — binding principal.id in envelopes
 * to the authenticated API key.
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

// Helper to hash tokens
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Helper to create a valid evaluate envelope
function makeEnvelope(principalId: string) {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    action: { type: 'test.action', resource: 'test://resource' },
    principal: { type: 'agent', id: principalId },
    context: { environment: 'development' },
  };
}

// Helper to create an API key in the DB
async function createKey(opts: {
  role: 'ingest' | 'executor' | 'admin';
  token: string;
  principalId?: string;
}): Promise<string> {
  const id = crypto.randomUUID();
  await db.query(
    `INSERT INTO api_keys (id, name, role, key_hash, principal_id) VALUES ($1, $2, $3, $4, $5)`,
    [id, `${opts.role} key`, opts.role, hashToken(opts.token), opts.principalId ?? null]
  );
  return id;
}

describe('Principal Binding', () => {
  beforeAll(async () => {
    await initDb();
  });

  beforeEach(async () => {
    await db.query('DELETE FROM api_keys');
    // Ensure strict mode is off by default
    delete process.env.AUTHENSOR_STRICT_PRINCIPAL_BINDING;
  });

  afterEach(() => {
    delete process.env.AUTHENSOR_STRICT_PRINCIPAL_BINDING;
  });

  describe('Evaluate — principal verification', () => {
    it('key with principal_id and matching envelope passes', async () => {
      const token = 'authensor_agent_a_token';
      await createKey({ role: 'ingest', token, principalId: 'agent-a' });

      const response = await app.request('/evaluate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(makeEnvelope('agent-a')),
      });

      expect(response.status).toBe(200);
    });

    it('key with principal_id and mismatched envelope returns 403', async () => {
      const token = 'authensor_agent_a_token';
      await createKey({ role: 'ingest', token, principalId: 'agent-a' });

      const response = await app.request('/evaluate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(makeEnvelope('agent-b')),
      });

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error.code).toBe('PRINCIPAL_MISMATCH');
      expect(body.error.message).toBe('Principal ID does not match authenticated key');
    });

    it('admin key with any principal passes', async () => {
      const token = 'authensor_admin_token';
      await createKey({ role: 'admin', token, principalId: 'admin-principal' });

      // Admin submits envelope with a completely different principal
      const response = await app.request('/evaluate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(makeEnvelope('any-other-agent')),
      });

      expect(response.status).toBe(200);
    });

    it('key without principal_id in non-strict mode passes', async () => {
      const token = 'authensor_unbound_token';
      await createKey({ role: 'ingest', token }); // No principalId

      const response = await app.request('/evaluate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(makeEnvelope('any-agent')),
      });

      expect(response.status).toBe(200);
    });

    it('key without principal_id in strict mode returns 403', async () => {
      process.env.AUTHENSOR_STRICT_PRINCIPAL_BINDING = 'true';

      const token = 'authensor_unbound_strict_token';
      await createKey({ role: 'ingest', token }); // No principalId

      const response = await app.request('/evaluate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(makeEnvelope('some-agent')),
      });

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error.code).toBe('PRINCIPAL_BINDING_REQUIRED');
    });

    it('admin key without principal_id in strict mode still passes', async () => {
      process.env.AUTHENSOR_STRICT_PRINCIPAL_BINDING = 'true';

      const token = 'authensor_admin_strict_token';
      await createKey({ role: 'admin', token }); // No principalId, but admin

      const response = await app.request('/evaluate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(makeEnvelope('any-agent')),
      });

      expect(response.status).toBe(200);
    });
  });

  describe('POST /keys/:id/principal — bind principal', () => {
    it('binds a principal to a key', async () => {
      const adminToken = 'authensor_admin_bind_token';
      await createKey({ role: 'admin', token: adminToken });

      const ingestToken = 'authensor_ingest_bind_token';
      const keyId = await createKey({ role: 'ingest', token: ingestToken });

      const response = await app.request(`/keys/${keyId}/principal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ principalId: 'agent-x' }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.principalId).toBe('agent-x');
    });

    it('returns 400 for missing principalId', async () => {
      const adminToken = 'authensor_admin_bind_token2';
      await createKey({ role: 'admin', token: adminToken });

      const keyId = await createKey({ role: 'ingest', token: 'authensor_ingest2' });

      const response = await app.request(`/keys/${keyId}/principal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe('INVALID_INPUT');
    });

    it('returns 404 for non-existent key', async () => {
      const adminToken = 'authensor_admin_bind_token3';
      await createKey({ role: 'admin', token: adminToken });

      const fakeId = crypto.randomUUID();
      const response = await app.request(`/keys/${fakeId}/principal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ principalId: 'agent-y' }),
      });

      expect(response.status).toBe(404);
    });

    it('requires admin role', async () => {
      const ingestToken = 'authensor_ingest_no_admin';
      const keyId = await createKey({ role: 'ingest', token: ingestToken });

      const response = await app.request(`/keys/${keyId}/principal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ingestToken}`,
        },
        body: JSON.stringify({ principalId: 'agent-z' }),
      });

      expect(response.status).toBe(403);
    });
  });

  describe('DELETE /keys/:id/principal — unbind principal', () => {
    it('unbinds a principal from a key', async () => {
      const adminToken = 'authensor_admin_unbind_token';
      await createKey({ role: 'admin', token: adminToken });

      const ingestToken = 'authensor_ingest_unbind_token';
      const keyId = await createKey({ role: 'ingest', token: ingestToken, principalId: 'agent-bound' });

      const response = await app.request(`/keys/${keyId}/principal`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.principalId).toBeNull();
    });

    it('returns 404 for non-existent key', async () => {
      const adminToken = 'authensor_admin_unbind_token2';
      await createKey({ role: 'admin', token: adminToken });

      const fakeId = crypto.randomUUID();
      const response = await app.request(`/keys/${fakeId}/principal`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.status).toBe(404);
    });
  });

  describe('GET /keys — list includes principalId', () => {
    it('returns principalId in key listing', async () => {
      const adminToken = 'authensor_admin_list_token';
      await createKey({ role: 'admin', token: adminToken, principalId: 'admin-principal-id' });

      const response = await app.request('/keys', {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);
      // Find the key with our principal_id
      const adminKey = body.find((k: any) => k.principalId === 'admin-principal-id');
      expect(adminKey).toBeDefined();
    });
  });

  describe('GET /whoami — includes principalId', () => {
    it('returns principalId in whoami response', async () => {
      const token = 'authensor_whoami_token';
      await createKey({ role: 'ingest', token, principalId: 'my-agent-id' });

      const response = await app.request('/whoami', {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.principalId).toBe('my-agent-id');
    });

    it('returns null principalId when not bound', async () => {
      const token = 'authensor_whoami_unbound_token';
      await createKey({ role: 'ingest', token });

      const response = await app.request('/whoami', {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.principalId).toBeNull();
    });
  });
});
