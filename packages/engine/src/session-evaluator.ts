/**
 * Session Evaluator
 *
 * Evaluates session-level constraints against cumulative session context.
 * Detects privilege escalation through tool chaining, action flooding,
 * and cumulative risk score breaches.
 *
 * Pure and synchronous — no I/O, no side effects.
 */

import type {
  ActionEnvelope,
  Policy,
  SessionContext,
  SessionViolation,
} from './types.js';

export interface SessionEvaluationResult {
  /** Whether the session-level check passed (no violations) */
  allowed: boolean;
  /** Violation details if a session rule was triggered */
  violation?: SessionViolation;
  /** The effect to apply (only set when allowed=false) */
  effect?: 'deny' | 'require_approval';
}

/**
 * Evaluate session-level rules from a policy against the current session context
 * and the proposed new action.
 *
 * This is called BEFORE per-rule evaluation. If session rules deny the action,
 * per-rule evaluation is skipped.
 */
export function evaluateSessionRules(
  envelope: ActionEnvelope,
  policy: Policy,
  sessionContext: SessionContext
): SessionEvaluationResult {
  const sessionRules = policy.sessionRules;
  if (!sessionRules) {
    return { allowed: true };
  }

  // Check 1: maxActionsPerSession
  if (sessionRules.maxActionsPerSession != null) {
    const result = checkMaxActions(
      sessionContext,
      sessionRules.maxActionsPerSession
    );
    if (!result.allowed) return result;
  }

  // Check 2: forbiddenSequences
  if (
    sessionRules.forbiddenSequences &&
    sessionRules.forbiddenSequences.length > 0
  ) {
    const result = checkForbiddenSequences(
      envelope,
      sessionContext,
      sessionRules.forbiddenSequences
    );
    if (!result.allowed) return result;
  }

  // Check 3: sessionRiskThreshold
  if (sessionRules.sessionRiskThreshold) {
    const result = checkRiskThreshold(
      envelope,
      sessionContext,
      sessionRules.sessionRiskThreshold
    );
    if (!result.allowed) return result;
  }

  return { allowed: true };
}

/**
 * Check if the session has exceeded the maximum number of actions.
 * The current (proposed) action is counted — so if there are already N actions
 * in history and maxActionsPerSession is N, the next action is denied.
 */
function checkMaxActions(
  sessionContext: SessionContext,
  maxActions: number
): SessionEvaluationResult {
  // Count includes the current action being evaluated
  const currentCount = sessionContext.actions.length + 1;

  if (currentCount > maxActions) {
    return {
      allowed: false,
      effect: 'deny',
      violation: {
        type: 'max_actions',
        reason: `Session action limit exceeded: ${currentCount} actions (limit: ${maxActions})`,
        details: {
          actionCount: currentCount,
          maxActions,
        },
      },
    };
  }

  return { allowed: true };
}

/**
 * Check if the proposed action would complete a forbidden sequence.
 *
 * For a forbidden sequence ["A", "B", "C"]:
 * - We look at the session history + the proposed action
 * - We check if the last N actions (where N = sequence length) match the pattern
 * - Matching respects glob patterns (e.g., "file.*" matches "file.read")
 * - The sequence does NOT need to be consecutive — it uses subsequence matching
 *   within the lookback window.
 */
function checkForbiddenSequences(
  envelope: ActionEnvelope,
  sessionContext: SessionContext,
  forbiddenSequences: NonNullable<
    NonNullable<Policy['sessionRules']>['forbiddenSequences']
  >
): SessionEvaluationResult {
  // Build the full action type history including the current proposed action
  const allActionTypes = [
    ...sessionContext.actions.map((a) => a.actionType),
    envelope.action.type,
  ];

  for (const seqRule of forbiddenSequences) {
    const sequence = seqRule.sequence;
    if (sequence.length < 2) continue;

    const lookback = seqRule.lookbackActions ?? allActionTypes.length;
    // Only consider the most recent `lookback` actions
    const window = allActionTypes.slice(-lookback);

    if (containsSubsequence(window, sequence)) {
      return {
        allowed: false,
        effect: seqRule.effect,
        violation: {
          type: 'forbidden_sequence',
          reason:
            seqRule.reason ??
            `Forbidden action sequence detected: [${sequence.join(' -> ')}]`,
          details: {
            detectedSequence: sequence,
            sequenceRuleId: seqRule.id,
          },
        },
      };
    }
  }

  return { allowed: true };
}

/**
 * Check if a list of action types contains a subsequence matching the pattern.
 * The subsequence must appear in order but not necessarily consecutively.
 * Patterns support glob matching (e.g., "file.*" matches "file.read").
 */
function containsSubsequence(
  actions: string[],
  pattern: string[]
): boolean {
  let patternIdx = 0;

  for (let i = 0; i < actions.length && patternIdx < pattern.length; i++) {
    if (matchGlob(pattern[patternIdx], actions[i])) {
      patternIdx++;
    }
  }

  return patternIdx === pattern.length;
}

/**
 * Check if the cumulative risk score of the session (including the proposed
 * action) exceeds the configured threshold.
 */
function checkRiskThreshold(
  envelope: ActionEnvelope,
  sessionContext: SessionContext,
  config: NonNullable<
    NonNullable<Policy['sessionRules']>['sessionRiskThreshold']
  >
): SessionEvaluationResult {
  const { maxScore, riskWeights, effect } = config;

  // Calculate cumulative score from past actions
  let cumulativeScore = 0;
  for (const action of sessionContext.actions) {
    cumulativeScore += getActionRiskScore(action.actionType, riskWeights ?? {});
  }

  // Add the proposed action's risk
  cumulativeScore += getActionRiskScore(envelope.action.type, riskWeights ?? {});

  if (cumulativeScore > maxScore) {
    return {
      allowed: false,
      effect: effect ?? 'deny',
      violation: {
        type: 'risk_threshold',
        reason: `Session risk threshold exceeded: cumulative score ${cumulativeScore} exceeds max ${maxScore}`,
        details: {
          cumulativeScore,
          maxScore,
        },
      },
    };
  }

  return { allowed: true };
}

/**
 * Get the risk score for an action type based on risk weight configuration.
 * Tries exact match first, then glob patterns. Unmatched actions score 0.
 */
function getActionRiskScore(
  actionType: string,
  riskWeights: Record<string, number>
): number {
  // Exact match first (fast path)
  if (actionType in riskWeights) {
    return riskWeights[actionType];
  }

  // Glob match (slower path)
  for (const [pattern, weight] of Object.entries(riskWeights)) {
    if (matchGlob(pattern, actionType)) {
      return weight;
    }
  }

  return 0;
}

/**
 * Simple glob pattern matching (supports * and **).
 * Duplicated from policy-engine.ts to keep session-evaluator self-contained
 * and avoid circular dependencies.
 */
function matchGlob(pattern: string, value: string): boolean {
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '<<GLOBSTAR>>')
    .replace(/\*/g, '[^.]*')
    .replace(/<<GLOBSTAR>>/g, '.*');
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(value);
}
