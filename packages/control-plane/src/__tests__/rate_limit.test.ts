/**
 * Rate Limit Tests
 *
 * Tests for token-scoped, role-aware rate limiting.
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
const { _resetRateLimitState } = await import('../middleware/rate_limit.js');

const app = createApp();

// Helper to hash tokens
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

describe('Rate Limiting', () => {
  let adminToken: string;
  let executorToken: string;

  beforeAll(async () => {
    await initDb();
  });

  beforeEach(async () => {
    // Clear and reset data
    await db.query('DELETE FROM api_keys');
    _resetRateLimitState();

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

  describe('Rate limit headers', () => {
    it('returns rate limit headers on successful request', async () => {
      const response = await app.request('/receipts', {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('X-RateLimit-Limit')).toBeDefined();
      expect(response.headers.get('X-RateLimit-Remaining')).toBeDefined();
      expect(response.headers.get('X-RateLimit-Reset')).toBeDefined();
    });

    it('decrements remaining count with each request', async () => {
      // First request
      const response1 = await app.request('/receipts', {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const remaining1 = parseInt(response1.headers.get('X-RateLimit-Remaining') || '0', 10);

      // Second request
      const response2 = await app.request('/receipts', {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const remaining2 = parseInt(response2.headers.get('X-RateLimit-Remaining') || '0', 10);

      expect(remaining2).toBe(remaining1 - 1);
    });
  });

  describe('Rate limit exceeded', () => {
    it('returns 429 when rate limit exceeded with retryAfterSeconds', async () => {
      // Create an ingest key with lower limit
      const ingestToken = 'authensor_ingest_test';
      await db.query(
        `INSERT INTO api_keys (id, name, role, key_hash) VALUES ($1, $2, $3, $4)`,
        [crypto.randomUUID(), 'Ingest Key', 'ingest', hashToken(ingestToken)]
      );

      // Make 125 requests (default ingest limit is 120)
      const requests: Promise<Response>[] = [];
      for (let i = 0; i < 125; i++) {
        requests.push(
          app.request('/evaluate', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${ingestToken}`,
            },
            body: JSON.stringify({
              id: crypto.randomUUID(),
              timestamp: new Date().toISOString(),
              action: { type: 'test.action', resource: 'test://resource' },
              principal: { type: 'agent', id: 'test-agent' },
              context: { environment: 'development' },
            }),
          })
        );
      }

      const responses = await Promise.all(requests);

      // At least one should be rate limited
      const rateLimited = responses.filter((r) => r.status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);

      // Check the rate limited response
      const limitedResponse = rateLimited[0];
      const body = await limitedResponse.json();
      expect(body.error.code).toBe('RATE_LIMITED');
      expect(body.error.retryAfterSeconds).toBeDefined();
      expect(body.error.retryAfterSeconds).toBeGreaterThan(0);
    });

    it('rate limits are per-key (different keys have separate limits)', async () => {
      // Create two separate ingest keys
      const ingestToken1 = 'authensor_ingest_1';
      const ingestToken2 = 'authensor_ingest_2';

      await db.query(
        `INSERT INTO api_keys (id, name, role, key_hash) VALUES ($1, $2, $3, $4)`,
        [crypto.randomUUID(), 'Ingest Key 1', 'ingest', hashToken(ingestToken1)]
      );
      await db.query(
        `INSERT INTO api_keys (id, name, role, key_hash) VALUES ($1, $2, $3, $4)`,
        [crypto.randomUUID(), 'Ingest Key 2', 'ingest', hashToken(ingestToken2)]
      );

      // Make requests with first key
      for (let i = 0; i < 5; i++) {
        await app.request('/evaluate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${ingestToken1}`,
          },
          body: JSON.stringify({
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            action: { type: 'test.action', resource: 'test://resource' },
            principal: { type: 'agent', id: 'test-agent' },
            context: { environment: 'development' },
          }),
        });
      }

      // Second key should still have full quota
      const response = await app.request('/evaluate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ingestToken2}`,
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
      const limit = parseInt(response.headers.get('X-RateLimit-Limit') || '0', 10);
      const remaining = parseInt(response.headers.get('X-RateLimit-Remaining') || '0', 10);
      // Second key should have nearly full quota (limit - 1)
      expect(remaining).toBe(limit - 1);
    });

    it('rate limits are per-route-group', async () => {
      // Make requests to /receipts (receipt-read group)
      for (let i = 0; i < 5; i++) {
        await app.request('/receipts', {
          method: 'GET',
          headers: { Authorization: `Bearer ${adminToken}` },
        });
      }

      // Request to /metrics/summary (metrics group) should have full quota
      const response = await app.request('/metrics/summary', {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(response.status).toBe(200);
      const limit = parseInt(response.headers.get('X-RateLimit-Limit') || '0', 10);
      const remaining = parseInt(response.headers.get('X-RateLimit-Remaining') || '0', 10);
      // Different route group should have nearly full quota
      expect(remaining).toBe(limit - 1);
    });
  });

  describe('Bootstrap mode (safe-by-default)', () => {
    it('returns 503 for protected endpoints in bootstrap mode', async () => {
      // Clear all keys to enter bootstrap mode
      await db.query('DELETE FROM api_keys');
      _resetRateLimitState();

      // Protected endpoints should return 503 BOOTSTRAP_REQUIRED
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

    it('health endpoint has no rate limit in bootstrap mode', async () => {
      await db.query('DELETE FROM api_keys');
      _resetRateLimitState();

      // Health is always allowed, no rate limit
      const requests: Promise<Response>[] = [];
      for (let i = 0; i < 150; i++) {
        requests.push(app.request('/health', { method: 'GET' }));
      }

      const responses = await Promise.all(requests);
      const rateLimited = responses.filter((r) => r.status === 429);
      expect(rateLimited.length).toBe(0);
    });
  });
});
