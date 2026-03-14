import { describe, expect, it } from 'vitest';
import { evaluateBudget } from '../src/budget-evaluator.js';
import type { ActionEnvelope, PolicyRule, BudgetState } from '../src/types.js';

/** Helper to create a minimal valid envelope */
function makeEnvelope(overrides: Partial<ActionEnvelope> = {}): ActionEnvelope {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    timestamp: new Date().toISOString(),
    action: {
      type: 'openai.chat.completions',
      resource: 'openai://chat',
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

/** Helper to create a budget state */
function makeBudgetState(overrides: Partial<BudgetState> = {}): BudgetState {
  return {
    spentAmount: 0,
    budgetAmount: 100,
    period: 'daily',
    resetAt: new Date(Date.now() + 86400000).toISOString(),
    ...overrides,
  };
}

describe('evaluateBudget', () => {
  // ─── No costBudget on the rule ──────────────────────────────────────

  describe('when rule has no costBudget', () => {
    it('allows with zero cost and no checks', () => {
      const envelope = makeEnvelope({ constraints: { maxAmount: 5.00 } });
      const rule = makeRule();

      const result = evaluateBudget(envelope, rule, null);

      expect(result.allowed).toBe(true);
      expect(result.actionCost).toBe(0);
      expect(result.code).toBeUndefined();
    });
  });

  // ─── Per-action cost limit ──────────────────────────────────────────

  describe('per-action cost limit (maxActionCost)', () => {
    it('allows action within per-action limit', () => {
      const envelope = makeEnvelope({ constraints: { maxAmount: 2.50 } });
      const rule = makeRule({
        costBudget: {
          maxActionCost: 5.00,
          maxBudget: 100,
          period: 'daily',
        },
      });

      const result = evaluateBudget(envelope, rule, null);

      expect(result.allowed).toBe(true);
      expect(result.actionCost).toBe(2.50);
    });

    it('denies action exceeding per-action limit', () => {
      const envelope = makeEnvelope({ constraints: { maxAmount: 10.00 } });
      const rule = makeRule({
        costBudget: {
          maxActionCost: 5.00,
          maxBudget: 100,
          period: 'daily',
        },
      });

      const result = evaluateBudget(envelope, rule, null);

      expect(result.allowed).toBe(false);
      expect(result.code).toBe('ACTION_COST_EXCEEDED');
      expect(result.reason).toContain('$10.00');
      expect(result.reason).toContain('$5.00');
    });

    it('allows action exactly at per-action limit', () => {
      const envelope = makeEnvelope({ constraints: { maxAmount: 5.00 } });
      const rule = makeRule({
        costBudget: {
          maxActionCost: 5.00,
          maxBudget: 100,
          period: 'daily',
        },
      });

      const result = evaluateBudget(envelope, rule, null);

      expect(result.allowed).toBe(true);
      expect(result.actionCost).toBe(5.00);
    });
  });

  // ─── Cumulative budget enforcement ──────────────────────────────────

  describe('cumulative budget enforcement (maxBudget)', () => {
    it('allows action within remaining budget', () => {
      const envelope = makeEnvelope({ constraints: { maxAmount: 10.00 } });
      const rule = makeRule({
        costBudget: { maxBudget: 100, period: 'daily' },
      });
      const budgetState = makeBudgetState({ spentAmount: 50, budgetAmount: 100 });

      const result = evaluateBudget(envelope, rule, budgetState);

      expect(result.allowed).toBe(true);
      expect(result.actionCost).toBe(10.00);
      expect(result.remainingBudget).toBe(40); // 100 - 50 - 10
      expect(result.utilization).toBeCloseTo(0.6); // 60/100
    });

    it('denies action that would exceed budget', () => {
      const envelope = makeEnvelope({ constraints: { maxAmount: 20.00 } });
      const rule = makeRule({
        costBudget: { maxBudget: 100, period: 'daily' },
      });
      const budgetState = makeBudgetState({ spentAmount: 90, budgetAmount: 100 });

      const result = evaluateBudget(envelope, rule, budgetState);

      expect(result.allowed).toBe(false);
      expect(result.code).toBe('BUDGET_EXCEEDED');
      expect(result.reason).toContain('$110.00');
      expect(result.reason).toContain('$100.00');
      expect(result.remainingBudget).toBe(-10); // 100 - 90 - 20
    });

    it('denies when budget is already fully spent', () => {
      const envelope = makeEnvelope({ constraints: { maxAmount: 1.00 } });
      const rule = makeRule({
        costBudget: { maxBudget: 100, period: 'daily' },
      });
      const budgetState = makeBudgetState({ spentAmount: 100, budgetAmount: 100 });

      const result = evaluateBudget(envelope, rule, budgetState);

      expect(result.allowed).toBe(false);
      expect(result.code).toBe('BUDGET_EXCEEDED');
    });

    it('allows zero-cost action even when budget is exhausted', () => {
      const envelope = makeEnvelope(); // no constraints.maxAmount
      const rule = makeRule({
        costBudget: { maxBudget: 100, period: 'daily' },
      });
      const budgetState = makeBudgetState({ spentAmount: 100, budgetAmount: 100 });

      const result = evaluateBudget(envelope, rule, budgetState);

      expect(result.allowed).toBe(true);
      expect(result.actionCost).toBe(0);
    });

    it('allows action that exactly fills the budget', () => {
      const envelope = makeEnvelope({ constraints: { maxAmount: 10.00 } });
      const rule = makeRule({
        costBudget: { maxBudget: 100, period: 'daily' },
      });
      const budgetState = makeBudgetState({ spentAmount: 90, budgetAmount: 100 });

      const result = evaluateBudget(envelope, rule, budgetState);

      expect(result.allowed).toBe(true);
      expect(result.remainingBudget).toBe(0);
      expect(result.utilization).toBe(1.0);
    });
  });

  // ─── Alert thresholds ──────────────────────────────────────────────

  describe('alert threshold detection', () => {
    it('reports breached 80% threshold', () => {
      const envelope = makeEnvelope({ constraints: { maxAmount: 5.00 } });
      const rule = makeRule({
        costBudget: {
          maxBudget: 100,
          period: 'daily',
          alertThresholds: [0.8, 0.9, 1.0],
        },
      });
      // Currently at 76%, action takes us to 81%
      const budgetState = makeBudgetState({ spentAmount: 76, budgetAmount: 100 });

      const result = evaluateBudget(envelope, rule, budgetState);

      expect(result.allowed).toBe(true);
      expect(result.breachedThresholds).toContain(0.8);
      expect(result.breachedThresholds).not.toContain(0.9);
      expect(result.breachedThresholds).not.toContain(1.0);
    });

    it('reports multiple breached thresholds', () => {
      const envelope = makeEnvelope({ constraints: { maxAmount: 20.00 } });
      const rule = makeRule({
        costBudget: {
          maxBudget: 100,
          period: 'daily',
          alertThresholds: [0.8, 0.9, 1.0],
        },
      });
      // Currently at 75%, action takes us to 95%
      const budgetState = makeBudgetState({ spentAmount: 75, budgetAmount: 100 });

      const result = evaluateBudget(envelope, rule, budgetState);

      expect(result.allowed).toBe(true);
      expect(result.breachedThresholds).toContain(0.8);
      expect(result.breachedThresholds).toContain(0.9);
      expect(result.breachedThresholds).not.toContain(1.0);
    });

    it('does not report already-breached thresholds', () => {
      const envelope = makeEnvelope({ constraints: { maxAmount: 5.00 } });
      const rule = makeRule({
        costBudget: {
          maxBudget: 100,
          period: 'daily',
          alertThresholds: [0.8, 0.9, 1.0],
        },
      });
      // Currently at 85%, action takes us to 90%
      const budgetState = makeBudgetState({ spentAmount: 85, budgetAmount: 100 });

      const result = evaluateBudget(envelope, rule, budgetState);

      expect(result.allowed).toBe(true);
      // 80% threshold was already breached (85% > 80%), so not in breachedThresholds
      expect(result.breachedThresholds).not.toContain(0.8);
      expect(result.breachedThresholds).toContain(0.9);
    });

    it('uses default thresholds [0.8, 0.9, 1.0] when none specified', () => {
      const envelope = makeEnvelope({ constraints: { maxAmount: 5.00 } });
      const rule = makeRule({
        costBudget: {
          maxBudget: 100,
          period: 'daily',
          // no alertThresholds specified
        },
      });
      const budgetState = makeBudgetState({ spentAmount: 76, budgetAmount: 100 });

      const result = evaluateBudget(envelope, rule, budgetState);

      expect(result.breachedThresholds).toContain(0.8);
    });
  });

  // ─── Combined per-action + cumulative ───────────────────────────────

  describe('combined per-action and cumulative checks', () => {
    it('per-action check runs before cumulative check', () => {
      const envelope = makeEnvelope({ constraints: { maxAmount: 50.00 } });
      const rule = makeRule({
        costBudget: {
          maxActionCost: 10.00,
          maxBudget: 1000,
          period: 'daily',
        },
      });
      const budgetState = makeBudgetState({ spentAmount: 0, budgetAmount: 1000 });

      const result = evaluateBudget(envelope, rule, budgetState);

      // Should fail on per-action, not cumulative
      expect(result.allowed).toBe(false);
      expect(result.code).toBe('ACTION_COST_EXCEEDED');
    });
  });

  // ─── Edge cases ────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles no constraints.maxAmount (defaults to 0)', () => {
      const envelope = makeEnvelope(); // no constraints at all
      const rule = makeRule({
        costBudget: {
          maxActionCost: 5.00,
          maxBudget: 100,
          period: 'daily',
        },
      });

      const result = evaluateBudget(envelope, rule, null);

      expect(result.allowed).toBe(true);
      expect(result.actionCost).toBe(0);
    });

    it('handles costBudget with no budget state (control plane did not provide it)', () => {
      const envelope = makeEnvelope({ constraints: { maxAmount: 5.00 } });
      const rule = makeRule({
        costBudget: { maxBudget: 100, period: 'daily' },
      });

      const result = evaluateBudget(envelope, rule, null);

      // Fail-open for budget tracking (per-action limit is still enforced)
      expect(result.allowed).toBe(true);
      expect(result.actionCost).toBe(5.00);
    });

    it('handles zero budget amount', () => {
      const envelope = makeEnvelope({ constraints: { maxAmount: 0.01 } });
      const rule = makeRule({
        costBudget: { maxBudget: 0, period: 'daily' },
      });
      const budgetState = makeBudgetState({ spentAmount: 0, budgetAmount: 0 });

      const result = evaluateBudget(envelope, rule, budgetState);

      // Can't spend any amount against a zero budget
      expect(result.allowed).toBe(false);
      expect(result.code).toBe('BUDGET_EXCEEDED');
    });
  });
});
