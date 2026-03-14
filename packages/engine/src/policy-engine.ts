/**
 * PolicyEngine - The core decision engine for Authensor
 *
 * This is a pure function library with no side effects.
 * It evaluates action envelopes against policies and returns decisions.
 */

import { evaluateCondition } from './condition-evaluator.js';
import { createDecision } from './decision.js';
import type {
  ActionEnvelope,
  Policy,
  PolicyRule,
  Decision,
  EvaluationResult,
  RateLimitState,
  SessionContext,
} from './types.js';
import { evaluateSessionRules } from './session-evaluator.js';

export interface PolicyEngineOptions {
  /** Function to check rate limit state (injected for purity) */
  getRateLimitState?: (key: string) => RateLimitState | undefined;
}

export class PolicyEngine {
  private options: PolicyEngineOptions;

  constructor(options: PolicyEngineOptions = {}) {
    this.options = options;
  }

  /**
   * Evaluate an action envelope against a set of policies.
   * Returns the decision and metadata about the evaluation.
   * Optionally accepts a SessionContext for session-level rule enforcement.
   */
  evaluate(envelope: ActionEnvelope, policies: Policy[], sessionContext?: SessionContext): EvaluationResult {
    const startTime = performance.now();

    // Sort policies by priority (higher first)
    const sortedPolicies = [...policies]
      .filter((p) => p.enabled !== false)
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    // Find first matching policy and rule
    for (const policy of sortedPolicies) {
      if (!this.policyMatchesScope(policy, envelope)) {
        continue;
      }

      // Session rules are checked BEFORE per-rule evaluation
      if (sessionContext && policy.sessionRules) {
        const sessionResult = evaluateSessionRules(envelope, policy, sessionContext);
        if (!sessionResult.allowed) {
          return {
            decision: createDecision(sessionResult.effect ?? 'deny', {
              policyId: policy.id,
              policyVersion: policy.version,
              reason: sessionResult.violation?.reason ?? 'Session rule violation',
            }),
            matchedPolicy: policy,
            evaluationTimeMs: performance.now() - startTime,
            sessionViolation: sessionResult.violation,
          };
        }
      }

      for (const rule of policy.rules) {
        if (this.ruleMatches(rule, envelope)) {
          // Check rate limiting if configured
          if (rule.rateLimit && this.options.getRateLimitState) {
            const rateLimitKey = this.getRateLimitKey(rule, envelope);
            const state = this.options.getRateLimitState(rateLimitKey);
            if (state && state.count >= rule.rateLimit.requests) {
              return {
                decision: createDecision('rate_limited', {
                  policyId: policy.id,
                  policyVersion: policy.version,
                  reason: `Rate limit exceeded: ${rule.rateLimit.requests} requests per ${rule.rateLimit.window}`,
                  matchedRules: [{ ruleId: rule.id, ruleName: rule.name, effect: 'deny' }],
                }),
                matchedPolicy: policy,
                matchedRule: rule,
                evaluationTimeMs: performance.now() - startTime,
              };
            }
          }

          return {
            decision: createDecision(rule.effect, {
              policyId: policy.id,
              policyVersion: policy.version,
              reason: rule.description,
              matchedRules: [{ ruleId: rule.id, ruleName: rule.name, effect: rule.effect === 'require_approval' ? 'allow' : rule.effect }],
            }),
            matchedPolicy: policy,
            matchedRule: rule,
            evaluationTimeMs: performance.now() - startTime,
          };
        }
      }

      // No rules matched, use policy default
      if (policy.defaultEffect) {
        return {
          decision: createDecision(policy.defaultEffect, {
            policyId: policy.id,
            policyVersion: policy.version,
            reason: `Default policy effect: ${policy.defaultEffect}`,
          }),
          matchedPolicy: policy,
          evaluationTimeMs: performance.now() - startTime,
        };
      }
    }

    // No policies matched, deny by default (fail-closed)
    return {
      decision: createDecision('deny', {
        reason: 'No matching policy found (fail-closed)',
      }),
      evaluationTimeMs: performance.now() - startTime,
    };
  }

  /**
   * Check if a policy's scope matches the envelope
   */
  private policyMatchesScope(policy: Policy, envelope: ActionEnvelope): boolean {
    const { scope } = policy;
    if (!scope) return true;

    // Check action types (supports glob patterns)
    if (scope.actionTypes && scope.actionTypes.length > 0) {
      const matches = scope.actionTypes.some((pattern) =>
        this.matchGlob(pattern, envelope.action.type)
      );
      if (!matches) return false;
    }

    // Check principal types
    if (scope.principalTypes && scope.principalTypes.length > 0) {
      if (!scope.principalTypes.includes(envelope.principal.type)) {
        return false;
      }
    }

    // Check environments
    if (scope.environments && scope.environments.length > 0) {
      const env = envelope.context.environment;
      if (env && !scope.environments.includes(env)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if a rule matches the envelope
   */
  private ruleMatches(rule: PolicyRule, envelope: ActionEnvelope): boolean {
    if (!rule.condition) {
      // No condition means rule always matches
      return true;
    }
    return evaluateCondition(rule.condition, envelope);
  }

  /**
   * Generate a rate limit key for the given rule and envelope
   */
  private getRateLimitKey(rule: PolicyRule, envelope: ActionEnvelope): string {
    const scope = rule.rateLimit?.scope ?? 'principal';
    switch (scope) {
      case 'principal':
        return `${rule.id}:${envelope.principal.type}:${envelope.principal.id}`;
      case 'action':
        return `${rule.id}:${envelope.action.type}`;
      case 'global':
        return `${rule.id}:global`;
      default:
        return `${rule.id}:${envelope.principal.id}`;
    }
  }

  /**
   * Simple glob pattern matching (supports * and **)
   */
  private matchGlob(pattern: string, value: string): boolean {
    // Convert glob to regex
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '<<GLOBSTAR>>')
      .replace(/\*/g, '[^.]*')
      .replace(/<<GLOBSTAR>>/g, '.*');
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(value);
  }
}
