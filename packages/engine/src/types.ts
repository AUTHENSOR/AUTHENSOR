/**
 * Core types for the Authensor engine.
 * These are generated from the JSON Schemas in @authensor/schemas.
 */

import type { ActionEnvelope as GeneratedActionEnvelope } from './generated/action-envelope.js';
import type { ActionReceipt as GeneratedActionReceipt } from './generated/action-receipt.js';
import type { Policy as GeneratedPolicy } from './generated/policy.js';

export type ActionEnvelope = GeneratedActionEnvelope;
export type ActionReceipt = GeneratedActionReceipt;
export type Policy = GeneratedPolicy;

export type Decision = ActionReceipt['decision'];
export type DecisionOutcome = Decision['outcome'];
export type PolicyRule = Policy['rules'][number];
export type PolicyCondition = NonNullable<PolicyRule['condition']>;

export interface EvaluationResult {
  decision: Decision;
  matchedPolicy?: Policy;
  matchedRule?: PolicyRule;
  evaluationTimeMs: number;
}

export interface RateLimitState {
  count: number;
  windowStart: string;
  windowEnd: string;
}
