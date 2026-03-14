/**
 * @authensor/claude-agent-sdk — Authensor guardrail for Claude Agent SDK
 *
 * Wraps Claude Agent SDK tool definitions so every tool invocation is
 * evaluated against Authensor policies before execution.
 *
 * Usage:
 *   import { AuthensorClaudeGuard } from '@authensor/claude-agent-sdk';
 *
 *   const guard = new AuthensorClaudeGuard({
 *     controlPlaneUrl: 'http://localhost:3000',
 *   });
 *
 *   // Wrap a single tool
 *   const safeTool = guard.wrapTool(myTool);
 *
 *   // Or wrap all tools at once
 *   const safeTools = guard.wrapTools([toolA, toolB, toolC]);
 *
 *   // Or evaluate manually before executing
 *   const result = await guard.evaluate('send_email', { to: 'user@example.com' });
 *   if (result.allowed) { ... }
 */

export interface AuthensorClaudeGuardOptions {
  /** Authensor control plane URL */
  controlPlaneUrl: string;
  /** API key for the control plane */
  apiKey?: string;
  /** Principal ID (defaults to 'claude-agent') */
  principalId?: string;
  /** Principal type (defaults to 'agent') */
  principalType?: 'user' | 'agent' | 'service' | 'system';
  /** Environment (defaults to NODE_ENV or 'development') */
  environment?: 'development' | 'staging' | 'production';
  /** Called when a tool call requires approval; return true to approve */
  onApprovalRequired?: (toolName: string, args: Record<string, unknown>, reason?: string) => Promise<boolean>;
}

export interface EvaluateResult {
  allowed: boolean;
  requiresApproval: boolean;
  receiptId?: string;
  outcome: string;
  reason?: string;
}

/** Minimal shape of a Claude Agent SDK tool definition */
export interface ClaudeTool {
  name: string;
  description?: string;
  input_schema?: Record<string, unknown>;
  [key: string]: unknown;
}

/** A tool handler function: receives input, returns a result */
export type ToolHandler<TInput = Record<string, unknown>, TOutput = unknown> =
  (input: TInput) => Promise<TOutput>;

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

export class AuthensorClaudeGuard {
  private baseUrl: string;
  private apiKey?: string;
  private principalId: string;
  private principalType: 'user' | 'agent' | 'service' | 'system';
  private environment: string;
  private onApprovalRequired?: AuthensorClaudeGuardOptions['onApprovalRequired'];

  constructor(options: AuthensorClaudeGuardOptions | string) {
    if (typeof options === 'string') {
      options = { controlPlaneUrl: options };
    }
    this.baseUrl = options.controlPlaneUrl.replace(/\/$/, '');
    this.apiKey = options.apiKey ?? process.env.AUTHENSOR_API_KEY;
    this.principalId = options.principalId ?? 'claude-agent';
    this.principalType = options.principalType ?? 'agent';
    this.environment = options.environment ?? process.env.NODE_ENV ?? 'development';
    this.onApprovalRequired = options.onApprovalRequired;
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
        type: `claude.${toolName}`,
        resource: `claude://${toolName}`,
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
   * Guard a tool call: evaluate, handle approval flow, throw on deny.
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

    if (result.requiresApproval && this.onApprovalRequired) {
      const approved = await this.onApprovalRequired(toolName, args, result.reason);
      if (approved) return result.receiptId!;
    }

    throw new AuthensorDeniedError(
      toolName,
      result.outcome,
      result.reason,
      result.receiptId,
    );
  }

  /**
   * Wrap a tool handler so it's gated by Authensor.
   * Returns a new handler that evaluates policies before calling the original.
   */
  wrapHandler<TInput extends Record<string, unknown> = Record<string, unknown>, TOutput = unknown>(
    toolName: string,
    handler: ToolHandler<TInput, TOutput>,
  ): ToolHandler<TInput, TOutput> {
    const self = this;
    return async (input: TInput): Promise<TOutput> => {
      await self.guard(toolName, input);
      return handler(input);
    };
  }

  /**
   * Create a wrapped tool definition and handler pair.
   * The tool definition is passed through unchanged; the handler is guarded.
   */
  wrapTool<TInput extends Record<string, unknown> = Record<string, unknown>, TOutput = unknown>(
    tool: ClaudeTool,
    handler: ToolHandler<TInput, TOutput>,
  ): { tool: ClaudeTool; handler: ToolHandler<TInput, TOutput> } {
    return {
      tool,
      handler: this.wrapHandler(tool.name, handler),
    };
  }

  /**
   * Wrap multiple tool/handler pairs at once.
   */
  wrapTools<TInput extends Record<string, unknown> = Record<string, unknown>, TOutput = unknown>(
    pairs: Array<{ tool: ClaudeTool; handler: ToolHandler<TInput, TOutput> }>,
  ): Array<{ tool: ClaudeTool; handler: ToolHandler<TInput, TOutput> }> {
    return pairs.map(({ tool, handler }) => this.wrapTool(tool, handler));
  }
}
