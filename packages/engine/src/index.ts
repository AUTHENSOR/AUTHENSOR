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
  Decision,
  DecisionOutcome,
  EvaluationResult,
} from './types.js';
