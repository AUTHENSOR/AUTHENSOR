/**
 * Decision Factory
 *
 * Helper functions for creating decision objects.
 */

import type { Decision, DecisionOutcome } from './types.js';

export interface DecisionOptions {
  policyId?: string;
  policyVersion?: string;
  reason?: string;
  matchedRules?: Decision['matchedRules'];
}

/**
 * Create a decision object with the given outcome and options
 */
export function createDecision(
  outcome: DecisionOutcome,
  options: DecisionOptions = {}
): Decision {
  return {
    outcome,
    evaluatedAt: new Date().toISOString(),
    ...options,
  };
}

/**
 * Create an allow decision
 */
export function allowDecision(options: DecisionOptions = {}): Decision {
  return createDecision('allow', options);
}

/**
 * Create a deny decision
 */
export function denyDecision(options: DecisionOptions = {}): Decision {
  return createDecision('deny', options);
}

/**
 * Create a require_approval decision
 */
export function requireApprovalDecision(options: DecisionOptions = {}): Decision {
  return createDecision('require_approval', options);
}

/**
 * Create a rate_limited decision
 */
export function rateLimitedDecision(options: DecisionOptions = {}): Decision {
  return createDecision('rate_limited', options);
}
