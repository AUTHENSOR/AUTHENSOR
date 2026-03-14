/**
 * guard() — Zero-config action authorization
 *
 * Evaluates actions against a built-in safety policy locally, without
 * needing a running control plane. Uses the same PolicyEngine that powers
 * the control plane, but runs entirely in-memory.
 *
 * @example
 * ```typescript
 * import { guard } from '@authensor/sdk';
 *
 * // One line — reads are allowed, writes need approval
 * const { allowed } = guard('file.read', '/data.json');    // allowed: true
 * const { allowed } = guard('file.write', '/etc/hosts');   // allowed: false
 * const { allowed } = guard('db.drop', 'users');           // allowed: false (hard deny)
 *
 * // With execution gating
 * const data = await guardExecute('file.read', '/data.json', async () => {
 *   return fs.readFile('/data.json', 'utf8');
 * });
 *
 * // Custom policy
 * const { allowed } = guard('custom.action', '/resource', { policy: myPolicy });
 * ```
 */

import { PolicyEngine } from '@authensor/engine';
import { createEnvelope } from './envelope.js';
import type { ActionEnvelope, Policy } from './types.js';

// ── Types ──────────────────────────────────────────────────────────────

export interface GuardResult {
  /** Whether the action is allowed */
  allowed: boolean;
  /** The decision outcome */
  outcome: 'allow' | 'deny' | 'require_approval' | 'rate_limited' | 'budget_exceeded';
  /** Human-readable reason for the decision */
  reason?: string;
  /** Which policy matched */
  policyId?: string;
  /** Which rule matched */
  ruleId?: string;
  /** Evaluation time in milliseconds */
  evaluationTimeMs: number;
}

export interface GuardOptions {
  /** Custom policy to evaluate against (default: built-in safe policy) */
  policy?: Policy;
  /** Operation type */
  operation?: ActionEnvelope['action']['operation'];
  /** Action parameters (e.g., { method: 'GET' } for HTTP) */
  parameters?: Record<string, unknown>;
  /** Principal ID (default: 'agent') */
  principalId?: string;
  /** Principal type (default: 'agent') */
  principalType?: 'user' | 'agent' | 'service' | 'system';
  /** Environment (default: 'development') */
  environment?: 'development' | 'staging' | 'production';
}

// ── Built-in default-safe policy ───────────────────────────────────────

const DEFAULT_SAFE_POLICY: Policy = {
  id: 'default-safe',
  name: 'Default Safe Policy',
  description:
    'Built-in fail-closed policy. Allows reads, requires approval for writes/executes, denies destructive operations.',
  version: '1.0.0',
  enabled: true,
  priority: 0,
  scope: {
    principalTypes: ['user', 'agent', 'service', 'system'],
    environments: ['development', 'staging', 'production'],
  },
  rules: [
    {
      id: 'allow-read-ops',
      name: 'Allow read operations',
      effect: 'allow',
      condition: {
        any: [
          { field: 'action.type', operator: 'matches', value: '.*\\.read$' },
          { field: 'action.type', operator: 'matches', value: '.*\\.list$' },
          { field: 'action.type', operator: 'matches', value: '.*\\.get$' },
          { field: 'action.type', operator: 'startsWith', value: 'safe.read' },
        ],
      },
    },
    {
      id: 'allow-http-get',
      name: 'Allow HTTP GET requests',
      effect: 'allow',
      condition: {
        all: [
          { field: 'action.type', operator: 'eq', value: 'http.request' },
          { field: 'action.parameters.method', operator: 'eq', value: 'GET' },
        ],
      },
    },
    {
      id: 'deny-destructive-ops',
      name: 'Deny destructive operations',
      effect: 'deny',
      condition: {
        any: [
          { field: 'action.type', operator: 'matches', value: '.*\\.drop$' },
          { field: 'action.type', operator: 'matches', value: '.*\\.truncate$' },
          { field: 'action.parameters.command', operator: 'contains', value: 'rm -rf' },
          { field: 'action.parameters.command', operator: 'contains', value: 'mkfs' },
          { field: 'action.parameters.command', operator: 'contains', value: ':(){' },
          { field: 'action.parameters.command', operator: 'contains', value: 'dd if=' },
        ],
      },
    },
    {
      id: 'approve-write-ops',
      name: 'Require approval for writes',
      effect: 'require_approval',
      condition: {
        any: [
          { field: 'action.type', operator: 'matches', value: '.*\\.write$' },
          { field: 'action.type', operator: 'eq', value: 'file.write' },
          { field: 'action.type', operator: 'startsWith', value: 'filesystem.' },
        ],
      },
    },
    {
      id: 'approve-delete-ops',
      name: 'Require approval for deletes',
      effect: 'require_approval',
      condition: {
        any: [
          { field: 'action.type', operator: 'matches', value: '.*\\.delete$' },
        ],
      },
    },
    {
      id: 'approve-execute-ops',
      name: 'Require approval for execution',
      effect: 'require_approval',
      condition: {
        any: [
          { field: 'action.type', operator: 'matches', value: '.*\\.execute$' },
          { field: 'action.type', operator: 'eq', value: 'shell.execute' },
          { field: 'action.type', operator: 'startsWith', value: 'code.' },
        ],
      },
    },
    {
      id: 'approve-network-ops',
      name: 'Require approval for network operations',
      effect: 'require_approval',
      condition: {
        any: [
          { field: 'action.type', operator: 'startsWith', value: 'network.' },
          {
            all: [
              { field: 'action.type', operator: 'eq', value: 'http.request' },
              { field: 'action.parameters.method', operator: 'neq', value: 'GET' },
            ],
          },
        ],
      },
    },
    {
      id: 'approve-sensitive-ops',
      name: 'Require approval for sensitive operations',
      effect: 'require_approval',
      condition: {
        any: [
          { field: 'action.type', operator: 'startsWith', value: 'secrets.' },
          { field: 'action.type', operator: 'startsWith', value: 'payments.' },
          { field: 'action.type', operator: 'startsWith', value: 'mcp.' },
        ],
      },
    },
  ],
  defaultEffect: 'deny',
} as unknown as Policy;

// ── Singleton engine ───────────────────────────────────────────────────

const engine = new PolicyEngine();

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Evaluate an action against the built-in safety policy.
 * Synchronous, zero-config, no control plane needed.
 */
export function guard(
  actionType: string,
  resource: string,
  options: GuardOptions = {},
): GuardResult {
  const policy = options.policy ?? DEFAULT_SAFE_POLICY;

  const envelope = createEnvelope({
    actionType,
    resource,
    operation: options.operation,
    parameters: options.parameters,
    principal: {
      type: options.principalType ?? 'agent',
      id: options.principalId ?? 'agent',
    },
    context: {
      environment: options.environment ?? 'development',
    },
  });

  const result = engine.evaluate(envelope, [policy]);

  return {
    allowed: result.decision.outcome === 'allow',
    outcome: result.decision.outcome,
    reason: result.decision.reason,
    policyId: result.matchedPolicy?.id,
    ruleId: result.matchedRule?.id,
    evaluationTimeMs: result.evaluationTimeMs,
  };
}

/**
 * Execute an action only if the policy allows it.
 * Throws if the action is denied or requires approval.
 */
export async function guardExecute<T>(
  actionType: string,
  resource: string,
  executor: () => Promise<T>,
  options: GuardOptions = {},
): Promise<T> {
  const result = guard(actionType, resource, options);

  if (!result.allowed) {
    throw new GuardDeniedError(result);
  }

  return executor();
}

/**
 * Error thrown when guard() blocks an action.
 */
export class GuardDeniedError extends Error {
  public readonly result: GuardResult;

  constructor(result: GuardResult) {
    super(`Action denied (${result.outcome}): ${result.reason ?? 'no matching allow rule'}`);
    this.name = 'GuardDeniedError';
    this.result = result;
  }
}

/** Get the built-in default policy (for inspection or customization). */
export function getDefaultPolicy(): Policy {
  return DEFAULT_SAFE_POLICY;
}
