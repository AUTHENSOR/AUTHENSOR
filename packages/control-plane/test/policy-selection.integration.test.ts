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
  id: '44444444-4444-4444-4444-444444444444',
  timestamp: new Date().toISOString(),
  action: {
    type: 'http.request',
    resource: 'https://example.com',
    operation: 'read',
  },
  principal: {
    type: 'agent',
    id: 'agent-policy-test',
  },
  context: {
    environment: 'development',
  },
};

describe('policy selection integration', () => {
  beforeAll(async () => {
    await initDb();
    // Create admin key for auth
    await db.query(
      `INSERT INTO api_keys (id, name, role, key_hash) VALUES ($1, $2, $3, $4)`,
      [crypto.randomUUID(), 'Test Admin', 'admin', adminKeyHash]
    );
  });

  it('evaluates against active policy', async () => {
    // Create a denying policy
    const policyBody = {
      id: 'deny-http',
      name: 'Deny HTTP',
      version: '1.0.0',
      rules: [
        {
          id: 'deny-http',
          effect: 'deny' as const,
          condition: { field: 'action.type', operator: 'eq', value: 'http.request' },
        },
      ],
      defaultEffect: 'allow' as const,
    };

    const headers = { 'Content-Type': 'application/json', ...authHeaders };

    const createResp = await app.request('/policies', {
      method: 'POST',
      headers,
      body: JSON.stringify(policyBody),
    });
    expect(createResp.status).toBe(201);

    const setActive = await app.request('/policies/active', {
      method: 'POST',
      headers,
      body: JSON.stringify({ policy_id: 'deny-http', version: '1.0.0' }),
    });
    expect(setActive.status).toBe(200);

    const evalResp = await app.request('/evaluate', {
      method: 'POST',
      headers,
      body: JSON.stringify(envelope),
    });
    expect(evalResp.status).toBe(200);
    const evalJson = await evalResp.json();
    expect(evalJson.decision.outcome).toBe('deny');
    expect(evalJson.policy.id).toBe('deny-http');
    expect(evalJson.policy.version).toBe('1.0.0');
  });
});
