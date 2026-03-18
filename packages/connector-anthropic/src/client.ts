/**
 * Safe Anthropic Client
 *
 * Wraps the official @anthropic-ai/sdk with Authensor policy evaluation
 * and optional Aegis content scanning. Every `messages.create()` call
 * goes through the policy engine before reaching the Anthropic API.
 */

import type { Policy } from '@authensor/engine';
import { interceptClient } from './interceptor.js';
import type { InterceptorConfig, AegisScanSummary } from './interceptor.js';
import type { EvaluationResult, ActionEnvelope } from '@authensor/engine';

// ── Configuration ───────────────────────────────────────────────────────

export interface SafeAnthropicClientConfig {
  /** Anthropic API key */
  apiKey?: string;
  /**
   * Policy to evaluate requests against.
   * Accepts a Policy object or a YAML string (parsed at construction time).
   */
  policy: Policy | string;
  /** Principal ID for audit trail (default: 'anthropic-connector') */
  principalId?: string;
  /** Enable Aegis content scanning on responses (default: true) */
  aegisEnabled?: boolean;
  /** Called after each policy evaluation */
  onEvaluation?: (result: EvaluationResult, envelope: ActionEnvelope) => void;
  /** Called when Aegis flags a response */
  onAegisThreat?: (scanResult: AegisScanSummary) => void;
  /** Additional options passed to the Anthropic client constructor */
  clientOptions?: Record<string, unknown>;
}

// ── YAML parser (minimal) ───────────────────────────────────────────────

/**
 * Parse a minimal YAML policy string into a Policy object.
 * Supports the simple rule format used in Authensor policy files.
 * For production use, pass a pre-parsed Policy object instead.
 */
function parseSimpleYamlPolicy(yaml: string): Policy {
  const rules: Policy['rules'] = [];
  const lines = yaml.split('\n');

  let currentRule: Record<string, unknown> | null = null;
  let inConditions = false;
  let contentContains: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line.startsWith('- action:')) {
      // Flush previous rule
      if (currentRule) {
        rules.push(buildRule(currentRule, contentContains));
      }
      currentRule = { action: unquote(line.replace('- action:', '').trim()) };
      inConditions = false;
      contentContains = [];
    } else if (line.startsWith('decision:') && currentRule) {
      currentRule.decision = unquote(line.replace('decision:', '').trim());
    } else if (line.startsWith('conditions:') && currentRule) {
      inConditions = true;
    } else if (line.startsWith('content_contains:') && inConditions) {
      // Parse inline array: ["a", "b"]
      const match = line.match(/\[([^\]]*)\]/);
      if (match) {
        contentContains = match[1]
          .split(',')
          .map((s) => unquote(s.trim()))
          .filter(Boolean);
      }
    }
  }

  // Flush last rule
  if (currentRule) {
    rules.push(buildRule(currentRule, contentContains));
  }

  return {
    id: 'inline-policy',
    name: 'Inline Policy',
    version: '1.0.0',
    enabled: true,
    priority: 0,
    rules,
    defaultEffect: 'deny',
  };
}

function buildRule(raw: Record<string, unknown>, contentContains: string[]): Policy['rules'][number] {
  const action = raw.action as string;
  const decision = (raw.decision as string) ?? 'deny';
  const effect = decision === 'allow' ? 'allow' : decision === 'escalate' ? 'require_approval' : 'deny';

  const rule: Policy['rules'][number] = {
    id: `rule-${crypto.randomUUID().slice(0, 8)}`,
    name: `${effect} ${action}`,
    effect,
    condition: undefined,
  };

  // Build conditions
  const conditions: Array<{ field: string; operator: string; value: unknown }> = [];

  // Action type match
  conditions.push({
    field: 'action.type',
    operator: 'eq',
    value: action,
  });

  // Content contains conditions
  for (const term of contentContains) {
    conditions.push({
      field: 'action.parameters.content',
      operator: 'contains',
      value: term,
    });
  }

  if (conditions.length === 1) {
    rule.condition = conditions[0] as Policy['rules'][number]['condition'];
  } else {
    rule.condition = { all: conditions } as Policy['rules'][number]['condition'];
  }

  return rule;
}

function unquote(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

// ── Factory ─────────────────────────────────────────────────────────────

/**
 * Create a safe Anthropic client that evaluates every request against
 * an Authensor policy before forwarding it to the Anthropic API.
 *
 * @example
 * ```typescript
 * import { createSafeAnthropicClient } from '@authensor/connector-anthropic';
 *
 * const client = createSafeAnthropicClient({
 *   apiKey: process.env.ANTHROPIC_API_KEY,
 *   policy: myPolicy,
 * });
 *
 * const response = await client.messages.create({
 *   model: 'claude-sonnet-4-5-20250514',
 *   max_tokens: 1024,
 *   messages: [{ role: 'user', content: 'Hello' }],
 * });
 * ```
 */
export async function createSafeAnthropicClient(
  config: SafeAnthropicClientConfig,
): Promise<Record<string, unknown>> {
  // Parse policy
  const policy: Policy =
    typeof config.policy === 'string'
      ? parseSimpleYamlPolicy(config.policy)
      : config.policy;

  // Dynamic import of the peer dependency
  const AnthropicModule = await import('@anthropic-ai/sdk');
  const AnthropicClass = AnthropicModule.default ?? AnthropicModule;

  // Construct options
  const clientOpts: Record<string, unknown> = { ...config.clientOptions };
  if (config.apiKey) {
    clientOpts.apiKey = config.apiKey;
  }

  // Create the real client
  const client = new (AnthropicClass as unknown as new (opts: Record<string, unknown>) => Record<string, unknown>)(clientOpts);

  // Build interceptor config
  const interceptorConfig: InterceptorConfig = {
    policies: [policy],
    principalId: config.principalId ?? 'anthropic-connector',
    aegisEnabled: config.aegisEnabled ?? true,
    onEvaluation: config.onEvaluation,
    onAegisThreat: config.onAegisThreat,
  };

  // Return the proxied client
  return interceptClient(client, interceptorConfig);
}
