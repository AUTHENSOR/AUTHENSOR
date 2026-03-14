import { describe, expect, it } from 'vitest';
import { enforceConstraints } from '../src/constraint-enforcer.js';
import type { ActionEnvelope, PolicyRule } from '../src/types.js';

/** Helper to create a minimal valid envelope */
function makeEnvelope(overrides: Partial<ActionEnvelope> = {}): ActionEnvelope {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    timestamp: new Date().toISOString(),
    action: {
      type: 'stripe.charges.create',
      resource: 'stripe://charges',
    },
    principal: { type: 'agent', id: 'agent-1' },
    context: { environment: 'production' },
    ...overrides,
  };
}

/** Helper to create a minimal valid rule */
function makeRule(overrides: Partial<PolicyRule> = {}): PolicyRule {
  return {
    id: 'test-rule',
    effect: 'allow',
    ...overrides,
  };
}

describe('enforceConstraints', () => {
  // ─── No policy constraints ──────────────────────────────────────────

  describe('when rule has no constraints', () => {
    it('passes through envelope constraints unchanged', () => {
      const envelope = makeEnvelope({
        constraints: { maxAmount: 500, allowedDomains: ['api.example.com'], timeout: 5000 },
      });
      const rule = makeRule();

      const result = enforceConstraints(rule, envelope);

      expect(result.ok).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.enforcedConstraints.maxAmount).toBe(500);
      expect(result.enforcedConstraints.allowedDomains).toEqual(['api.example.com']);
      expect(result.enforcedConstraints.timeout).toBe(5000);
    });

    it('returns undefined for constraints not in envelope', () => {
      const envelope = makeEnvelope();
      const rule = makeRule();

      const result = enforceConstraints(rule, envelope);

      expect(result.ok).toBe(true);
      expect(result.enforcedConstraints.maxAmount).toBeUndefined();
      expect(result.enforcedConstraints.allowedDomains).toBeUndefined();
      expect(result.enforcedConstraints.timeout).toBeUndefined();
    });
  });

  // ─── maxAmount ──────────────────────────────────────────────────────

  describe('maxAmount', () => {
    it('policy overrides when envelope omits maxAmount', () => {
      const envelope = makeEnvelope();
      const rule = makeRule({ constraints: { maxAmount: 100 } });

      const result = enforceConstraints(rule, envelope);

      expect(result.ok).toBe(true);
      expect(result.enforcedConstraints.maxAmount).toBe(100);
    });

    it('uses policy limit when envelope declares a higher amount', () => {
      const envelope = makeEnvelope({ constraints: { maxAmount: 10000 } });
      const rule = makeRule({ constraints: { maxAmount: 100 } });

      const result = enforceConstraints(rule, envelope);

      // Policy wins (stricter), but this is a violation because envelope tried to exceed
      expect(result.ok).toBe(false);
      expect(result.enforcedConstraints.maxAmount).toBe(100);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].constraint).toBe('maxAmount');
      expect(result.violations[0].envelopeValue).toBe(10000);
      expect(result.violations[0].policyValue).toBe(100);
    });

    it('uses envelope limit when envelope declares a lower amount', () => {
      const envelope = makeEnvelope({ constraints: { maxAmount: 50 } });
      const rule = makeRule({ constraints: { maxAmount: 100 } });

      const result = enforceConstraints(rule, envelope);

      expect(result.ok).toBe(true);
      expect(result.enforcedConstraints.maxAmount).toBe(50);
      expect(result.violations).toHaveLength(0);
    });

    it('accepts equal amounts without violation', () => {
      const envelope = makeEnvelope({ constraints: { maxAmount: 100 } });
      const rule = makeRule({ constraints: { maxAmount: 100 } });

      const result = enforceConstraints(rule, envelope);

      expect(result.ok).toBe(true);
      expect(result.enforcedConstraints.maxAmount).toBe(100);
    });
  });

  // ─── allowedDomains ─────────────────────────────────────────────────

  describe('allowedDomains', () => {
    it('policy fills in domains when envelope omits them', () => {
      const envelope = makeEnvelope();
      const rule = makeRule({
        constraints: { allowedDomains: ['api.stripe.com', 'api.github.com'] },
      });

      const result = enforceConstraints(rule, envelope);

      expect(result.ok).toBe(true);
      expect(result.enforcedConstraints.allowedDomains).toEqual([
        'api.stripe.com',
        'api.github.com',
      ]);
    });

    it('policy replaces envelope domains entirely', () => {
      const envelope = makeEnvelope({
        constraints: { allowedDomains: ['api.stripe.com'] },
      });
      const rule = makeRule({
        constraints: { allowedDomains: ['api.stripe.com', 'api.github.com'] },
      });

      const result = enforceConstraints(rule, envelope);

      expect(result.ok).toBe(true);
      // Policy whitelist is the enforced set
      expect(result.enforcedConstraints.allowedDomains).toEqual([
        'api.stripe.com',
        'api.github.com',
      ]);
    });

    it('violation when envelope declares domains outside policy whitelist', () => {
      const envelope = makeEnvelope({
        constraints: { allowedDomains: ['api.stripe.com', 'evil.com'] },
      });
      const rule = makeRule({
        constraints: { allowedDomains: ['api.stripe.com'] },
      });

      const result = enforceConstraints(rule, envelope);

      expect(result.ok).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].constraint).toBe('allowedDomains');
      expect(result.violations[0].reason).toContain('evil.com');
      // Enforced is still the policy whitelist
      expect(result.enforcedConstraints.allowedDomains).toEqual(['api.stripe.com']);
    });

    it('no violation when envelope domains are a subset of policy whitelist', () => {
      const envelope = makeEnvelope({
        constraints: { allowedDomains: ['api.stripe.com'] },
      });
      const rule = makeRule({
        constraints: { allowedDomains: ['api.stripe.com', 'api.github.com'] },
      });

      const result = enforceConstraints(rule, envelope);

      expect(result.ok).toBe(true);
    });
  });

  // ─── timeout ────────────────────────────────────────────────────────

  describe('timeout', () => {
    it('policy fills in timeout when envelope omits it', () => {
      const envelope = makeEnvelope();
      const rule = makeRule({ constraints: { timeout: 30000 } });

      const result = enforceConstraints(rule, envelope);

      expect(result.ok).toBe(true);
      expect(result.enforcedConstraints.timeout).toBe(30000);
    });

    it('uses policy timeout when envelope declares a higher timeout', () => {
      const envelope = makeEnvelope({ constraints: { timeout: 120000 } });
      const rule = makeRule({ constraints: { timeout: 30000 } });

      const result = enforceConstraints(rule, envelope);

      expect(result.ok).toBe(false);
      expect(result.enforcedConstraints.timeout).toBe(30000);
      expect(result.violations[0].constraint).toBe('timeout');
    });

    it('uses envelope timeout when envelope declares a lower timeout', () => {
      const envelope = makeEnvelope({ constraints: { timeout: 5000 } });
      const rule = makeRule({ constraints: { timeout: 30000 } });

      const result = enforceConstraints(rule, envelope);

      expect(result.ok).toBe(true);
      expect(result.enforcedConstraints.timeout).toBe(5000);
    });
  });

  // ─── requireConstraints ─────────────────────────────────────────────

  describe('requireConstraints', () => {
    it('passes when all required fields are present', () => {
      const envelope = makeEnvelope({
        constraints: { maxAmount: 100, timeout: 5000 },
      });
      const rule = makeRule({
        constraints: { requireConstraints: ['maxAmount', 'timeout'] },
      });

      const result = enforceConstraints(rule, envelope);

      expect(result.ok).toBe(true);
    });

    it('fails when a required field is missing from envelope', () => {
      const envelope = makeEnvelope({
        constraints: { maxAmount: 100 },
      });
      const rule = makeRule({
        constraints: { requireConstraints: ['maxAmount', 'timeout'] },
      });

      const result = enforceConstraints(rule, envelope);

      expect(result.ok).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].constraint).toBe('requireConstraints');
      expect(result.violations[0].reason).toContain('timeout');
    });

    it('fails when envelope has no constraints at all', () => {
      const envelope = makeEnvelope();
      const rule = makeRule({
        constraints: { requireConstraints: ['maxAmount'] },
      });

      const result = enforceConstraints(rule, envelope);

      expect(result.ok).toBe(false);
      expect(result.violations[0].reason).toContain('maxAmount');
    });

    it('fails with multiple violations for multiple missing fields', () => {
      const envelope = makeEnvelope();
      const rule = makeRule({
        constraints: {
          requireConstraints: ['maxAmount', 'allowedDomains', 'timeout'],
        },
      });

      const result = enforceConstraints(rule, envelope);

      expect(result.ok).toBe(false);
      expect(result.violations).toHaveLength(3);
      const missingFields = result.violations.map((v) => v.policyValue);
      expect(missingFields).toContain('maxAmount');
      expect(missingFields).toContain('allowedDomains');
      expect(missingFields).toContain('timeout');
    });

    it('works with currency in requireConstraints', () => {
      const envelope = makeEnvelope({
        constraints: { maxAmount: 100, currency: 'USD' },
      });
      const rule = makeRule({
        constraints: { requireConstraints: ['maxAmount', 'currency'] },
      });

      const result = enforceConstraints(rule, envelope);

      expect(result.ok).toBe(true);
    });

    it('fails when currency is required but missing', () => {
      const envelope = makeEnvelope({
        constraints: { maxAmount: 100 },
      });
      const rule = makeRule({
        constraints: { requireConstraints: ['currency'] },
      });

      const result = enforceConstraints(rule, envelope);

      expect(result.ok).toBe(false);
      expect(result.violations[0].reason).toContain('currency');
    });
  });

  // ─── Combined constraints ──────────────────────────────────────────

  describe('combined constraints', () => {
    it('enforces all constraint types simultaneously', () => {
      const envelope = makeEnvelope({
        constraints: {
          maxAmount: 50,
          allowedDomains: ['api.stripe.com'],
          timeout: 5000,
        },
      });
      const rule = makeRule({
        constraints: {
          maxAmount: 100,
          allowedDomains: ['api.stripe.com', 'api.github.com'],
          timeout: 30000,
          requireConstraints: ['maxAmount'],
        },
      });

      const result = enforceConstraints(rule, envelope);

      expect(result.ok).toBe(true);
      expect(result.enforcedConstraints.maxAmount).toBe(50);
      expect(result.enforcedConstraints.allowedDomains).toEqual([
        'api.stripe.com',
        'api.github.com',
      ]);
      expect(result.enforcedConstraints.timeout).toBe(5000);
    });

    it('reports multiple violations across different constraint types', () => {
      const envelope = makeEnvelope({
        constraints: {
          maxAmount: 5000,
          allowedDomains: ['evil.com'],
          timeout: 999999,
        },
      });
      const rule = makeRule({
        constraints: {
          maxAmount: 100,
          allowedDomains: ['api.stripe.com'],
          timeout: 30000,
        },
      });

      const result = enforceConstraints(rule, envelope);

      expect(result.ok).toBe(false);
      expect(result.violations).toHaveLength(3);
      const constraintTypes = result.violations.map((v) => v.constraint);
      expect(constraintTypes).toContain('maxAmount');
      expect(constraintTypes).toContain('allowedDomains');
      expect(constraintTypes).toContain('timeout');
    });

    it('requireConstraints violation combined with value override violation', () => {
      const envelope = makeEnvelope({
        constraints: { maxAmount: 5000 },
      });
      const rule = makeRule({
        constraints: {
          maxAmount: 100,
          requireConstraints: ['maxAmount', 'timeout'],
        },
      });

      const result = enforceConstraints(rule, envelope);

      expect(result.ok).toBe(false);
      // Two violations: maxAmount exceeds limit + timeout is missing
      expect(result.violations).toHaveLength(2);
    });
  });

  // ─── Confused deputy scenario ──────────────────────────────────────

  describe('confused deputy prevention', () => {
    it('denies when envelope completely omits constraints that policy requires', () => {
      // A confused deputy agent sends an envelope with NO constraints
      const envelope = makeEnvelope();
      const rule = makeRule({
        constraints: {
          maxAmount: 100,
          requireConstraints: ['maxAmount'],
        },
      });

      const result = enforceConstraints(rule, envelope);

      expect(result.ok).toBe(false);
      expect(result.violations[0].reason).toContain('missing required constraint');
    });

    it('prevents amount inflation attack', () => {
      // Attacker tries to set a huge maxAmount to bypass the policy
      const envelope = makeEnvelope({
        constraints: { maxAmount: 1000000 },
      });
      const rule = makeRule({
        constraints: { maxAmount: 100 },
      });

      const result = enforceConstraints(rule, envelope);

      expect(result.ok).toBe(false);
      expect(result.enforcedConstraints.maxAmount).toBe(100);
    });

    it('prevents domain injection attack', () => {
      // Attacker tries to add their own domain to the whitelist
      const envelope = makeEnvelope({
        constraints: { allowedDomains: ['api.stripe.com', 'attacker.com'] },
      });
      const rule = makeRule({
        constraints: { allowedDomains: ['api.stripe.com'] },
      });

      const result = enforceConstraints(rule, envelope);

      expect(result.ok).toBe(false);
      expect(result.violations[0].reason).toContain('attacker.com');
    });
  });
});
