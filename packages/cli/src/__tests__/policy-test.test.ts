import { describe, it, expect } from 'vitest';
import { runTestCase, runTestSuite } from '../policy/test.js';
import type { TestCase } from '../policy/test.js';

// ── Mock Engine ──────────────────────────────────────────────────────

/**
 * Minimal mock engine that mimics PolicyEngine.evaluate().
 * Evaluates rules in order: if a rule has no condition, it matches.
 * If a rule has a condition with field/operator/value, does simple eq check.
 */
function createMockEngine() {
  return {
    evaluate: (envelope: Record<string, unknown>, policies: Record<string, unknown>[]) => {
      for (const policy of policies) {
        const rules = (policy.rules ?? []) as Array<Record<string, unknown>>;
        for (const rule of rules) {
          const condition = rule.condition as Record<string, unknown> | undefined;

          if (!condition) {
            // No condition = matches everything
            return {
              decision: {
                outcome: rule.effect as string,
                policyId: policy.id as string,
                reason: rule.description as string | undefined,
              },
              matchedRule: { id: rule.id as string },
              matchedPolicy: { id: policy.id as string },
            };
          }

          // Simple field eq evaluation
          if (condition.field && condition.operator === 'eq') {
            const fieldPath = (condition.field as string).split('.');
            let val: unknown = envelope;
            for (const part of fieldPath) {
              val = (val as Record<string, unknown>)?.[part];
            }
            if (val === condition.value) {
              return {
                decision: {
                  outcome: rule.effect as string,
                  policyId: policy.id as string,
                  reason: rule.description as string | undefined,
                },
                matchedRule: { id: rule.id as string },
                matchedPolicy: { id: policy.id as string },
              };
            }
          }
        }

        // No rules matched — use default effect
        const defaultEffect = (policy.defaultEffect as string) ?? 'deny';
        return {
          decision: {
            outcome: defaultEffect,
            policyId: policy.id as string,
            reason: `Default policy effect: ${defaultEffect}`,
          },
          matchedPolicy: { id: policy.id as string },
        };
      }

      // No policies
      return {
        decision: { outcome: 'deny', reason: 'No matching policy found' },
      };
    },
  };
}

// ── Test Cases ───────────────────────────────────────────────────────

const samplePolicy = {
  id: 'test-policy',
  name: 'Test Policy',
  version: '1.0.0',
  defaultEffect: 'deny',
  rules: [
    {
      id: 'allow-reads',
      effect: 'allow',
      description: 'Allow read operations',
      condition: {
        field: 'action.operation',
        operator: 'eq',
        value: 'read',
      },
    },
    {
      id: 'deny-all',
      effect: 'deny',
      description: 'Deny everything else',
    },
  ],
};

const sampleEnvelope = {
  id: 'env-1',
  timestamp: '2024-01-01T00:00:00Z',
  action: { type: 'http.request', resource: 'https://api.example.com', operation: 'read' },
  principal: { type: 'agent', id: 'agent-1' },
  context: {},
};

describe('policy test runner', () => {
  const engine = createMockEngine();

  // ── runTestCase ─────────────────────────────────────────────────

  describe('runTestCase', () => {
    it('passes when outcome matches expected', () => {
      const testCase: TestCase = {
        name: 'should allow read operations',
        envelope: sampleEnvelope,
        expected: { outcome: 'allow' },
      };

      const result = runTestCase(testCase, samplePolicy, engine);
      expect(result.passed).toBe(true);
      expect(result.diffs).toBeUndefined();
    });

    it('fails when outcome does not match', () => {
      const testCase: TestCase = {
        name: 'should deny read operations',
        envelope: sampleEnvelope,
        expected: { outcome: 'deny' },
      };

      const result = runTestCase(testCase, samplePolicy, engine);
      expect(result.passed).toBe(false);
      expect(result.diffs).toBeDefined();
      expect(result.diffs).toContainEqual(
        expect.objectContaining({
          field: 'outcome',
          expected: 'deny',
          actual: 'allow',
        })
      );
    });

    it('checks matchedRuleId when specified', () => {
      const testCase: TestCase = {
        name: 'should match allow-reads rule',
        envelope: sampleEnvelope,
        expected: { outcome: 'allow', matchedRuleId: 'allow-reads' },
      };

      const result = runTestCase(testCase, samplePolicy, engine);
      expect(result.passed).toBe(true);
    });

    it('fails when matchedRuleId does not match', () => {
      const testCase: TestCase = {
        name: 'should match wrong rule',
        envelope: sampleEnvelope,
        expected: { outcome: 'allow', matchedRuleId: 'wrong-rule' },
      };

      const result = runTestCase(testCase, samplePolicy, engine);
      expect(result.passed).toBe(false);
      expect(result.diffs).toContainEqual(
        expect.objectContaining({
          field: 'matchedRuleId',
          expected: 'wrong-rule',
          actual: 'allow-reads',
        })
      );
    });

    it('checks policyId when specified', () => {
      const testCase: TestCase = {
        name: 'should match test policy',
        envelope: sampleEnvelope,
        expected: { outcome: 'allow', policyId: 'test-policy' },
      };

      const result = runTestCase(testCase, samplePolicy, engine);
      expect(result.passed).toBe(true);
    });

    it('checks reason substring match when specified', () => {
      const writeEnvelope = {
        ...sampleEnvelope,
        action: { ...sampleEnvelope.action, operation: 'create' },
      };

      const testCase: TestCase = {
        name: 'should deny with catch-all reason',
        envelope: writeEnvelope,
        expected: { outcome: 'deny', reason: 'Deny everything' },
      };

      const result = runTestCase(testCase, samplePolicy, engine);
      expect(result.passed).toBe(true);
    });

    it('handles engine errors gracefully', () => {
      const brokenEngine = {
        evaluate: () => {
          throw new Error('Engine exploded');
        },
      };

      const testCase: TestCase = {
        name: 'should handle error',
        envelope: sampleEnvelope,
        expected: { outcome: 'allow' },
      };

      const result = runTestCase(testCase, samplePolicy, brokenEngine);
      expect(result.passed).toBe(false);
      expect(result.error).toBe('Engine exploded');
    });

    it('ignores matchedRuleId when not in expected', () => {
      const testCase: TestCase = {
        name: 'only check outcome',
        envelope: sampleEnvelope,
        expected: { outcome: 'allow' },
      };

      const result = runTestCase(testCase, samplePolicy, engine);
      expect(result.passed).toBe(true);
      // actual should still have the info
      expect(result.actual?.matchedRuleId).toBe('allow-reads');
    });
  });

  // ── runTestSuite ────────────────────────────────────────────────

  describe('runTestSuite', () => {
    it('runs all test cases and reports totals', () => {
      const tests: TestCase[] = [
        {
          name: 'allow read',
          envelope: sampleEnvelope,
          expected: { outcome: 'allow' },
        },
        {
          name: 'deny write',
          envelope: {
            ...sampleEnvelope,
            action: { ...sampleEnvelope.action, operation: 'create' },
          },
          expected: { outcome: 'deny' },
        },
      ];

      const result = runTestSuite(tests, samplePolicy, engine);
      expect(result.total).toBe(2);
      expect(result.passed).toBe(2);
      expect(result.failed).toBe(0);
    });

    it('correctly counts failures', () => {
      const tests: TestCase[] = [
        {
          name: 'this should pass',
          envelope: sampleEnvelope,
          expected: { outcome: 'allow' },
        },
        {
          name: 'this should fail (wrong expectation)',
          envelope: sampleEnvelope,
          expected: { outcome: 'deny' },
        },
        {
          name: 'this should also fail',
          envelope: {
            ...sampleEnvelope,
            action: { ...sampleEnvelope.action, operation: 'create' },
          },
          expected: { outcome: 'allow' },
        },
      ];

      const result = runTestSuite(tests, samplePolicy, engine);
      expect(result.total).toBe(3);
      expect(result.passed).toBe(1);
      expect(result.failed).toBe(2);
    });

    it('handles empty test suite', () => {
      const result = runTestSuite([], samplePolicy, engine);
      expect(result.total).toBe(0);
      expect(result.passed).toBe(0);
      expect(result.failed).toBe(0);
    });
  });

  // ── Default effect ────────────────────────────────────────────────

  describe('default effect fallthrough', () => {
    it('uses policy defaultEffect when no rules match', () => {
      const policyWithNoRules = {
        id: 'empty-policy',
        name: 'Empty',
        version: '1.0.0',
        defaultEffect: 'allow',
        rules: [
          {
            id: 'specific-only',
            effect: 'deny',
            condition: {
              field: 'action.type',
              operator: 'eq',
              value: 'admin.nuke',
            },
          },
        ],
      };

      const testCase: TestCase = {
        name: 'falls through to defaultEffect',
        envelope: sampleEnvelope,
        expected: { outcome: 'allow' },
      };

      const result = runTestCase(testCase, policyWithNoRules, engine);
      expect(result.passed).toBe(true);
    });
  });
});
