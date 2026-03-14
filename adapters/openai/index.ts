/**
 * @authensor/openai — Authensor guardrail for OpenAI Agents SDK
 *
 * Provides a guardrail function that can be used with the OpenAI Agents SDK
 * to evaluate tool calls against Authensor policies.
 *
 * Usage:
 *   import { createAuthensorGuardrail } from '@authensor/openai';
 *   const guardrail = createAuthensorGuardrail('http://localhost:3000');
 *   // Use as a pre-tool-call hook in your agent
 */

export interface AuthensorOptions {
  /** Authensor control plane URL */
  controlPlaneUrl: string;
  /** API key for the control plane */
  apiKey?: string;
  /** Principal ID (defaults to 'openai-agent') */
  principalId?: string;
  /** Principal type (defaults to 'agent') */
  principalType?: 'user' | 'agent' | 'service' | 'system';
}

export interface GuardrailResult {
  allowed: boolean;
  receiptId?: string;
  outcome: string;
  reason?: string;
}

/**
 * Create an Authensor guardrail function for OpenAI Agents SDK.
 * Returns a function that evaluates tool calls against policies.
 */
export function createAuthensorGuardrail(options: AuthensorOptions | string) {
  if (typeof options === 'string') {
    options = { controlPlaneUrl: options };
  }

  const baseUrl = options.controlPlaneUrl.replace(/\/$/, '');
  const apiKey = options.apiKey ?? process.env.AUTHENSOR_API_KEY;
  const principalId = options.principalId ?? 'openai-agent';
  const principalType = options.principalType ?? 'agent';

  /**
   * Evaluate a tool call against Authensor policies.
   * @param toolName - Name of the tool being called
   * @param args - Arguments passed to the tool
   * @returns GuardrailResult with allowed/denied status
   */
  async function evaluate(
    toolName: string,
    args: Record<string, unknown> = {}
  ): Promise<GuardrailResult> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const envelope = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      action: {
        type: `openai.${toolName}`,
        resource: `openai://${toolName}`,
        operation: 'execute' as const,
        parameters: args,
      },
      principal: { type: principalType, id: principalId },
      context: {
        environment: process.env.NODE_ENV ?? 'development',
      },
    };

    const res = await fetch(`${baseUrl}/evaluate`, {
      method: 'POST',
      headers,
      body: JSON.stringify(envelope),
    });

    if (!res.ok) {
      return { allowed: false, outcome: 'error', reason: `Evaluation failed: ${res.status}` };
    }

    const result = await res.json() as {
      receiptId: string;
      decision: { outcome: string; reason?: string };
    };

    const allowed = result.decision.outcome === 'allow';
    return {
      allowed,
      receiptId: result.receiptId,
      outcome: result.decision.outcome,
      reason: result.decision.reason,
    };
  }

  /**
   * Guardrail that throws on denied actions.
   * Use as a pre-tool-call check in your agent loop.
   */
  async function guard(toolName: string, args: Record<string, unknown> = {}): Promise<string> {
    const result = await evaluate(toolName, args);
    if (!result.allowed) {
      throw new Error(`Authensor denied ${toolName}: ${result.reason || result.outcome}`);
    }
    return result.receiptId!;
  }

  return { evaluate, guard };
}
