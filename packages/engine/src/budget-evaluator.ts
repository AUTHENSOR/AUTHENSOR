/**
 * Budget Evaluator — Pure, synchronous cost budget enforcement.
 *
 * Evaluates whether an action's declared cost fits within:
 *   1. The per-action cost limit from the policy rule
 *   2. The remaining cumulative budget for the principal
 *
 * Budget state is injected by the control plane (no I/O in the engine).
 */

import type { ActionEnvelope, BudgetState, PolicyRule } from './types.js';

export interface BudgetEvaluationResult {
  /** Whether the action is within budget */
  allowed: boolean;
  /** Machine-readable denial code */
  code?: 'ACTION_COST_EXCEEDED' | 'BUDGET_EXCEEDED';
  /** Human-readable reason for denial */
  reason?: string;
  /** The declared cost of this action */
  actionCost: number;
  /** Remaining budget after this action (negative if over budget) */
  remainingBudget?: number;
  /** Budget utilization as a fraction (0-1+) */
  utilization?: number;
  /** Thresholds that have been breached (e.g., 0.8, 0.9, 1.0) */
  breachedThresholds?: number[];
}

/**
 * Evaluate whether an action fits within cost budget constraints.
 *
 * @param envelope - The action envelope (may declare constraints.maxAmount as action cost)
 * @param rule - The matched policy rule (may define costBudget limits)
 * @param budgetState - Current budget state from the control plane (null if no budget tracking)
 * @returns Budget evaluation result
 */
export function evaluateBudget(
  envelope: ActionEnvelope,
  rule: PolicyRule,
  budgetState: BudgetState | null
): BudgetEvaluationResult {
  const costBudget = rule.costBudget as CostBudgetConfig | undefined;

  // If no costBudget config on the rule, nothing to enforce
  if (!costBudget) {
    return { allowed: true, actionCost: 0 };
  }

  // The action cost comes from the envelope's constraints.maxAmount
  // This is the declared cost ceiling for this action
  const actionCost = envelope.constraints?.maxAmount ?? 0;

  // 1. Check per-action cost limit
  if (costBudget.maxActionCost !== undefined && actionCost > costBudget.maxActionCost) {
    return {
      allowed: false,
      code: 'ACTION_COST_EXCEEDED',
      reason: `Action cost $${actionCost.toFixed(2)} exceeds per-action limit of $${costBudget.maxActionCost.toFixed(2)}`,
      actionCost,
    };
  }

  // 2. Check cumulative budget
  if (budgetState) {
    const remainingBefore = budgetState.budgetAmount - budgetState.spentAmount;
    const remainingAfter = remainingBefore - actionCost;
    const utilizationAfter =
      budgetState.budgetAmount > 0
        ? (budgetState.spentAmount + actionCost) / budgetState.budgetAmount
        : actionCost > 0
          ? Infinity
          : 0;

    // Determine breached thresholds
    const thresholds = costBudget.alertThresholds ?? [0.8, 0.9, 1.0];
    const currentUtilization =
      budgetState.budgetAmount > 0
        ? budgetState.spentAmount / budgetState.budgetAmount
        : 0;
    const breachedThresholds = thresholds.filter(
      (t: number) => utilizationAfter >= t && currentUtilization < t
    );

    if (actionCost > 0 && remainingAfter < 0) {
      return {
        allowed: false,
        code: 'BUDGET_EXCEEDED',
        reason: `Budget exceeded: $${(budgetState.spentAmount + actionCost).toFixed(2)} / $${budgetState.budgetAmount.toFixed(2)} (${costBudget.period}). Remaining: $${remainingBefore.toFixed(2)}, action cost: $${actionCost.toFixed(2)}`,
        actionCost,
        remainingBudget: remainingAfter,
        utilization: utilizationAfter,
        breachedThresholds,
      };
    }

    return {
      allowed: true,
      actionCost,
      remainingBudget: remainingAfter,
      utilization: utilizationAfter,
      breachedThresholds,
    };
  }

  // No budget state provided but costBudget.maxBudget is configured
  // The control plane should have provided budget state. Without it, allow
  // but flag that we can't verify (fail-open for budget tracking only,
  // per-action limits above are still enforced).
  return { allowed: true, actionCost };
}

/** Internal type for the costBudget config from the policy rule */
interface CostBudgetConfig {
  maxActionCost?: number;
  maxBudget: number;
  period: 'hourly' | 'daily' | 'monthly';
  scope?: 'principal' | 'action_type' | 'global';
  alertThresholds?: number[];
}
