/**
 * agent.ts — Real OpenAI agent skeleton with Authensor guardrails.
 *
 * This file shows the minimal integration pattern for adding Authensor
 * to an OpenAI Agents SDK agent. Copy this pattern into your own project.
 *
 * Runs offline with @authensor/engine — no API server or API keys needed.
 *
 * Run: pnpm start
 */

import { PolicyEngine } from '@authensor/engine';
import { AegisScanner } from '@authensor/aegis';
import type { ActionEnvelope, Policy, EvaluationResult } from '@authensor/engine';

// ── ANSI colors ───────────────────────────────────────────────────────
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

// ── Step 1: Define your policy ────────────────────────────────────────
// In production, load this from a file or the Authensor control plane.

const policy: Policy = {
  id: 'my-agent-policy',
  name: 'My Agent Safety Policy',
  version: '1.0.0',
  priority: 100,
  scope: {
    principalTypes: ['agent'],
    actionTypes: ['agent.**'],
  },
  rules: [
    {
      id: 'allow-read-ops',
      name: 'Allow read operations',
      effect: 'allow',
      condition: {
        field: 'action.operation',
        operator: 'in',
        value: ['read', 'execute'] as unknown as Record<string, unknown>,
      },
    },
    {
      id: 'review-writes',
      name: 'Review write operations',
      effect: 'require_approval',
      condition: {
        field: 'action.operation',
        operator: 'in',
        value: ['create', 'update'] as unknown as Record<string, unknown>,
      },
    },
    {
      id: 'deny-deletes',
      name: 'Block delete operations',
      effect: 'deny',
      condition: {
        field: 'action.operation',
        operator: 'eq',
        value: 'delete',
      },
    },
  ],
  defaultEffect: 'deny',
};

// ── Step 2: Initialize the engine ─────────────────────────────────────

const engine = new PolicyEngine();
const aegis = new AegisScanner();

// ── Step 3: Create the guardrail function ─────────────────────────────

interface GuardrailResult {
  allowed: boolean;
  outcome: string;
  reason: string;
  evaluationTimeMs: number;
  contentSafe: boolean;
}

/**
 * Evaluate a tool call against the Authensor policy.
 * This is the function you integrate into your agent's tool-call loop.
 *
 * Integration is 4 lines:
 *   1. Import PolicyEngine + AegisScanner
 *   2. Create the engine and scanner
 *   3. Call this function before each tool execution
 *   4. Check the result before proceeding
 */
function authensorGuardrail(
  toolName: string,
  operation: 'create' | 'read' | 'update' | 'delete' | 'execute',
  args: Record<string, unknown> = {},
): GuardrailResult {
  // Content safety scan
  const argText = Object.values(args).map(String).join(' ');
  const scanResult = aegis.scan(argText);

  if (!scanResult.safe) {
    return {
      allowed: false,
      outcome: 'deny',
      reason: `Content safety: ${scanResult.detections.map((d) => d.subType).join(', ')}`,
      evaluationTimeMs: scanResult.scanTimeMs,
      contentSafe: false,
    };
  }

  // Policy evaluation
  const envelope: ActionEnvelope = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    action: {
      type: `agent.${toolName}`,
      resource: `agent://${toolName}`,
      operation,
      parameters: args as Record<string, unknown>,
    },
    principal: {
      type: 'agent',
      id: 'my-openai-agent',
      name: 'My OpenAI Agent',
    },
    context: {
      environment: 'development',
    },
  };

  const result: EvaluationResult = engine.evaluate(envelope, [policy]);

  return {
    allowed: result.decision.outcome === 'allow',
    outcome: result.decision.outcome,
    reason: result.decision.reason || 'Policy decision',
    evaluationTimeMs: result.evaluationTimeMs,
    contentSafe: true,
  };
}

// ── Step 4: Use in your agent loop ────────────────────────────────────

/**
 * Example: OpenAI Agents SDK tool-call handler with Authensor.
 *
 * In your real agent, replace the simulated tool calls with actual
 * OpenAI function call handling:
 *
 *   for (const toolCall of response.tool_calls) {
 *     const guard = authensorGuardrail(
 *       toolCall.function.name,
 *       'execute',
 *       JSON.parse(toolCall.function.arguments),
 *     );
 *     if (!guard.allowed) {
 *       // Return denial to the model
 *       continue;
 *     }
 *     // Execute the tool
 *   }
 */

interface SimulatedToolCall {
  name: string;
  operation: 'create' | 'read' | 'update' | 'delete' | 'execute';
  args: Record<string, unknown>;
}

const exampleToolCalls: SimulatedToolCall[] = [
  { name: 'get_user', operation: 'read', args: { userId: '123' } },
  { name: 'create_post', operation: 'create', args: { title: 'Hello world', body: 'First post' } },
  { name: 'update_profile', operation: 'update', args: { name: 'New Name' } },
  { name: 'delete_account', operation: 'delete', args: { userId: '123' } },
  { name: 'search_docs', operation: 'execute', args: { query: 'how to integrate' } },
];

console.log(`
${BOLD}OpenAI Agent with Authensor Guardrails${RESET}
${DIM}Policy: ${policy.name} v${policy.version}${RESET}
${DIM}Rules: ${policy.rules.length} | Aegis detectors: ${aegis.getRuleCount()}${RESET}
`);

for (const call of exampleToolCalls) {
  const guard = authensorGuardrail(call.name, call.operation, call.args);

  let icon: string;
  let color: string;
  if (guard.outcome === 'allow') {
    icon = 'ALLOW';
    color = GREEN;
  } else if (guard.outcome === 'require_approval') {
    icon = 'REVIEW';
    color = YELLOW;
  } else {
    icon = 'DENY';
    color = RED;
  }

  console.log(
    `  ${color}${icon.padEnd(8)}${RESET} ${call.name} (${call.operation})` +
    `${DIM} — ${guard.reason} [${guard.evaluationTimeMs.toFixed(2)}ms]${RESET}`
  );
}

console.log(`
${DIM}Copy this pattern into your OpenAI agent. See README.md for details.${RESET}
`);
