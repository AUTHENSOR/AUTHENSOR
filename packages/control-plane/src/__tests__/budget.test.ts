/**
 * Budget Enforcement Tests
 *
 * Tests for dollar-denominated cost budget management and enforcement.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { newDb } from 'pg-mem';
import crypto from 'crypto';

// Mock pg with an in-memory adapter before importing app/db
const mem = newDb();
mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', implementation: () => crypto.randomUUID() });
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

describe('Budget Enforcement', () => {
  let adminToken: string;
  let ingestToken: string;

  beforeAll(async () => {
    await initDb();
  });

  beforeEach(async () => {
    // Clear and reset data
    try { await db.query('DELETE FROM budget_ledger'); } catch { /* table may not exist yet */ }
    try { await db.query('DELETE FROM budgets'); } catch { /* table may not exist yet */ }
    await db.query('DELETE FROM api_keys');
    _resetRateLimitState();

    // Create admin and ingest keys
    adminToken = 'authensor_admin_budget_test';
    ingestToken = 'authensor_ingest_budget_test';

    await db.query(
      `INSERT INTO api_keys (id, name, role, key_hash) VALUES ($1, $2, $3, $4)`,
      [crypto.randomUUID(), 'Admin Key', 'admin', hashToken(adminToken)]
    );
    await db.query(
      `INSERT INTO api_keys (id, name, role, key_hash) VALUES ($1, $2, $3, $4)`,
      [crypto.randomUUID(), 'Ingest Key', 'ingest', hashToken(ingestToken)]
    );
  });

  // ─── Budget CRUD API ──────────────────────────────────────────────

  describe('Budget management API', () => {
    it('POST /budgets creates a new budget', async () => {
      const response = await app.request('/budgets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          principalId: 'agent-1',
          budgetAmount: 100.00,
          period: 'daily',
        }),
      });

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.budget).toBeDefined();
      expect(body.budget.principalId).toBe('agent-1');
      expect(body.budget.budgetAmount).toBe(100);
      expect(body.budget.spentAmount).toBe(0);
      expect(body.budget.period).toBe('daily');
    });

    it('POST /budgets upserts on same principal+period', async () => {
      // Create initial budget
      await app.request('/budgets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          principalId: 'agent-1',
          budgetAmount: 100.00,
          period: 'daily',
        }),
      });

      // Update budget amount
      const response = await app.request('/budgets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          principalId: 'agent-1',
          budgetAmount: 200.00,
          period: 'daily',
        }),
      });

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.budget.budgetAmount).toBe(200);
    });

    it('GET /budgets lists all budgets with utilization', async () => {
      // Create budgets
      await app.request('/budgets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          principalId: 'agent-1',
          budgetAmount: 100.00,
          period: 'daily',
        }),
      });

      const response = await app.request('/budgets', {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.budgets).toBeDefined();
      expect(body.budgets.length).toBeGreaterThan(0);
      expect(body.budgets[0].utilization).toBeDefined();
    });

    it('GET /budgets/:principalId returns budgets for a principal', async () => {
      // Create budget
      await app.request('/budgets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          principalId: 'agent-1',
          budgetAmount: 100.00,
          period: 'daily',
        }),
      });

      const response = await app.request('/budgets/agent-1', {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.principalId).toBe('agent-1');
      expect(body.budgets).toBeDefined();
      expect(body.budgets.length).toBeGreaterThan(0);
      expect(body.budgets[0].remaining).toBeDefined();
      expect(body.budgets[0].utilization).toBeDefined();
    });

    it('GET /budgets/:principalId returns 404 for unknown principal', async () => {
      const response = await app.request('/budgets/unknown-agent', {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(response.status).toBe(404);
    });

    it('requires admin role for budget operations', async () => {
      const response = await app.request('/budgets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ingestToken}`,
        },
        body: JSON.stringify({
          principalId: 'agent-1',
          budgetAmount: 100.00,
          period: 'daily',
        }),
      });

      expect(response.status).toBe(403);
    });

    it('validates budget input', async () => {
      const response = await app.request('/budgets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          principalId: 'agent-1',
          budgetAmount: -50, // negative amount
          period: 'daily',
        }),
      });

      expect(response.status).toBe(400);
    });

    it('validates period enum', async () => {
      const response = await app.request('/budgets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          principalId: 'agent-1',
          budgetAmount: 100,
          period: 'weekly', // invalid
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  // ─── Budget enforcement in evaluation ─────────────────────────────

  describe('Budget enforcement during evaluation', () => {
    it('evaluates normally when no costBudget is in the policy rule', async () => {
      // Create a policy without costBudget
      // Insert policy with correct column names
      await db.query(
        `INSERT INTO policies (org_id, environment, policy_id, version, policy, is_active)
         VALUES ($1, $2, $3, $4, $5::jsonb, true)
         ON CONFLICT (org_id, environment, policy_id, version) DO UPDATE SET policy = EXCLUDED.policy, is_active = true`,
        [
          'default',
          'dev',
          'no-budget-policy',
          '1.0.0',
          JSON.stringify({
            id: 'no-budget-policy',
            name: 'No Budget Policy',
            version: '1.0.0',
            rules: [{ id: 'allow-all', effect: 'allow' }],
          }),
        ]
      );
      // Activate the policy
      await db.query(
        `INSERT INTO active_policies (org_id, environment, policy_id, version, activated_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (org_id, environment) DO UPDATE SET policy_id = EXCLUDED.policy_id, version = EXCLUDED.version, activated_at = now()`,
        ['default', 'dev', 'no-budget-policy', '1.0.0']
      );

      const response = await app.request('/evaluate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ingestToken}`,
        },
        body: JSON.stringify({
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          action: { type: 'test.action', resource: 'test://resource' },
          principal: { type: 'agent', id: 'agent-1' },
          context: { environment: 'development' },
          constraints: { maxAmount: 5.00 },
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.decision.outcome).toBe('allow');
      // No budget info when no costBudget in rule
      expect(body.budget).toBeUndefined();
    });
  });
});
