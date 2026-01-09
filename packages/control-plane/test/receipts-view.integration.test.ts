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
    id: 'agent-view',
  },
  context: {
    environment: 'development',
  },
};

describe('receipt viewer endpoints', () => {
  beforeAll(async () => {
    await initDb();
    // Create admin key for auth
    await db.query(
      `INSERT INTO api_keys (id, name, role, key_hash) VALUES ($1, $2, $3, $4)`,
      [crypto.randomUUID(), 'Test Admin', 'admin', adminKeyHash]
    );
  });

  it('serves JSON and HTML receipt views', async () => {
    const headers = { 'Content-Type': 'application/json', ...authHeaders };

    const evaluateResponse = await app.request('/evaluate', {
      method: 'POST',
      body: JSON.stringify(envelope),
      headers,
    });
    expect(evaluateResponse.status).toBe(200);
    const evaluation = await evaluateResponse.json();
    const receiptId = evaluation.receiptId as string;

    const jsonResp = await app.request(`/receipts/${receiptId}`, { headers: authHeaders });
    expect(jsonResp.status).toBe(200);
    const jsonBody = await jsonResp.json();
    expect(jsonBody.id).toBe(receiptId);
    expect(jsonBody.receiptUrl).toContain(`/receipts/${receiptId}/view`);

    const htmlResp = await app.request(`/receipts/${receiptId}/view`, { headers: authHeaders });
    expect(htmlResp.status).toBe(200);
    const html = await htmlResp.text();
    expect(html).toContain('Authensor Receipt');
    expect(html).toContain(receiptId);

    const listResp = await app.request('/receipts/view', { headers: authHeaders });
    expect(listResp.status).toBe(200);
    const listHtml = await listResp.text();
    expect(listHtml).toContain(`/receipts/${receiptId}/view`);
  });
});
