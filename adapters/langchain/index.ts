/**
 * @authensor/langchain — Authensor guardrail for LangChain/LangGraph
 *
 * Wraps a LangChain tool so every invocation is evaluated against
 * Authensor policies before the tool runs.
 *
 * Usage:
 *   import { AuthensorGuard } from '@authensor/langchain';
 *   const guard = new AuthensorGuard('http://localhost:3000');
 *   const safeTool = guard.wrap(myTool);
 */

export interface AuthensorGuardOptions {
  /** Authensor control plane URL */
  controlPlaneUrl: string;
  /** API key for the control plane */
  apiKey?: string;
  /** Principal ID (defaults to 'langchain-agent') */
  principalId?: string;
  /** Principal type (defaults to 'agent') */
  principalType?: 'user' | 'agent' | 'service' | 'system';
  /** Environment (defaults to NODE_ENV or 'development') */
  environment?: 'development' | 'staging' | 'production';
}

export class AuthensorGuard {
  private baseUrl: string;
  private apiKey?: string;
  private principalId: string;
  private principalType: 'user' | 'agent' | 'service' | 'system';
  private environment: string;

  constructor(options: AuthensorGuardOptions | string) {
    if (typeof options === 'string') {
      options = { controlPlaneUrl: options };
    }
    this.baseUrl = options.controlPlaneUrl.replace(/\/$/, '');
    this.apiKey = options.apiKey ?? process.env.AUTHENSOR_API_KEY;
    this.principalId = options.principalId ?? 'langchain-agent';
    this.principalType = options.principalType ?? 'agent';
    this.environment = options.environment ?? process.env.NODE_ENV ?? 'development';
  }

  /**
   * Evaluate an action against Authensor policies.
   * Throws if the action is denied.
   */
  async evaluate(toolName: string, args: Record<string, unknown> = {}): Promise<{
    receiptId: string;
    decision: { outcome: string; reason?: string };
  }> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

    const envelope = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      action: {
        type: `langchain.${toolName}`,
        resource: `langchain://${toolName}`,
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

    if (!res.ok) throw new Error(`Authensor evaluation failed: ${await res.text()}`);

    const result = await res.json() as {
      receiptId: string;
      decision: { outcome: string; reason?: string };
    };

    if (result.decision.outcome === 'deny' || result.decision.outcome === 'rate_limited') {
      throw new Error(
        `Action denied by Authensor: ${result.decision.reason || result.decision.outcome}`
      );
    }

    return result;
  }

  /**
   * Wrap a LangChain tool so it's gated by Authensor.
   * Works with any object that has a `name` and `invoke` method.
   */
  wrap<T extends { name: string; invoke: (...args: any[]) => any }>(tool: T): T {
    const guard = this;
    const original = tool.invoke.bind(tool);

    tool.invoke = async function (input: any, ...rest: any[]) {
      await guard.evaluate(tool.name, typeof input === 'object' ? input : { input });
      return original(input, ...rest);
    };

    return tool;
  }
}
