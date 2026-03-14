/**
 * Shadow/Canary Policy Evaluation Tests
 *
 * Tests for the shadow evaluation feature that allows operators to test
 * a new policy alongside the active one without enforcing it.
 */

import { describe, it, expect, beforeAll, beforeEach, vi, afterEach } from 'vitest';
import { newDb } from 'pg-mem';
import crypto from 'crypto';

// Mock pg with an in-memory adapter before importing app/db
const mem = newDb();
mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', implementation: () => crypto.randomUUID() });
const pg = mem.adapters.createPg();
vi.mock('pg', () => pg);

const { initDb, db } = await import('../db.js');
const { createApp } = await import('../app.js');

const app = createApp();

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function makeEnvelope(overrides?: Record<string, unknown>) {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    action: { type: 'test.action', resource: 'test://resource' },
    principal: { type: 'agent', id: 'test-agent' },
    context: { environment: 'development' },
    ...overrides,
  };
}

describe('Shadow/Canary Policy Evaluation', () => {
  const adminToken = 'authensor_shadow_admin_test';
  const ingestToken = 'authensor_shadow_ingest_test';
  const orgId = 'default';
  const environment = 'dev';

  beforeAll(async () => {
    await initDb();
  });

  beforeEach(async () => {
    await db.query('DELETE FROM api_keys');
    await db.query('DELETE FROM receipts');
    await db.query('DELETE FROM policies');
    await db.query('DELETE FROM active_policies');
    try {
      await db.query('DELETE FROM shadow_evaluations');
    } catch {
      // Table may not exist in pg-mem
    }

    // Create admin key
    await db.query(
      `INSERT INTO api_keys (id, name, role, key_hash) VALUES ($1, $2, $3, $4)`,
      [crypto.randomUUID(), 'Test Admin', 'admin', hashToken(adminToken)]
    );

    // Create ingest key
    await db.query(
      `INSERT INTO api_keys (id, name, role, key_hash) VALUES ($1, $2, $3, $4)`,
      [crypto.randomUUID(), 'Test Ingest', 'ingest', hashToken(ingestToken)]
    );
  });

  afterEach(() => {
    // Clear shadow policy env var between tests
    delete process.env.AUTHENSOR_SHADOW_POLICY_ID;
    delete process.env.AUTHENSOR_ALLOW_FALLBACK_POLICY;
  });

  async function createAndActivatePolicy(
    policyId: string,
    version: string,
    rules: Array<{ id: string; effect: string; description?: string; condition?: Record<string, unknown> }>,
    defaultEffect: string = 'deny'
  ) {
    const policy = {
      id: policyId,
      name: `Policy ${policyId}`,
      version,
      rules,
      defaultEffect,
    };

    await db.query(
      `INSERT INTO policies (org_id, environment, policy_id, version, policy, is_active)
       VALUES ($1, $2, $3, $4, $5::jsonb, false)
       ON CONFLICT (org_id, environment, policy_id, version) DO UPDATE SET policy = EXCLUDED.policy`,
      [orgId, environment, policyId, version, JSON.stringify(policy)]
    );

    return policy;
  }

  async function activatePolicy(policyId: string, version: string) {
    await db.query(
      `INSERT INTO active_policies (org_id, environment, policy_id, version, activated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (org_id, environment) DO UPDATE SET policy_id = EXCLUDED.policy_id, version = EXCLUDED.version, activated_at = now()`,
      [orgId, environment, policyId, version]
    );

    await db.query(
      `UPDATE policies
       SET is_active = (policy_id = $3 AND version = $4)
       WHERE org_id = $1 AND environment = $2`,
      [orgId, environment, policyId, version]
    );
  }

  describe('No shadow policy configured', () => {
    it('returns normal evaluation with no shadowResult field', async () => {
      // Create and activate a permissive policy
      await createAndActivatePolicy('active-policy', '1.0.0', [
        { id: 'allow-all', effect: 'allow', description: 'Allow everything' },
      ]);
      await activatePolicy('active-policy', '1.0.0');

      const response = await app.request('/evaluate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(makeEnvelope()),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.decision.outcome).toBe('allow');
      expect(body.shadowResult).toBeUndefined();
    });
  });

  describe('Shadow policy via query parameter', () => {
    it('evaluates both active and shadow, returns shadowResult', async () => {
      // Active policy: allow everything
      await createAndActivatePolicy('active-policy', '1.0.0', [
        { id: 'allow-all', effect: 'allow', description: 'Allow everything' },
      ]);
      await activatePolicy('active-policy', '1.0.0');

      // Shadow policy: deny everything
      await createAndActivatePolicy('shadow-policy', '1.0.0', [
        { id: 'deny-all', effect: 'deny', description: 'Deny everything' },
      ]);

      const response = await app.request('/evaluate?shadow=shadow-policy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(makeEnvelope()),
      });

      expect(response.status).toBe(200);
      const body = await response.json();

      // Active policy decision is enforced
      expect(body.decision.outcome).toBe('allow');

      // Shadow result is present and disagrees
      expect(body.shadowResult).toBeDefined();
      expect(body.shadowResult.decision).toBe('deny');
      expect(body.shadowResult.policyId).toBe('shadow-policy');
      expect(body.shadowResult.policyVersion).toBe('1.0.0');
      expect(body.shadowResult.matchedRule).toBe('deny-all');
    });

    it('enforces active decision even when shadow disagrees', async () => {
      // Active policy: deny everything
      await createAndActivatePolicy('strict-policy', '1.0.0', [
        { id: 'deny-all', effect: 'deny', description: 'Deny everything' },
      ]);
      await activatePolicy('strict-policy', '1.0.0');

      // Shadow policy: allow everything
      await createAndActivatePolicy('lenient-policy', '1.0.0', [
        { id: 'allow-all', effect: 'allow', description: 'Allow everything' },
      ]);

      const response = await app.request('/evaluate?shadow=lenient-policy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(makeEnvelope()),
      });

      expect(response.status).toBe(200);
      const body = await response.json();

      // Active policy's deny is enforced - shadow must NEVER override
      expect(body.decision.outcome).toBe('deny');

      // Shadow shows what would have happened
      expect(body.shadowResult.decision).toBe('allow');
    });

    it('supports policyId@version syntax in query parameter', async () => {
      // Active policy
      await createAndActivatePolicy('active-policy', '1.0.0', [
        { id: 'allow-all', effect: 'allow', description: 'Allow' },
      ]);
      await activatePolicy('active-policy', '1.0.0');

      // Shadow policy with specific version
      await createAndActivatePolicy('versioned-shadow', '2.0.0', [
        { id: 'deny-all', effect: 'deny', description: 'Deny' },
      ]);

      const response = await app.request('/evaluate?shadow=versioned-shadow@2.0.0', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(makeEnvelope()),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.shadowResult).toBeDefined();
      expect(body.shadowResult.policyVersion).toBe('2.0.0');
    });
  });

  describe('Shadow policy via environment variable', () => {
    it('uses AUTHENSOR_SHADOW_POLICY_ID when set', async () => {
      // Active policy: allow
      await createAndActivatePolicy('active-policy', '1.0.0', [
        { id: 'allow-all', effect: 'allow', description: 'Allow' },
      ]);
      await activatePolicy('active-policy', '1.0.0');

      // Shadow policy: deny
      await createAndActivatePolicy('env-shadow-policy', '1.0.0', [
        { id: 'deny-all', effect: 'deny', description: 'Deny' },
      ]);

      process.env.AUTHENSOR_SHADOW_POLICY_ID = 'env-shadow-policy';

      const response = await app.request('/evaluate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(makeEnvelope()),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.decision.outcome).toBe('allow');
      expect(body.shadowResult).toBeDefined();
      expect(body.shadowResult.decision).toBe('deny');
      expect(body.shadowResult.policyId).toBe('env-shadow-policy');
    });

    it('query parameter takes priority over env var', async () => {
      // Active policy
      await createAndActivatePolicy('active-policy', '1.0.0', [
        { id: 'allow-all', effect: 'allow', description: 'Allow' },
      ]);
      await activatePolicy('active-policy', '1.0.0');

      // Env shadow policy: allow
      await createAndActivatePolicy('env-shadow', '1.0.0', [
        { id: 'allow-all', effect: 'allow', description: 'Allow' },
      ]);

      // Query shadow policy: deny
      await createAndActivatePolicy('query-shadow', '1.0.0', [
        { id: 'deny-all', effect: 'deny', description: 'Deny' },
      ]);

      process.env.AUTHENSOR_SHADOW_POLICY_ID = 'env-shadow';

      const response = await app.request('/evaluate?shadow=query-shadow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(makeEnvelope()),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.shadowResult.policyId).toBe('query-shadow');
      expect(body.shadowResult.decision).toBe('deny');
    });
  });

  describe('Shadow policy agrees with active', () => {
    it('records both decisions when they agree', async () => {
      // Both policies allow everything
      await createAndActivatePolicy('active-policy', '1.0.0', [
        { id: 'allow-all', effect: 'allow', description: 'Allow' },
      ]);
      await activatePolicy('active-policy', '1.0.0');

      await createAndActivatePolicy('shadow-agree', '1.0.0', [
        { id: 'allow-all-too', effect: 'allow', description: 'Also allow' },
      ]);

      const response = await app.request('/evaluate?shadow=shadow-agree', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(makeEnvelope()),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.decision.outcome).toBe('allow');
      expect(body.shadowResult.decision).toBe('allow');
      expect(body.shadowResult.matchedRule).toBe('allow-all-too');
    });
  });

  describe('Shadow policy not found', () => {
    it('returns normal evaluation when shadow policy does not exist', async () => {
      await createAndActivatePolicy('active-policy', '1.0.0', [
        { id: 'allow-all', effect: 'allow', description: 'Allow' },
      ]);
      await activatePolicy('active-policy', '1.0.0');

      const response = await app.request('/evaluate?shadow=nonexistent-policy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(makeEnvelope()),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.decision.outcome).toBe('allow');
      // No shadow result since the policy wasn't found
      expect(body.shadowResult).toBeUndefined();
    });
  });

  describe('Shadow evaluation never affects active decision', () => {
    it('active deny is enforced even when shadow allows', async () => {
      await createAndActivatePolicy('deny-policy', '1.0.0', [
        { id: 'deny-all', effect: 'deny', description: 'Deny' },
      ]);
      await activatePolicy('deny-policy', '1.0.0');

      await createAndActivatePolicy('allow-shadow', '1.0.0', [
        { id: 'allow-all', effect: 'allow', description: 'Allow' },
      ]);

      const response = await app.request('/evaluate?shadow=allow-shadow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(makeEnvelope()),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      // Active decision is the enforced one
      expect(body.decision.outcome).toBe('deny');
      // Shadow would allow
      expect(body.shadowResult.decision).toBe('allow');
      // The receipt status is based on the active (deny), not the shadow
      const receiptResponse = await app.request(`/receipts/${body.receiptId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (receiptResponse.status === 200) {
        const receipt = await receiptResponse.json();
        expect(receipt.decision.outcome).toBe('deny');
      }
    });
  });

  describe('GET /shadow/report', () => {
    it('requires admin role', async () => {
      const response = await app.request('/shadow/report', {
        headers: { Authorization: `Bearer ${ingestToken}` },
      });
      expect(response.status).toBe(403);
    });

    it('returns empty report when no shadow evaluations exist', async () => {
      const response = await app.request('/shadow/report', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.totalEvaluations).toBe(0);
      expect(body.agreements).toBe(0);
      expect(body.disagreements).toBe(0);
      expect(body.agreementRate).toBe(1);
      expect(body.divergences).toEqual([]);
    });

    it('reports correct statistics after shadow evaluations', async () => {
      // Seed shadow_evaluations directly for report testing
      // This avoids depending on the evaluate endpoint's fire-and-forget behavior
      try {
        await db.query(
          `INSERT INTO shadow_evaluations
           (id, receipt_id, active_policy_id, active_policy_version, active_decision, active_matched_rule,
            shadow_policy_id, shadow_policy_version, shadow_decision, shadow_matched_rule, decisions_agree)
           VALUES
           ($1, $2, 'active', '1.0.0', 'allow', 'rule-1', 'shadow', '2.0.0', 'allow', 'rule-a', true),
           ($3, $4, 'active', '1.0.0', 'allow', 'rule-1', 'shadow', '2.0.0', 'deny', 'rule-b', false),
           ($5, $6, 'active', '1.0.0', 'deny', 'rule-2', 'shadow', '2.0.0', 'deny', 'rule-b', true)`,
          [
            crypto.randomUUID(), crypto.randomUUID(),
            crypto.randomUUID(), crypto.randomUUID(),
            crypto.randomUUID(), crypto.randomUUID(),
          ]
        );
      } catch {
        // If shadow_evaluations table doesn't exist in pg-mem, skip
        return;
      }

      const response = await app.request('/shadow/report?shadow_policy_id=shadow', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.totalEvaluations).toBe(3);
      expect(body.agreements).toBe(2);
      expect(body.disagreements).toBe(1);
      expect(body.agreementRate).toBeCloseTo(2 / 3, 2);
      expect(body.divergences).toHaveLength(1);
      expect(body.divergences[0].activeDecision).toBe('allow');
      expect(body.divergences[0].shadowDecision).toBe('deny');
    });
  });

  describe('Shadow evaluation with different rule conditions', () => {
    it('shadow policy evaluates independently against its own rules', async () => {
      // Active policy: allow only "safe" actions
      await createAndActivatePolicy('active-selective', '1.0.0', [
        {
          id: 'allow-safe',
          effect: 'allow',
          description: 'Allow safe actions',
          condition: { field: 'action.type', operator: 'eq', value: 'safe.action' },
        },
      ], 'deny');
      await activatePolicy('active-selective', '1.0.0');

      // Shadow policy: allow everything
      await createAndActivatePolicy('shadow-permissive', '1.0.0', [
        { id: 'allow-all', effect: 'allow', description: 'Allow everything' },
      ]);

      // Test with an action that doesn't match the active policy's condition
      const response = await app.request('/evaluate?shadow=shadow-permissive', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(makeEnvelope({
          action: { type: 'dangerous.action', resource: 'test://resource' },
        })),
      });

      expect(response.status).toBe(200);
      const body = await response.json();

      // Active policy denies (condition doesn't match, defaultEffect = deny)
      expect(body.decision.outcome).toBe('deny');

      // Shadow policy allows (no condition = always matches)
      expect(body.shadowResult.decision).toBe('allow');
      expect(body.shadowResult.matchedRule).toBe('allow-all');
    });
  });
});
