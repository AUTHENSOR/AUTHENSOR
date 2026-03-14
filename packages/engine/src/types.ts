/**
 * Core types for the Authensor engine.
 * These are generated from the JSON Schemas in @authensor/schemas.
 */

import type { ActionEnvelope as GeneratedActionEnvelope } from './generated/action-envelope.js';
import type { ActionReceipt as GeneratedActionReceipt } from './generated/action-receipt.js';
import type { Policy as GeneratedPolicy } from './generated/policy.js';

export type ActionEnvelope = GeneratedActionEnvelope;
export type ActionReceipt = GeneratedActionReceipt;

// Extend generated Policy with session rules and constraint properties
export type Policy = GeneratedPolicy & {
  sessionRules?: SessionRuleConfig;
};

// Extend generated PolicyRule with constraint enforcement
export type PolicyRule = GeneratedPolicy['rules'][number] & {
  constraints?: {
    maxAmount?: number;
    allowedDomains?: string[];
    timeout?: number;
    requireConstraints?: string[];
  };
  costBudget?: {
    period: string;
    maxBudget: number;
    maxActionCost?: number;
    alertThresholds?: number[];
  };
};

export type Decision = ActionReceipt['decision'];
export type DecisionOutcome = Decision['outcome'];
export type PolicyCondition = NonNullable<PolicyRule['condition']>;

export interface EvaluationResult {
  decision: Decision;
  matchedPolicy?: Policy;
  matchedRule?: PolicyRule;
  evaluationTimeMs: number;
  sessionViolation?: SessionViolation;
}

export interface RateLimitState {
  count: number;
  windowStart: string;
  windowEnd: string;
}

// ── Session rule types ──────────────────────────────────────────────

export interface ForbiddenSequenceRule {
  id?: string;
  sequence: string[];
  lookbackActions?: number;
  effect?: 'deny' | 'require_approval';
  reason?: string;
}

export interface SessionRiskConfig {
  maxScore: number;
  riskWeights?: Record<string, number>;
  effect?: 'deny' | 'require_approval';
}

export interface SessionRuleConfig {
  maxActionsPerSession?: number;
  forbiddenSequences?: ForbiddenSequenceRule[];
  sessionRiskThreshold?: SessionRiskConfig;
  effect?: 'deny' | 'require_approval';
}

// ── Session evaluation types ────────────────────────────────────────

export interface SessionAction {
  actionType: string;
  timestamp: number;
  riskScore?: number;
}

export interface SessionContext {
  sessionId: string;
  actions: SessionAction[];
  totalRiskScore: number;
}

export interface SessionViolation {
  type: string;
  reason: string;
  details?: Record<string, unknown>;
}

// ── Budget types ────────────────────────────────────────────────────

export interface BudgetState {
  spentAmount: number;
  budgetAmount: number;
  period: string;
  resetAt: string;
}

// ── Constraint enforcement types ────────────────────────────────────

export interface EnforcedConstraints {
  maxAmount?: number;
  allowedDomains?: string[];
  timeout?: number;
}
