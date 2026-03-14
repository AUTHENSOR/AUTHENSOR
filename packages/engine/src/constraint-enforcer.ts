/**
 * Constraint Enforcer
 *
 * Enforces server-side constraints defined in policy rules, preventing
 * confused-deputy attacks where a caller omits or inflates constraints.
 *
 * Policy-defined constraints OVERRIDE envelope-declared constraints:
 * - maxAmount: policy wins if lower than envelope (or envelope omits it)
 * - allowedDomains: policy whitelist replaces envelope whitelist entirely
 * - timeout: policy wins if lower than envelope (or envelope omits it)
 * - requireConstraints: envelope is rejected if required fields are missing
 *
 * This module is pure and synchronous — no I/O, no side effects.
 */

import type { ActionEnvelope, PolicyRule, EnforcedConstraints } from './types.js';

export interface ConstraintEnforcementResult {
  /** Whether all constraints passed (no violations) */
  ok: boolean;
  /** The effective constraints after policy override */
  enforcedConstraints: EnforcedConstraints;
  /** List of constraint violations (if any) */
  violations: ConstraintViolation[];
}

export interface ConstraintViolation {
  /** Which constraint was violated */
  constraint: string;
  /** Human-readable reason */
  reason: string;
  /** What the envelope declared (if anything) */
  envelopeValue?: unknown;
  /** What the policy enforces */
  policyValue?: unknown;
}

/**
 * Enforce policy-defined constraints against an envelope's declared constraints.
 *
 * Returns the effective constraints after policy overrides, and any violations
 * that should cause the request to be denied.
 */
export function enforceConstraints(
  rule: PolicyRule,
  envelope: ActionEnvelope
): ConstraintEnforcementResult {
  const policyConstraints = rule.constraints;
  if (!policyConstraints) {
    // No policy constraints — envelope constraints pass through unchanged
    return {
      ok: true,
      enforcedConstraints: {
        maxAmount: envelope.constraints?.maxAmount,
        allowedDomains: envelope.constraints?.allowedDomains,
        timeout: envelope.constraints?.timeout,
      },
      violations: [],
    };
  }

  const violations: ConstraintViolation[] = [];
  const enforced: EnforcedConstraints = {};

  // --- requireConstraints: reject if envelope is missing required fields ---
  if (policyConstraints.requireConstraints) {
    for (const field of policyConstraints.requireConstraints) {
      const envelopeValue = envelope.constraints?.[field as keyof NonNullable<ActionEnvelope['constraints']>];
      if (envelopeValue === undefined || envelopeValue === null) {
        violations.push({
          constraint: 'requireConstraints',
          reason: `Envelope is missing required constraint field: ${field}`,
          policyValue: field,
        });
      }
    }
  }

  // --- maxAmount: policy wins if present; if envelope also has one, take the lower ---
  if (policyConstraints.maxAmount !== undefined) {
    const envelopeMax = envelope.constraints?.maxAmount;
    if (envelopeMax !== undefined) {
      // Take the stricter (lower) of the two
      enforced.maxAmount = Math.min(policyConstraints.maxAmount, envelopeMax);
    } else {
      // Envelope omitted it — policy fills it in
      enforced.maxAmount = policyConstraints.maxAmount;
    }

    // Check if the envelope's declared amount actually exceeds policy limit
    if (envelopeMax !== undefined && envelopeMax > policyConstraints.maxAmount) {
      violations.push({
        constraint: 'maxAmount',
        reason: `Envelope maxAmount (${envelopeMax}) exceeds policy limit (${policyConstraints.maxAmount})`,
        envelopeValue: envelopeMax,
        policyValue: policyConstraints.maxAmount,
      });
    }
  } else {
    // No policy maxAmount — pass through envelope value
    enforced.maxAmount = envelope.constraints?.maxAmount;
  }

  // --- allowedDomains: policy whitelist replaces envelope whitelist entirely ---
  if (policyConstraints.allowedDomains !== undefined) {
    enforced.allowedDomains = policyConstraints.allowedDomains;

    // Check if envelope declares domains outside the policy whitelist
    const envelopeDomains = envelope.constraints?.allowedDomains;
    if (envelopeDomains && envelopeDomains.length > 0) {
      const disallowed = envelopeDomains.filter(
        (d) => !policyConstraints.allowedDomains!.includes(d)
      );
      if (disallowed.length > 0) {
        violations.push({
          constraint: 'allowedDomains',
          reason: `Envelope declares domains not in policy whitelist: ${disallowed.join(', ')}`,
          envelopeValue: envelopeDomains,
          policyValue: policyConstraints.allowedDomains,
        });
      }
    }
  } else {
    enforced.allowedDomains = envelope.constraints?.allowedDomains;
  }

  // --- timeout: policy wins if present; if envelope also has one, take the lower ---
  if (policyConstraints.timeout !== undefined) {
    const envelopeTimeout = envelope.constraints?.timeout;
    if (envelopeTimeout !== undefined) {
      enforced.timeout = Math.min(policyConstraints.timeout, envelopeTimeout);
    } else {
      enforced.timeout = policyConstraints.timeout;
    }

    if (envelopeTimeout !== undefined && envelopeTimeout > policyConstraints.timeout) {
      violations.push({
        constraint: 'timeout',
        reason: `Envelope timeout (${envelopeTimeout}ms) exceeds policy limit (${policyConstraints.timeout}ms)`,
        envelopeValue: envelopeTimeout,
        policyValue: policyConstraints.timeout,
      });
    }
  } else {
    enforced.timeout = envelope.constraints?.timeout;
  }

  return {
    ok: violations.length === 0,
    enforcedConstraints: enforced,
    violations,
  };
}
