/**
 * Policy Templates
 *
 * Pre-built policy templates covering common agent-safety postures.
 * Each template conforms to the Policy schema from @authensor/engine
 * and can be applied directly via the templates API.
 */

import type { Policy } from '@authensor/engine';

export interface TemplateMetadata {
  id: string;
  name: string;
  description: string;
}

/**
 * Map of template id -> full Policy object.
 * Every policy follows the Zod schema defined in policy-service.ts.
 *
 * Note: The generated Policy type from @authensor/engine types condition
 * values as `{ [k: string]: unknown }`, but the Zod schema and runtime
 * engine accept string/number/boolean values directly. We cast each
 * entry to Policy to bridge this codegen mismatch.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const POLICY_TEMPLATES: Map<string, Policy> = new Map<string, any>([
  // ──────────────────────────────────────────────
  // CONSERVATIVE — Deny-by-default, reads only
  // ──────────────────────────────────────────────
  [
    'conservative',
    {
      id: 'template-conservative',
      name: 'Conservative',
      description:
        'Deny-by-default posture. Allows read-only operations. Requires human approval for all writes and code execution. Blocks destructive operations entirely. Recommended for production environments with autonomous agents.',
      version: '1.0.0',
      enabled: true,
      priority: 100,
      scope: {
        principalTypes: ['agent', 'service'],
        environments: ['production', 'staging'],
      },
      defaultEffect: 'deny',
      rules: [
        // --- Allowed: read-only operations ---
        {
          id: 'cons-allow-safe-reads',
          name: 'Allow safe reads',
          description: 'Permit all read-only operations (file reads, search, list, grep)',
          effect: 'allow',
          condition: {
            any: [
              { field: 'action.type', operator: 'startsWith', value: 'safe.read' },
              { field: 'action.type', operator: 'eq', value: 'filesystem.read' },
              { field: 'action.type', operator: 'eq', value: 'filesystem.list' },
              { field: 'action.type', operator: 'eq', value: 'filesystem.stat' },
              { field: 'action.type', operator: 'eq', value: 'search.grep' },
              { field: 'action.type', operator: 'eq', value: 'search.glob' },
            ],
          },
        },
        // --- Blocked: destructive operations (no approval path) ---
        {
          id: 'cons-deny-destructive-db',
          name: 'Block destructive database operations',
          description: 'Hard-deny DROP, TRUNCATE, and schema-altering database commands',
          effect: 'deny',
          condition: {
            any: [
              { field: 'action.type', operator: 'eq', value: 'database.drop' },
              { field: 'action.type', operator: 'eq', value: 'database.truncate' },
              { field: 'action.type', operator: 'eq', value: 'database.alter_schema' },
              { field: 'action.command', operator: 'matches', value: '(?i)\\b(DROP|TRUNCATE)\\b' },
            ],
          },
        },
        {
          id: 'cons-deny-destructive-fs',
          name: 'Block destructive filesystem operations',
          description: 'Hard-deny recursive deletes, format, and disk-wipe patterns',
          effect: 'deny',
          condition: {
            any: [
              { field: 'action.type', operator: 'eq', value: 'filesystem.rmrf' },
              { field: 'action.type', operator: 'eq', value: 'filesystem.format' },
              { field: 'action.command', operator: 'matches', value: 'rm\\s+-r' },
              { field: 'action.command', operator: 'contains', value: 'mkfs' },
            ],
          },
        },
        {
          id: 'cons-deny-system-commands',
          name: 'Block system-level commands',
          description: 'Hard-deny shutdown, reboot, kill, and process management',
          effect: 'deny',
          condition: {
            any: [
              { field: 'action.type', operator: 'eq', value: 'system.shutdown' },
              { field: 'action.type', operator: 'eq', value: 'system.reboot' },
              { field: 'action.type', operator: 'startsWith', value: 'system.process.kill' },
              { field: 'action.command', operator: 'matches', value: '(?i)\\b(shutdown|reboot|halt|init\\s+0)\\b' },
            ],
          },
        },
        {
          id: 'cons-deny-secret-access',
          name: 'Block direct secret access',
          description: 'Hard-deny reading, writing, or rotating secrets and credentials',
          effect: 'deny',
          condition: {
            any: [
              { field: 'action.type', operator: 'startsWith', value: 'secrets.' },
              { field: 'action.type', operator: 'eq', value: 'vault.read' },
              { field: 'action.type', operator: 'eq', value: 'vault.write' },
            ],
          },
        },
        // --- Require approval: all writes ---
        {
          id: 'cons-approve-file-writes',
          name: 'Require approval for file writes',
          description: 'Any file creation, modification, or deletion requires human approval',
          effect: 'require_approval',
          condition: {
            any: [
              { field: 'action.type', operator: 'eq', value: 'filesystem.write' },
              { field: 'action.type', operator: 'eq', value: 'filesystem.create' },
              { field: 'action.type', operator: 'eq', value: 'filesystem.delete' },
              { field: 'action.type', operator: 'eq', value: 'filesystem.rename' },
              { field: 'action.type', operator: 'eq', value: 'filesystem.move' },
              { field: 'action.type', operator: 'eq', value: 'filesystem.chmod' },
            ],
          },
          approvalConfig: {
            requiredApprovals: 1,
            expiresIn: '1h',
          },
        },
        {
          id: 'cons-approve-code-execution',
          name: 'Require approval for code execution',
          description: 'All code execution, shell commands, and script running requires approval',
          effect: 'require_approval',
          condition: {
            any: [
              { field: 'action.type', operator: 'startsWith', value: 'code.' },
              { field: 'action.type', operator: 'startsWith', value: 'shell.' },
              { field: 'action.type', operator: 'eq', value: 'exec.run' },
            ],
          },
          approvalConfig: {
            requiredApprovals: 1,
            expiresIn: '30m',
          },
        },
        {
          id: 'cons-approve-network',
          name: 'Require approval for network operations',
          description: 'All outbound HTTP requests, webhooks, and API calls require approval',
          effect: 'require_approval',
          condition: {
            any: [
              { field: 'action.type', operator: 'startsWith', value: 'network.' },
              { field: 'action.type', operator: 'eq', value: 'http.request' },
              { field: 'action.type', operator: 'eq', value: 'webhook.send' },
            ],
          },
          approvalConfig: {
            requiredApprovals: 1,
            expiresIn: '30m',
          },
        },
        {
          id: 'cons-approve-database-writes',
          name: 'Require approval for database writes',
          description: 'INSERT, UPDATE, DELETE queries require approval',
          effect: 'require_approval',
          condition: {
            any: [
              { field: 'action.type', operator: 'eq', value: 'database.insert' },
              { field: 'action.type', operator: 'eq', value: 'database.update' },
              { field: 'action.type', operator: 'eq', value: 'database.delete' },
              { field: 'action.type', operator: 'startsWith', value: 'database.write' },
            ],
          },
          approvalConfig: {
            requiredApprovals: 1,
            expiresIn: '30m',
          },
        },
        {
          id: 'cons-approve-mcp-tools',
          name: 'Require approval for MCP tool calls',
          description: 'All MCP tool invocations require approval',
          effect: 'require_approval',
          condition: {
            any: [
              { field: 'action.type', operator: 'startsWith', value: 'mcp.' },
            ],
          },
          approvalConfig: {
            requiredApprovals: 1,
            expiresIn: '30m',
          },
        },
        {
          id: 'cons-approve-payments',
          name: 'Require approval for payments',
          description: 'All payment and financial operations require approval',
          effect: 'require_approval',
          condition: {
            any: [
              { field: 'action.type', operator: 'startsWith', value: 'payments.' },
              { field: 'action.type', operator: 'startsWith', value: 'billing.' },
            ],
          },
          approvalConfig: {
            requiredApprovals: 2,
            expiresIn: '1h',
          },
        },
      ],
      metadata: {
        template: 'conservative',
        category: 'production',
        riskLevel: 'low',
      },
    },
  ],

  // ──────────────────────────────────────────────
  // STANDARD — Balanced safety for everyday use
  // ──────────────────────────────────────────────
  [
    'standard',
    {
      id: 'template-standard',
      name: 'Standard',
      description:
        'Balanced posture for general use. Allows reads and common write operations. Requires approval for sensitive actions like payments, deletions, shell commands, and secret access. Denies destructive patterns. Good default for staging and monitored production.',
      version: '1.0.0',
      enabled: true,
      priority: 100,
      scope: {
        principalTypes: ['agent', 'service', 'user'],
        environments: ['development', 'staging', 'production'],
      },
      defaultEffect: 'deny',
      rules: [
        // --- Allowed: reads and common writes ---
        {
          id: 'std-allow-reads',
          name: 'Allow read operations',
          description: 'Permit all safe reads, searches, and directory listings',
          effect: 'allow',
          condition: {
            any: [
              { field: 'action.type', operator: 'startsWith', value: 'safe.read' },
              { field: 'action.type', operator: 'eq', value: 'filesystem.read' },
              { field: 'action.type', operator: 'eq', value: 'filesystem.list' },
              { field: 'action.type', operator: 'eq', value: 'filesystem.stat' },
              { field: 'action.type', operator: 'eq', value: 'search.grep' },
              { field: 'action.type', operator: 'eq', value: 'search.glob' },
              { field: 'action.type', operator: 'eq', value: 'database.query' },
              { field: 'action.type', operator: 'eq', value: 'database.select' },
            ],
          },
        },
        {
          id: 'std-allow-common-writes',
          name: 'Allow common file writes',
          description: 'Permit file creation and modification in project directories',
          effect: 'allow',
          condition: {
            any: [
              { field: 'action.type', operator: 'eq', value: 'filesystem.write' },
              { field: 'action.type', operator: 'eq', value: 'filesystem.create' },
              { field: 'action.type', operator: 'eq', value: 'filesystem.rename' },
              { field: 'action.type', operator: 'eq', value: 'filesystem.move' },
            ],
          },
        },
        {
          id: 'std-allow-safe-network',
          name: 'Allow GET requests',
          description: 'Permit read-only HTTP requests (GET, HEAD, OPTIONS)',
          effect: 'allow',
          condition: {
            any: [
              { field: 'action.type', operator: 'eq', value: 'network.http.get' },
              { field: 'action.type', operator: 'eq', value: 'network.http.head' },
              { field: 'action.type', operator: 'eq', value: 'network.http.options' },
            ],
          },
        },
        {
          id: 'std-allow-database-writes',
          name: 'Allow standard database writes',
          description: 'Permit INSERT and UPDATE queries for common data operations',
          effect: 'allow',
          condition: {
            any: [
              { field: 'action.type', operator: 'eq', value: 'database.insert' },
              { field: 'action.type', operator: 'eq', value: 'database.update' },
            ],
          },
        },
        // --- Blocked: destructive operations ---
        {
          id: 'std-deny-destructive-db',
          name: 'Block destructive database operations',
          description: 'Hard-deny DROP, TRUNCATE, and dangerous schema changes',
          effect: 'deny',
          condition: {
            any: [
              { field: 'action.type', operator: 'eq', value: 'database.drop' },
              { field: 'action.type', operator: 'eq', value: 'database.truncate' },
              { field: 'action.type', operator: 'eq', value: 'database.alter_schema' },
              { field: 'action.command', operator: 'matches', value: '(?i)\\b(DROP|TRUNCATE)\\b' },
            ],
          },
        },
        {
          id: 'std-deny-destructive-fs',
          name: 'Block destructive filesystem operations',
          description: 'Hard-deny recursive deletes and format commands',
          effect: 'deny',
          condition: {
            any: [
              { field: 'action.type', operator: 'eq', value: 'filesystem.rmrf' },
              { field: 'action.type', operator: 'eq', value: 'filesystem.format' },
              { field: 'action.command', operator: 'matches', value: 'rm\\s+-r' },
            ],
          },
        },
        {
          id: 'std-deny-system-commands',
          name: 'Block system-level commands',
          description: 'Hard-deny shutdown, reboot, and process kill operations',
          effect: 'deny',
          condition: {
            any: [
              { field: 'action.type', operator: 'eq', value: 'system.shutdown' },
              { field: 'action.type', operator: 'eq', value: 'system.reboot' },
              { field: 'action.type', operator: 'startsWith', value: 'system.process.kill' },
            ],
          },
        },
        // --- Require approval: sensitive operations ---
        {
          id: 'std-approve-file-deletes',
          name: 'Require approval for file deletions',
          description: 'File removal and permission changes require approval',
          effect: 'require_approval',
          condition: {
            any: [
              { field: 'action.type', operator: 'eq', value: 'filesystem.delete' },
              { field: 'action.type', operator: 'eq', value: 'filesystem.chmod' },
            ],
          },
          approvalConfig: {
            requiredApprovals: 1,
            expiresIn: '1h',
          },
        },
        {
          id: 'std-approve-database-deletes',
          name: 'Require approval for database deletes',
          description: 'DELETE queries and bulk data removal require approval',
          effect: 'require_approval',
          condition: {
            any: [
              { field: 'action.type', operator: 'eq', value: 'database.delete' },
              { field: 'action.type', operator: 'startsWith', value: 'database.bulk' },
            ],
          },
          approvalConfig: {
            requiredApprovals: 1,
            expiresIn: '1h',
          },
        },
        {
          id: 'std-approve-shell',
          name: 'Require approval for shell commands',
          description: 'All shell and code execution requires human approval',
          effect: 'require_approval',
          condition: {
            any: [
              { field: 'action.type', operator: 'startsWith', value: 'shell.' },
              { field: 'action.type', operator: 'startsWith', value: 'code.exec' },
              { field: 'action.type', operator: 'eq', value: 'exec.run' },
            ],
          },
          approvalConfig: {
            requiredApprovals: 1,
            expiresIn: '30m',
          },
        },
        {
          id: 'std-approve-mutating-network',
          name: 'Require approval for mutating HTTP requests',
          description: 'POST, PUT, DELETE, and PATCH HTTP requests require approval',
          effect: 'require_approval',
          condition: {
            any: [
              { field: 'action.type', operator: 'eq', value: 'network.http.post' },
              { field: 'action.type', operator: 'eq', value: 'network.http.put' },
              { field: 'action.type', operator: 'eq', value: 'network.http.delete' },
              { field: 'action.type', operator: 'eq', value: 'network.http.patch' },
              { field: 'action.type', operator: 'eq', value: 'webhook.send' },
            ],
          },
          approvalConfig: {
            requiredApprovals: 1,
            expiresIn: '30m',
          },
        },
        {
          id: 'std-approve-secrets',
          name: 'Require approval for secret access',
          description: 'Reading, writing, and rotating secrets requires approval',
          effect: 'require_approval',
          condition: {
            any: [
              { field: 'action.type', operator: 'startsWith', value: 'secrets.' },
              { field: 'action.type', operator: 'startsWith', value: 'vault.' },
            ],
          },
          approvalConfig: {
            requiredApprovals: 1,
            expiresIn: '15m',
          },
        },
        {
          id: 'std-approve-payments',
          name: 'Require approval for payments',
          description: 'All payment, billing, and financial operations require approval',
          effect: 'require_approval',
          condition: {
            any: [
              { field: 'action.type', operator: 'startsWith', value: 'payments.' },
              { field: 'action.type', operator: 'startsWith', value: 'billing.' },
            ],
          },
          approvalConfig: {
            requiredApprovals: 2,
            expiresIn: '1h',
          },
        },
        {
          id: 'std-approve-mcp',
          name: 'Require approval for MCP tool calls',
          description: 'Third-party MCP tool invocations require approval',
          effect: 'require_approval',
          condition: {
            any: [
              { field: 'action.type', operator: 'startsWith', value: 'mcp.' },
            ],
          },
          approvalConfig: {
            requiredApprovals: 1,
            expiresIn: '30m',
          },
        },
        {
          id: 'std-approve-agent-spawn',
          name: 'Require approval for agent spawning',
          description: 'Creating or delegating to sub-agents requires approval',
          effect: 'require_approval',
          condition: {
            any: [
              { field: 'action.type', operator: 'startsWith', value: 'agent.spawn' },
              { field: 'action.type', operator: 'startsWith', value: 'agent.delegate' },
            ],
          },
          approvalConfig: {
            requiredApprovals: 1,
            expiresIn: '30m',
          },
        },
      ],
      metadata: {
        template: 'standard',
        category: 'general',
        riskLevel: 'medium',
      },
    },
  ],

  // ──────────────────────────────────────────────
  // PERMISSIVE — Development-friendly, minimal friction
  // ──────────────────────────────────────────────
  [
    'permissive',
    {
      id: 'template-permissive',
      name: 'Permissive',
      description:
        'Allow most operations with minimal friction. Requires approval only for truly dangerous actions: database drops, system commands, financial transactions over thresholds, and secret rotation. Ideal for development and trusted internal tooling.',
      version: '1.0.0',
      enabled: true,
      priority: 100,
      scope: {
        principalTypes: ['agent', 'service', 'user'],
        environments: ['development', 'staging'],
      },
      defaultEffect: 'allow',
      rules: [
        // --- Blocked: catastrophic operations ---
        {
          id: 'perm-deny-db-drop',
          name: 'Block database drops',
          description: 'Hard-deny DROP DATABASE and TRUNCATE commands',
          effect: 'deny',
          condition: {
            any: [
              { field: 'action.type', operator: 'eq', value: 'database.drop' },
              { field: 'action.type', operator: 'eq', value: 'database.truncate' },
              { field: 'action.command', operator: 'matches', value: '(?i)\\bDROP\\s+DATABASE\\b' },
            ],
          },
        },
        {
          id: 'perm-deny-system-destructive',
          name: 'Block system-level destructive commands',
          description: 'Hard-deny shutdown, reboot, disk format, and recursive forced deletes',
          effect: 'deny',
          condition: {
            any: [
              { field: 'action.type', operator: 'eq', value: 'system.shutdown' },
              { field: 'action.type', operator: 'eq', value: 'system.reboot' },
              { field: 'action.type', operator: 'eq', value: 'filesystem.format' },
              { field: 'action.command', operator: 'matches', value: 'rm\\s+-rf\\s+/' },
              { field: 'action.command', operator: 'contains', value: 'mkfs' },
              { field: 'action.command', operator: 'matches', value: '(?i)\\b(shutdown|reboot|halt)\\b' },
            ],
          },
        },
        // --- Require approval: high-impact operations ---
        {
          id: 'perm-approve-schema-changes',
          name: 'Require approval for schema changes',
          description: 'ALTER TABLE, migrations, and schema modifications require approval',
          effect: 'require_approval',
          condition: {
            any: [
              { field: 'action.type', operator: 'eq', value: 'database.alter_schema' },
              { field: 'action.type', operator: 'eq', value: 'database.migrate' },
              { field: 'action.command', operator: 'matches', value: '(?i)\\bALTER\\s+TABLE\\b' },
            ],
          },
          approvalConfig: {
            requiredApprovals: 1,
            expiresIn: '2h',
          },
        },
        {
          id: 'perm-approve-system-commands',
          name: 'Require approval for system-level commands',
          description: 'Process management, service control, and sudo commands require approval',
          effect: 'require_approval',
          condition: {
            any: [
              { field: 'action.type', operator: 'startsWith', value: 'system.process' },
              { field: 'action.type', operator: 'startsWith', value: 'system.service' },
              { field: 'action.command', operator: 'matches', value: '(?i)\\bsudo\\b' },
              { field: 'action.command', operator: 'matches', value: '(?i)\\bsystemctl\\b' },
            ],
          },
          approvalConfig: {
            requiredApprovals: 1,
            expiresIn: '1h',
          },
        },
        {
          id: 'perm-approve-payments',
          name: 'Require approval for financial transactions',
          description: 'Payments, charges, refunds, and billing changes require approval',
          effect: 'require_approval',
          condition: {
            any: [
              { field: 'action.type', operator: 'startsWith', value: 'payments.' },
              { field: 'action.type', operator: 'startsWith', value: 'billing.' },
              { field: 'action.type', operator: 'eq', value: 'stripe.charge' },
              { field: 'action.type', operator: 'eq', value: 'stripe.refund' },
            ],
          },
          approvalConfig: {
            requiredApprovals: 1,
            expiresIn: '1h',
          },
        },
        {
          id: 'perm-approve-secret-rotation',
          name: 'Require approval for secret rotation',
          description: 'Rotating, deleting, or creating secrets requires approval',
          effect: 'require_approval',
          condition: {
            any: [
              { field: 'action.type', operator: 'eq', value: 'secrets.rotate' },
              { field: 'action.type', operator: 'eq', value: 'secrets.delete' },
              { field: 'action.type', operator: 'eq', value: 'secrets.create' },
              { field: 'action.type', operator: 'eq', value: 'vault.write' },
            ],
          },
          approvalConfig: {
            requiredApprovals: 1,
            expiresIn: '30m',
          },
        },
        {
          id: 'perm-approve-bulk-deletes',
          name: 'Require approval for bulk deletions',
          description: 'Bulk database deletes and recursive file removal require approval',
          effect: 'require_approval',
          condition: {
            any: [
              { field: 'action.type', operator: 'startsWith', value: 'database.bulk' },
              { field: 'action.type', operator: 'eq', value: 'filesystem.rmrf' },
              { field: 'action.command', operator: 'matches', value: 'rm\\s+-r' },
            ],
          },
          approvalConfig: {
            requiredApprovals: 1,
            expiresIn: '1h',
          },
        },
        // --- Rate limits on allowed-but-noisy operations ---
        {
          id: 'perm-ratelimit-network',
          name: 'Rate limit outbound HTTP',
          description: 'Cap outbound HTTP requests to prevent runaway loops',
          effect: 'allow',
          condition: {
            any: [
              { field: 'action.type', operator: 'startsWith', value: 'network.http' },
            ],
          },
          rateLimit: {
            requests: 500,
            window: '1h',
            scope: 'principal',
          },
        },
      ],
      metadata: {
        template: 'permissive',
        category: 'development',
        riskLevel: 'high',
      },
    },
  ],

  // ──────────────────────────────────────────────
  // CI/CD — Automated pipeline optimized
  // ──────────────────────────────────────────────
  [
    'ci-cd',
    {
      id: 'template-ci-cd',
      name: 'CI/CD Pipeline',
      description:
        'Optimized for automated CI/CD pipelines. Allows build, test, deploy, and infrastructure operations. Denies interactive/human-targeted actions and dangerous patterns. No approval workflows since automated pipelines cannot wait for human input.',
      version: '1.0.0',
      enabled: true,
      priority: 100,
      scope: {
        principalTypes: ['service', 'system'],
        environments: ['development', 'staging', 'production'],
      },
      defaultEffect: 'deny',
      rules: [
        // --- Allowed: all read operations ---
        {
          id: 'ci-allow-reads',
          name: 'Allow all reads',
          description: 'Permit file reads, search, database queries, and directory listing',
          effect: 'allow',
          condition: {
            any: [
              { field: 'action.type', operator: 'startsWith', value: 'safe.read' },
              { field: 'action.type', operator: 'eq', value: 'filesystem.read' },
              { field: 'action.type', operator: 'eq', value: 'filesystem.list' },
              { field: 'action.type', operator: 'eq', value: 'filesystem.stat' },
              { field: 'action.type', operator: 'eq', value: 'search.grep' },
              { field: 'action.type', operator: 'eq', value: 'search.glob' },
              { field: 'action.type', operator: 'eq', value: 'database.query' },
              { field: 'action.type', operator: 'eq', value: 'database.select' },
            ],
          },
        },
        // --- Allowed: build and test operations ---
        {
          id: 'ci-allow-build-test',
          name: 'Allow build and test operations',
          description: 'Permit compilation, testing, linting, and build tool invocation',
          effect: 'allow',
          condition: {
            any: [
              { field: 'action.type', operator: 'startsWith', value: 'code.build' },
              { field: 'action.type', operator: 'startsWith', value: 'code.test' },
              { field: 'action.type', operator: 'startsWith', value: 'code.lint' },
              { field: 'action.type', operator: 'startsWith', value: 'code.compile' },
              { field: 'action.type', operator: 'startsWith', value: 'code.format' },
              { field: 'action.type', operator: 'eq', value: 'code.typecheck' },
            ],
          },
        },
        // --- Allowed: deploy and infrastructure ---
        {
          id: 'ci-allow-deploy',
          name: 'Allow deploy operations',
          description: 'Permit container builds, image pushes, and deployment triggers',
          effect: 'allow',
          condition: {
            any: [
              { field: 'action.type', operator: 'startsWith', value: 'deploy.' },
              { field: 'action.type', operator: 'startsWith', value: 'container.' },
              { field: 'action.type', operator: 'startsWith', value: 'infrastructure.' },
              { field: 'action.type', operator: 'eq', value: 'docker.build' },
              { field: 'action.type', operator: 'eq', value: 'docker.push' },
            ],
          },
        },
        // --- Allowed: file operations needed for builds ---
        {
          id: 'ci-allow-file-ops',
          name: 'Allow build file operations',
          description: 'Permit file writes, creates, and cleans needed during builds',
          effect: 'allow',
          condition: {
            any: [
              { field: 'action.type', operator: 'eq', value: 'filesystem.write' },
              { field: 'action.type', operator: 'eq', value: 'filesystem.create' },
              { field: 'action.type', operator: 'eq', value: 'filesystem.delete' },
              { field: 'action.type', operator: 'eq', value: 'filesystem.rename' },
              { field: 'action.type', operator: 'eq', value: 'filesystem.move' },
            ],
          },
        },
        // --- Allowed: shell execution for build scripts ---
        {
          id: 'ci-allow-shell',
          name: 'Allow shell execution',
          description: 'Permit shell and script execution for build steps',
          effect: 'allow',
          condition: {
            any: [
              { field: 'action.type', operator: 'startsWith', value: 'shell.' },
              { field: 'action.type', operator: 'eq', value: 'exec.run' },
              { field: 'action.type', operator: 'startsWith', value: 'code.exec' },
            ],
          },
        },
        // --- Allowed: outbound network for package installs and API calls ---
        {
          id: 'ci-allow-network',
          name: 'Allow network operations',
          description: 'Permit outbound HTTP for package downloads, API calls, and webhooks',
          effect: 'allow',
          condition: {
            any: [
              { field: 'action.type', operator: 'startsWith', value: 'network.' },
              { field: 'action.type', operator: 'eq', value: 'http.request' },
              { field: 'action.type', operator: 'eq', value: 'webhook.send' },
            ],
          },
        },
        // --- Allowed: database migrations (common in CI) ---
        {
          id: 'ci-allow-db-migrations',
          name: 'Allow database migrations',
          description: 'Permit schema migrations and seed operations',
          effect: 'allow',
          condition: {
            any: [
              { field: 'action.type', operator: 'eq', value: 'database.migrate' },
              { field: 'action.type', operator: 'eq', value: 'database.seed' },
              { field: 'action.type', operator: 'eq', value: 'database.insert' },
              { field: 'action.type', operator: 'eq', value: 'database.update' },
              { field: 'action.type', operator: 'eq', value: 'database.delete' },
              { field: 'action.type', operator: 'eq', value: 'database.alter_schema' },
            ],
          },
        },
        // --- Allowed: secret reads (for env injection) ---
        {
          id: 'ci-allow-secret-reads',
          name: 'Allow secret reads',
          description: 'Permit reading secrets for environment variable injection during builds',
          effect: 'allow',
          condition: {
            any: [
              { field: 'action.type', operator: 'eq', value: 'secrets.read' },
              { field: 'action.type', operator: 'eq', value: 'vault.read' },
            ],
          },
        },
        // --- Blocked: destructive operations ---
        {
          id: 'ci-deny-db-drop',
          name: 'Block database drops',
          description: 'Hard-deny DROP DATABASE even in CI (use migrations instead)',
          effect: 'deny',
          condition: {
            any: [
              { field: 'action.type', operator: 'eq', value: 'database.drop' },
              { field: 'action.command', operator: 'matches', value: '(?i)\\bDROP\\s+DATABASE\\b' },
            ],
          },
        },
        {
          id: 'ci-deny-system-destructive',
          name: 'Block system-level destructive commands',
          description: 'Deny shutdown, reboot, and disk operations in CI',
          effect: 'deny',
          condition: {
            any: [
              { field: 'action.type', operator: 'eq', value: 'system.shutdown' },
              { field: 'action.type', operator: 'eq', value: 'system.reboot' },
              { field: 'action.type', operator: 'eq', value: 'filesystem.format' },
              { field: 'action.command', operator: 'matches', value: 'rm\\s+-rf\\s+/' },
              { field: 'action.command', operator: 'contains', value: 'mkfs' },
            ],
          },
        },
        // --- Blocked: interactive and human-targeted actions ---
        {
          id: 'ci-deny-interactive',
          name: 'Block interactive operations',
          description: 'Deny prompts, confirmations, and UI interactions that cannot work in CI',
          effect: 'deny',
          condition: {
            any: [
              { field: 'action.type', operator: 'startsWith', value: 'interactive.' },
              { field: 'action.type', operator: 'eq', value: 'ui.prompt' },
              { field: 'action.type', operator: 'eq', value: 'ui.confirm' },
              { field: 'action.type', operator: 'eq', value: 'ui.open_browser' },
              { field: 'action.type', operator: 'startsWith', value: 'notification.' },
            ],
          },
        },
        // --- Blocked: secret mutation (CI should not rotate secrets) ---
        {
          id: 'ci-deny-secret-mutation',
          name: 'Block secret mutation',
          description: 'CI pipelines should not create, rotate, or delete secrets',
          effect: 'deny',
          condition: {
            any: [
              { field: 'action.type', operator: 'eq', value: 'secrets.create' },
              { field: 'action.type', operator: 'eq', value: 'secrets.rotate' },
              { field: 'action.type', operator: 'eq', value: 'secrets.delete' },
              { field: 'action.type', operator: 'eq', value: 'vault.write' },
            ],
          },
        },
        // --- Blocked: payments (CI should never transact) ---
        {
          id: 'ci-deny-payments',
          name: 'Block financial operations',
          description: 'Hard-deny all payment and billing actions in automated pipelines',
          effect: 'deny',
          condition: {
            any: [
              { field: 'action.type', operator: 'startsWith', value: 'payments.' },
              { field: 'action.type', operator: 'startsWith', value: 'billing.' },
            ],
          },
        },
        // --- Blocked: agent spawning (CI runs are scoped) ---
        {
          id: 'ci-deny-agent-spawn',
          name: 'Block agent spawning',
          description: 'CI pipelines should not spawn autonomous sub-agents',
          effect: 'deny',
          condition: {
            any: [
              { field: 'action.type', operator: 'startsWith', value: 'agent.spawn' },
              { field: 'action.type', operator: 'startsWith', value: 'agent.delegate' },
            ],
          },
        },
        // --- Rate limits to prevent runaway pipelines ---
        {
          id: 'ci-ratelimit-deploys',
          name: 'Rate limit deployments',
          description: 'Cap deployment operations to prevent accidental infinite deploy loops',
          effect: 'allow',
          condition: {
            any: [
              { field: 'action.type', operator: 'startsWith', value: 'deploy.' },
            ],
          },
          rateLimit: {
            requests: 20,
            window: '1h',
            scope: 'global',
          },
        },
      ],
      metadata: {
        template: 'ci-cd',
        category: 'automation',
        riskLevel: 'medium',
        notes: 'No require_approval rules — automated pipelines cannot wait for human input.',
      },
    },
  ],
]);

/**
 * Template descriptions for the discovery endpoint.
 * Returns lightweight metadata without full policy payloads.
 */
const TEMPLATE_DESCRIPTIONS: Record<string, string> = {
  conservative:
    'Deny-by-default posture. Allows read-only operations. Requires human approval for all writes and code execution. Blocks destructive operations entirely. Recommended for production environments with autonomous agents.',
  standard:
    'Balanced posture for general use. Allows reads and common write operations. Requires approval for sensitive actions like payments, deletions, shell commands, and secret access. Denies destructive patterns.',
  permissive:
    'Allow most operations with minimal friction. Requires approval only for truly dangerous actions: database drops, system commands, financial transactions, and secret rotation. Ideal for development.',
  'ci-cd':
    'Optimized for automated CI/CD pipelines. Allows build, test, deploy, and infrastructure operations. Denies interactive/human-targeted actions. No approval workflows since automated pipelines cannot wait for human input.',
};

/**
 * List all available template metadata (id, name, description).
 * Lightweight — does not include full policy rules.
 */
export function listTemplates(): TemplateMetadata[] {
  const result: TemplateMetadata[] = [];
  for (const [id, policy] of POLICY_TEMPLATES) {
    result.push({
      id,
      name: policy.name,
      description: TEMPLATE_DESCRIPTIONS[id] ?? policy.description ?? '',
    });
  }
  return result;
}

/**
 * Get the full policy definition for a template.
 * Returns null if the template id is not found.
 */
export function getTemplate(id: string): Policy | null {
  return POLICY_TEMPLATES.get(id) ?? null;
}
