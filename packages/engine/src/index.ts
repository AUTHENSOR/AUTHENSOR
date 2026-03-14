/**
 * @authensor/engine
 *
 * Pure policy evaluation logic. No I/O, no side effects.
 * This module takes an envelope + policies and returns a decision.
 */

export { PolicyEngine } from './policy-engine.js';
export { evaluateCondition } from './condition-evaluator.js';
export { createDecision } from './decision.js';

// Re-export types
export type {
  ActionEnvelope,
  ActionReceipt,
  Policy,
  PolicyRule,
  Decision,
  DecisionOutcome,
  EvaluationResult,
  RateLimitState,
  SessionContext,
  SessionAction,
  SessionViolation,
  BudgetState,
  EnforcedConstraints,
  ForbiddenSequenceRule,
  SessionRiskConfig,
  SessionRuleConfig,
} from './types.js';
