/**
 * Receipt Viewer Security Tests
 *
 * Tests for secret leakage, token exposure, XSS protection, and security headers.
 */

import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
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
const adminToken = 'test_admin_token_secure';
const adminKeyHash = crypto.createHash('sha256').update(adminToken).digest('hex');
const authHeaders = { Authorization: `Bearer ${adminToken}` };

describe('Receipt Viewer Security', () => {
  beforeAll(async () => {
    await initDb();
  });

  beforeEach(async () => {
    // Clear tables and create admin key
    await db.query('DELETE FROM receipts');
    await db.query('DELETE FROM api_keys');
    await db.query(
      `INSERT INTO api_keys (id, name, role, key_hash) VALUES ($1, $2, $3, $4)`,
      [crypto.randomUUID(), 'Test Admin', 'admin', adminKeyHash]
    );
  });

  describe('Query token restriction', () => {
    it('rejects ?token= when AUTHENSOR_SANDBOX_MODE is not set', async () => {
      // Ensure sandbox mode is not set
      delete process.env.AUTHENSOR_SANDBOX_MODE;

      // Create a receipt first
      const envelope = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        action: { type: 'test.action', resource: 'test://resource' },
        principal: { type: 'agent', id: 'test-agent' },
        context: { environment: 'development' },
      };

      const evalResp = await app.request('/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(envelope),
      });
      const { receiptId } = await evalResp.json();

      // Try to access with ?token= (should fail)
      const response = await app.request(`/receipts/${receiptId}/view?token=${adminToken}`);
      expect(response.status).toBe(401);
    });

    it('accepts ?token= when AUTHENSOR_SANDBOX_MODE=stub', async () => {
      // Set sandbox mode
      process.env.AUTHENSOR_SANDBOX_MODE = 'stub';

      // Create a receipt first
      const envelope = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        action: { type: 'test.action', resource: 'test://resource' },
        principal: { type: 'agent', id: 'test-agent' },
        context: { environment: 'development' },
      };

      const evalResp = await app.request('/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(envelope),
      });
      const { receiptId } = await evalResp.json();

      // Try to access with ?token= (should work)
      const response = await app.request(`/receipts/${receiptId}/view?token=${adminToken}`);
      expect(response.status).toBe(200);

      // Clean up
      delete process.env.AUTHENSOR_SANDBOX_MODE;
    });
  });

  describe('Security headers', () => {
    it('returns security headers on /receipts/view', async () => {
      const response = await app.request('/receipts/view', { headers: authHeaders });

      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
      expect(response.headers.get('X-Robots-Tag')).toBe('noindex');
    });

    it('returns security headers on /receipts/:id/view', async () => {
      // Create a receipt first
      const envelope = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        action: { type: 'test.action', resource: 'test://resource' },
        principal: { type: 'agent', id: 'test-agent' },
        context: { environment: 'development' },
      };

      const evalResp = await app.request('/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(envelope),
      });
      const { receiptId } = await evalResp.json();

      const response = await app.request(`/receipts/${receiptId}/view`, { headers: authHeaders });

      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
      expect(response.headers.get('X-Robots-Tag')).toBe('noindex');
    });
  });

  describe('Token not echoed in HTML', () => {
    it('does not include token in any HTML links', async () => {
      process.env.AUTHENSOR_SANDBOX_MODE = 'stub';

      // Create a receipt
      const envelope = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        action: { type: 'test.action', resource: 'test://resource' },
        principal: { type: 'agent', id: 'test-agent' },
        context: { environment: 'development' },
      };

      const evalResp = await app.request('/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(envelope),
      });
      const { receiptId } = await evalResp.json();

      // Access with ?token= and check HTML doesn't contain token
      const response = await app.request(`/receipts/${receiptId}/view?token=${adminToken}`);
      const html = await response.text();

      // Token should NOT appear anywhere in the HTML
      expect(html).not.toContain(adminToken);
      expect(html).not.toContain('?token=');

      // Receipt ID should appear in the page title
      expect(html).toContain(`Authensor Receipt ${receiptId}`);

      delete process.env.AUTHENSOR_SANDBOX_MODE;
    });

    it('does not include token in list view HTML links', async () => {
      process.env.AUTHENSOR_SANDBOX_MODE = 'stub';

      // Create a receipt
      const envelope = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        action: { type: 'test.action', resource: 'test://resource' },
        principal: { type: 'agent', id: 'test-agent' },
        context: { environment: 'development' },
      };

      const evalResp = await app.request('/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(envelope),
      });
      const { receiptId } = await evalResp.json();

      // Access list view with ?token=
      const response = await app.request(`/receipts/view?token=${adminToken}`);
      const html = await response.text();

      // Token should NOT appear anywhere in the HTML
      expect(html).not.toContain(adminToken);
      expect(html).not.toContain('?token=');

      delete process.env.AUTHENSOR_SANDBOX_MODE;
    });
  });

  describe('Secret redaction', () => {
    it('redacts authorization header in receipt viewer', async () => {
      // Create a receipt with authorization in metadata
      const envelope = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        action: { type: 'test.action', resource: 'test://resource' },
        principal: { type: 'agent', id: 'test-agent' },
        context: {
          environment: 'development',
          metadata: {
            authorization: 'Bearer secret_token_12345',
            headers: {
              authorization: 'Bearer nested_secret',
            },
          },
        },
      };

      const evalResp = await app.request('/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(envelope),
      });
      const { receiptId } = await evalResp.json();

      const response = await app.request(`/receipts/${receiptId}/view`, { headers: authHeaders });
      const html = await response.text();

      // Secrets should be redacted
      expect(html).not.toContain('secret_token_12345');
      expect(html).not.toContain('nested_secret');
      expect(html).toContain('[REDACTED]');
    });

    it('redacts all sensitive keys recursively', async () => {
      const sensitiveData = {
        authorization: 'auth_value',
        token: 'token_value',
        api_key: 'apikey_value',
        apikey: 'apikey2_value',
        secret: 'secret_value',
        password: 'password_value',
        cookie: 'cookie_value',
        'set-cookie': 'setcookie_value',
        nested: {
          authorization: 'nested_auth',
          deep: {
            token: 'deep_token',
          },
        },
        array: [
          { secret: 'array_secret' },
        ],
      };

      const envelope = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        action: { type: 'test.action', resource: 'test://resource' },
        principal: { type: 'agent', id: 'test-agent' },
        context: {
          environment: 'development',
          metadata: sensitiveData,
        },
      };

      const evalResp = await app.request('/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(envelope),
      });
      const { receiptId } = await evalResp.json();

      const response = await app.request(`/receipts/${receiptId}/view`, { headers: authHeaders });
      const html = await response.text();

      // None of the secret values should appear
      expect(html).not.toContain('auth_value');
      expect(html).not.toContain('token_value');
      expect(html).not.toContain('apikey_value');
      expect(html).not.toContain('apikey2_value');
      expect(html).not.toContain('secret_value');
      expect(html).not.toContain('password_value');
      expect(html).not.toContain('cookie_value');
      expect(html).not.toContain('setcookie_value');
      expect(html).not.toContain('nested_auth');
      expect(html).not.toContain('deep_token');
      expect(html).not.toContain('array_secret');
    });
  });

  describe('XSS protection', () => {
    it('escapes HTML in receipt fields', async () => {
      const xssPayload = '<script>alert("XSS")</script>';

      const envelope = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        action: {
          type: xssPayload,
          resource: `test://${xssPayload}`,
        },
        principal: {
          type: 'agent',
          id: xssPayload,
          name: xssPayload,
        },
        context: {
          environment: 'development',
          metadata: {
            userInput: xssPayload,
          },
        },
      };

      const evalResp = await app.request('/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(envelope),
      });
      const { receiptId } = await evalResp.json();

      const response = await app.request(`/receipts/${receiptId}/view`, { headers: authHeaders });
      const html = await response.text();

      // Raw script tags should NOT appear
      expect(html).not.toContain('<script>');
      expect(html).not.toContain('</script>');

      // Should be properly escaped
      expect(html).toContain('&lt;script&gt;');
      expect(html).toContain('&lt;/script&gt;');
    });

    it('escapes HTML entities in receipt list view', async () => {
      const xssPayload = '<img src=x onerror=alert(1)>';

      const envelope = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        action: {
          type: xssPayload,
          resource: 'test://resource',
        },
        principal: {
          type: 'agent',
          id: xssPayload,
        },
        context: { environment: 'development' },
      };

      const evalResp = await app.request('/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(envelope),
      });

      const response = await app.request('/receipts/view', { headers: authHeaders });
      const html = await response.text();

      // Raw img tag should NOT appear (unescaped)
      expect(html).not.toContain('<img src=x');

      // Should be properly escaped - the < and > are converted to entities
      // This makes the XSS payload harmless text instead of executable HTML
      expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    });

    it('escapes quotes and special characters', async () => {
      const quotePayload = '"><script>alert(1)</script><input value="';

      const envelope = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        action: {
          type: quotePayload,
          resource: 'test://resource',
        },
        principal: { type: 'agent', id: 'test-agent' },
        context: { environment: 'development' },
      };

      const evalResp = await app.request('/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(envelope),
      });
      const { receiptId } = await evalResp.json();

      const response = await app.request(`/receipts/${receiptId}/view`, { headers: authHeaders });
      const html = await response.text();

      // Should not contain unescaped quotes that break attributes
      expect(html).not.toMatch(/">.*<script>/);
    });
  });
});
