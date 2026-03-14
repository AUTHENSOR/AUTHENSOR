/**
 * @authensor/vercel-ai-sdk — Authensor guardrail for Vercel AI SDK
 *
 * Wraps Vercel AI SDK tool definitions so every tool invocation is
 * evaluated against Authensor policies. Integrates with the AI SDK's
 * built-in `experimental_toToolResultContent` and tool execution flow.
 *
 * Usage:
 *   import { AuthensorVercelGuard, authensorTool } from '@authensor/vercel-ai-sdk';
 *   import { tool } from 'ai';
 *   import { z } from 'zod';
 *
 *   const guard = new AuthensorVercelGuard({
 *     controlPlaneUrl: 'http://localhost:3000',
 *   });
 *
 *   // Wrap a Vercel AI SDK tool definition
 *   const safeTool = guard.wrapTool('send_email', {
 *     description: 'Send an email',
 *     parameters: z.object({ to: z.string(), body: z.string() }),
 *     execute: async ({ to, body }) => { ... },
 *   });
 */

export interface AuthensorVercelGuardOptions {
  /** Authensor control plane URL */
  controlPlaneUrl: string;
  /** API key for the control plane */
  apiKey?: string;
  /** Principal ID (defaults to 'vercel-ai-agent') */
  principalId?: string;
  /** Principal type (defaults to 'agent') */
  principalType?: 'user' | 'agent' | 'service' | 'system';
  /** Environment (defaults to NODE_ENV or 'development') */
  environment?: 'development' | 'staging' | 'production';
}

export interface EvaluateResult {
  allowed: boolean;
  requiresApproval: boolean;
  receiptId?: string;
  outcome: string;
  reason?: string;
}

/** Minimal shape of a Vercel AI SDK tool definition */
export interface VercelToolDefinition {
  description?: string;
  parameters?: unknown;
  execute?: (args: any, options?: any) => Promise<any>;
  [key: string]: unknown;
}

/**
 * Error thrown when Authensor denies a tool call.
 */
export class AuthensorDeniedError extends Error {
  public readonly toolName: string;
  public readonly outcome: string;
  public readonly receiptId?: string;

  constructor(toolName: string, outcome: string, reason?: string, receiptId?: string) {
    super(`Authensor denied tool "${toolName}": ${reason || outcome}`);
    this.name = 'AuthensorDeniedError';
    this.toolName = toolName;
    this.outcome = outcome;
    this.receiptId = receiptId;
  }
}

export class AuthensorVercelGuard {
  private baseUrl: string;
  private apiKey?: string;
  private principalId: string;
  private principalType: 'user' | 'agent' | 'service' | 'system';
  private environment: string;

  constructor(options: AuthensorVercelGuardOptions | string) {
    if (typeof options === 'string') {
      options = { controlPlaneUrl: options };
    }
    this.baseUrl = options.controlPlaneUrl.replace(/\/$/, '');
    this.apiKey = options.apiKey ?? process.env.AUTHENSOR_API_KEY;
    this.principalId = options.principalId ?? 'vercel-ai-agent';
    this.principalType = options.principalType ?? 'agent';
    this.environment = options.environment ?? process.env.NODE_ENV ?? 'development';
  }

  /**
   * Evaluate a tool call against Authensor policies.
   */
  async evaluate(
    toolName: string,
    args: Record<string, unknown> = {},
  ): Promise<EvaluateResult> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

    const envelope = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      action: {
        type: `vercel-ai.${toolName}`,
        resource: `vercel-ai://${toolName}`,
        operation: 'execute' as const,
        parameters: args,
      },
      principal: {
        type: this.principalType,
        id: this.principalId,
      },
      context: {
        environment: this.environment,
      },
    };

    const res = await fetch(`${this.baseUrl}/evaluate`, {
      method: 'POST',
      headers,
      body: JSON.stringify(envelope),
    });

    if (!res.ok) {
      // Fail closed — treat errors as denied
      return {
        allowed: false,
        requiresApproval: false,
        outcome: 'error',
        reason: `Evaluation failed: ${res.status}`,
      };
    }

    const result = await res.json() as {
      receiptId: string;
      decision: { outcome: string; reason?: string };
    };

    const outcome = result.decision.outcome;
    return {
      allowed: outcome === 'allow',
      requiresApproval: outcome === 'require_approval',
      receiptId: result.receiptId,
      outcome,
      reason: result.decision.reason,
    };
  }

  /**
   * Guard a tool call: evaluate and throw on deny.
   * Returns the receipt ID on success.
   */
  async guard(
    toolName: string,
    args: Record<string, unknown> = {},
  ): Promise<string> {
    const result = await this.evaluate(toolName, args);

    if (result.allowed) {
      return result.receiptId!;
    }

    throw new AuthensorDeniedError(
      toolName,
      result.outcome,
      result.reason,
      result.receiptId,
    );
  }

  /**
   * Wrap a Vercel AI SDK tool definition so its execute function is gated
   * by Authensor policies.
   *
   * The tool's `execute` is intercepted: before the original runs, Authensor
   * evaluates the tool call. If denied or requiring approval, an error is
   * thrown (the AI SDK surfaces this as a tool error to the model).
   *
   * @param toolName - The name of the tool (used in policy evaluation)
   * @param toolDef - The Vercel AI SDK tool definition
   * @returns A new tool definition with a guarded execute function
   */
  wrapTool<T extends VercelToolDefinition>(toolName: string, toolDef: T): T {
    if (!toolDef.execute) return toolDef;

    const self = this;
    const originalExecute = toolDef.execute;

    return {
      ...toolDef,
      execute: async (args: any, options?: any) => {
        const evalArgs = typeof args === 'object' && args !== null
          ? args as Record<string, unknown>
          : { input: args };

        await self.guard(toolName, evalArgs);
        return originalExecute(args, options);
      },
    };
  }

  /**
   * Wrap multiple Vercel AI SDK tool definitions at once.
   * Takes a record of { toolName: toolDef } and returns the same shape
   * with guarded execute functions.
   */
  wrapTools<T extends Record<string, VercelToolDefinition>>(tools: T): T {
    const wrapped: Record<string, VercelToolDefinition> = {};
    for (const [name, def] of Object.entries(tools)) {
      wrapped[name] = this.wrapTool(name, def);
    }
    return wrapped as T;
  }

  /**
   * Create a Vercel AI SDK-compatible `needsApproval` function that delegates
   * the decision to Authensor. Returns true (needs approval) when the policy
   * outcome is `require_approval` or `deny`.
   *
   * Usage with Vercel AI SDK:
   *   const myTool = tool({
   *     description: 'Send an email',
   *     parameters: z.object({ to: z.string() }),
   *     execute: async ({ to }) => sendEmail(to),
   *     experimental_needsApproval: guard.needsApproval('send_email'),
   *   });
   */
  needsApproval(toolName: string): (args: Record<string, unknown>) => Promise<boolean> {
    const self = this;
    return async (args: Record<string, unknown>): Promise<boolean> => {
      const result = await self.evaluate(toolName, args);
      // If denied outright, also signal "needs approval" so the user gets a chance to see it
      return result.requiresApproval || !result.allowed;
    };
  }
}
