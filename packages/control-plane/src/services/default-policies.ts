/**
 * Default Policy Provisioning
 *
 * Auto-provisions a fail-closed default-safe policy when the control plane
 * boots for the first time and no policies exist yet. This ensures new
 * deployments start in a secure state without manual configuration.
 */

import type { Policy } from '@authensor/engine';
import { db } from '../db.js';
import { createPolicy, setActivePolicy } from './policy-service.js';

/**
 * The generated Policy type defines condition `value` as `{ [k: string]: unknown }`
 * but the engine evaluator treats it as `unknown` (comparing strings, numbers, etc.).
 * We type conditions loosely here so string values pass type-checking while remaining
 * fully compatible with both the Zod schema and the runtime engine.
 */
type Condition = {
  field?: string;
  operator?: string;
  value?: unknown;
  all?: Condition[];
  any?: Condition[];
  not?: Condition;
};

type PolicyRule = {
  id: string;
  name?: string;
  description?: string;
  effect: 'allow' | 'deny' | 'require_approval';
  condition?: Condition & Record<string, unknown>;
  rateLimit?: { requests: number; window: string; scope?: 'principal' | 'action' | 'global' };
  approvalConfig?: {
    approvers?: { type?: string; id?: string }[];
    expiresIn?: string;
    requiredApprovals?: number;
  };
};

type DefaultPolicy = Omit<Policy, 'rules'> & { rules: PolicyRule[] };

/**
 * Default-safe policy template.
 *
 * Design principles:
 *   - Fail-closed: `defaultEffect: 'deny'` — anything not explicitly allowed is blocked.
 *   - Read operations: allowed without friction.
 *   - Write/execute/network: require human approval (1 approver).
 *   - Destructive patterns: explicitly denied, no override.
 */
export const DEFAULT_SAFE_POLICY: DefaultPolicy = {
  id: 'default-safe',
  name: 'Default Safe Policy',
  description:
    'Auto-provisioned fail-closed policy. Allows reads, requires approval for writes/executes, and denies destructive operations.',
  version: '1.0.0',
  enabled: true,
  priority: 0,
  scope: {
    principalTypes: ['user', 'agent', 'service', 'system'],
    environments: ['development', 'staging', 'production'],
  },
  rules: [
    // ── Allow: read-only operations ──────────────────────────────────
    {
      id: 'allow-read-ops',
      name: 'Allow read operations',
      description: 'Permit *.read, *.list, *.get, and HTTP GET requests without friction.',
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
      description: 'Permit outbound HTTP GET requests.',
      effect: 'allow',
      condition: {
        all: [
          { field: 'action.type', operator: 'eq', value: 'http.request' },
          { field: 'action.parameters.method', operator: 'eq', value: 'GET' },
        ],
      },
    },

    // ── Deny: destructive operations (evaluated before approval rules) ──
    {
      id: 'deny-destructive-ops',
      name: 'Deny destructive operations',
      description:
        'Hard-deny dangerous patterns: *.drop, *.truncate, and destructive shell commands.',
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

    // ── Require approval: write / delete / execute ───────────────────
    {
      id: 'approve-write-ops',
      name: 'Require approval for write operations',
      description: 'File writes, data writes, and any *.write actions require human approval.',
      effect: 'require_approval',
      condition: {
        any: [
          { field: 'action.type', operator: 'matches', value: '.*\\.write$' },
          { field: 'action.type', operator: 'eq', value: 'file.write' },
          { field: 'action.type', operator: 'startsWith', value: 'filesystem.' },
        ],
      },
      approvalConfig: {
        requiredApprovals: 1,
        expiresIn: '1h',
      },
    },
    {
      id: 'approve-delete-ops',
      name: 'Require approval for delete operations',
      description: 'Any *.delete action requires human approval.',
      effect: 'require_approval',
      condition: {
        any: [
          { field: 'action.type', operator: 'matches', value: '.*\\.delete$' },
        ],
      },
      approvalConfig: {
        requiredApprovals: 1,
        expiresIn: '1h',
      },
    },
    {
      id: 'approve-execute-ops',
      name: 'Require approval for execute operations',
      description:
        'Shell execution, code execution, and any *.execute action requires human approval.',
      effect: 'require_approval',
      condition: {
        any: [
          { field: 'action.type', operator: 'matches', value: '.*\\.execute$' },
          { field: 'action.type', operator: 'eq', value: 'shell.execute' },
          { field: 'action.type', operator: 'startsWith', value: 'code.' },
        ],
      },
      approvalConfig: {
        requiredApprovals: 1,
        expiresIn: '1h',
      },
    },
    {
      id: 'approve-network-ops',
      name: 'Require approval for network operations',
      description:
        'Non-GET HTTP requests and other network operations require human approval.',
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
      approvalConfig: {
        requiredApprovals: 1,
        expiresIn: '1h',
      },
    },
    {
      id: 'approve-sensitive-ops',
      name: 'Require approval for sensitive operations',
      description:
        'Secrets access, payment operations, and MCP tool invocations require human approval.',
      effect: 'require_approval',
      condition: {
        any: [
          { field: 'action.type', operator: 'startsWith', value: 'secrets.' },
          { field: 'action.type', operator: 'startsWith', value: 'payments.' },
          { field: 'action.type', operator: 'startsWith', value: 'mcp.' },
        ],
      },
      approvalConfig: {
        requiredApprovals: 1,
        expiresIn: '1h',
      },
    },
  ],
  defaultEffect: 'deny',
  metadata: {
    source: 'auto-provisioned',
    description: 'Created automatically on first boot when no policies exist.',
  },
};

/**
 * Check whether any policies exist for the given org/environment and,
 * if not, provision and activate the default-safe policy.
 *
 * @returns `{ provisioned: true }` when a new policy was created,
 *          `{ provisioned: false }` when policies already exist.
 */
export async function ensureDefaultPolicy(
  orgId: string,
  environment: string
): Promise<{ provisioned: boolean }> {
  const { rows } = await db.query<{ count: string }>(
    'SELECT COUNT(*) AS count FROM policies WHERE org_id = $1 AND environment = $2',
    [orgId, environment]
  );

  const count = parseInt(rows[0].count, 10);

  if (count > 0) {
    return { provisioned: false };
  }

  console.log('[bootstrap] No policies found — provisioning default-safe policy');

  await createPolicy(orgId, environment, DEFAULT_SAFE_POLICY as unknown as Policy);
  await setActivePolicy(
    orgId,
    environment,
    DEFAULT_SAFE_POLICY.id,
    DEFAULT_SAFE_POLICY.version
  );

  console.log(
    `[bootstrap] Default-safe policy (${DEFAULT_SAFE_POLICY.id} v${DEFAULT_SAFE_POLICY.version}) created and activated for org="${orgId}" env="${environment}"`
  );

  return { provisioned: true };
}
