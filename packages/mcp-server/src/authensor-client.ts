/**
 * Authensor Client
 *
 * Client for communicating with the Authensor Control Plane.
 * Handles envelope creation, evaluation, and receipt updates.
 * Supports API key authentication and sandbox mode execution.
 */

import type { ActionEnvelope, Decision } from '@authensor/engine';
import type { ExecutionError } from './hardening/errors.js';
import { isSandboxMode, getStubResult, getSandboxMode } from './sandbox.js';
import { checkToolAllowed } from './controls-client.js';

export interface EvaluationResult {
  receiptId: string;
  decision: Decision;
  evaluationTimeMs: number;
  receiptUrl?: string;
}

interface ClaimResult {
  claimId?: string;
  alreadyExecuted?: boolean;
  receipt?: unknown;
}

export class AuthensorClient {
  private baseUrl: string;
  private principalId: string;
  private principalType: 'user' | 'agent' | 'service' | 'system';
  private apiKey?: string;

  constructor(
    baseUrl: string,
    options: {
      principalId?: string;
      principalType?: 'user' | 'agent' | 'service' | 'system';
      apiKey?: string;
    } = {}
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.principalId = options.principalId || 'mcp-agent';
    this.principalType = options.principalType || 'agent';
    this.apiKey = options.apiKey || process.env.AUTHENSOR_API_KEY;
  }

  /**
   * Get headers for API requests (includes API key if configured)
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  /**
   * Check if a tool is allowed to execute (defense-in-depth)
   */
  async checkToolAllowed(toolName: string): Promise<{ allowed: boolean; code?: string; message?: string }> {
    const result = await checkToolAllowed(this.baseUrl, toolName, this.apiKey);
    if (!result.allowed) {
      return { allowed: false, code: result.code, message: result.message };
    }
    return { allowed: true };
  }

  async claim(receiptId: string): Promise<ClaimResult> {
    const response = await fetch(`${this.baseUrl}/receipts/${receiptId}/claim`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
    if (response.status === 200) {
      return response.json() as Promise<ClaimResult>;
    }
    if (response.status === 409) {
      const body = (await response.json()) as { error?: string };
      throw new Error(body.error || 'Receipt not claimable');
    }
    throw new Error(`Claim failed: ${await response.text()}`);
  }

  /**
   * Create an envelope for an action
   */
  createEnvelope(
    actionType: string,
    resource: string,
    options: {
      operation?: ActionEnvelope['action']['operation'];
      parameters?: Record<string, unknown>;
      constraints?: ActionEnvelope['constraints'];
      context?: Partial<ActionEnvelope['context']>;
    } = {}
  ): ActionEnvelope {
    return {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      action: {
        type: actionType,
        resource,
        operation: options.operation,
        parameters: options.parameters,
      },
      principal: {
        type: this.principalType,
        id: this.principalId,
      },
      context: {
        environment:
          (process.env.NODE_ENV as 'development' | 'staging' | 'production') || 'development',
        ...options.context,
      },
      constraints: options.constraints,
    };
  }

  /**
   * Evaluate an action envelope against policies
   */
  async evaluate(envelope: ActionEnvelope): Promise<EvaluationResult> {
    const response = await fetch(`${this.baseUrl}/evaluate`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(envelope),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Evaluation failed: ${error}`);
    }

    return response.json() as Promise<EvaluationResult>;
  }

  /**
   * Update a receipt after execution
   */
  async updateReceipt(
    receiptId: string,
    status: 'executed' | 'failed',
    execution?: {
      durationMs?: number;
      attemptCount?: number;
      result?: Record<string, unknown>;
      error?: ExecutionError | { code?: string; message?: string; retryAt?: string; httpStatus?: number };
      mode?: 'stub' | 'real';
    },
    claimId?: string
  ): Promise<void> {
    const response = await fetch(`${this.baseUrl}/receipts/${receiptId}`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify({
        status,
        claimId,
        execution: {
          completedAt: new Date().toISOString(),
          ...execution,
        },
      }),
    });

    if (!response.ok) {
      console.warn(`Failed to update receipt ${receiptId}: ${response.statusText}`);
    }
  }

  /**
   * Execution result from executor function
   * Allows tools to report attempts, errors, and normalized results
   */
  /**
   * Helper to evaluate and execute an action with sandbox support
   * In sandbox mode, returns stubbed results without calling the actual executor
   *
   * @param actionType - The action type (e.g., 'stripe.customers.list')
   * @param resource - The resource being accessed (e.g., 'stripe://customers')
   * @param executor - Function that performs the actual execution, receives receiptId for idempotency
   * @param options - Configuration options including toolName for sandbox mode
   */
  async evaluateAndExecute<T>(
    actionType: string,
    resource: string,
    executor: (receiptId: string) => Promise<T>,
    options: {
      operation?: ActionEnvelope['action']['operation'];
      parameters?: Record<string, unknown>;
      constraints?: ActionEnvelope['constraints'];
      context?: Partial<ActionEnvelope['context']>;
      toolName?: string;
    } = {}
  ): Promise<{ result: T; receiptId: string }> {
    // Create and evaluate envelope
    const envelope = this.createEnvelope(actionType, resource, options);
    const evaluation = await this.evaluate(envelope);

    if (evaluation.decision.outcome !== 'allow') {
      throw new Error(
        `Action denied: ${evaluation.decision.reason || evaluation.decision.outcome}`
      );
    }

    const claim = await this.claim(evaluation.receiptId);
    if ((claim as any).already_executed) {
      return {
        result: (claim as any).receipt?.execution?.result as T,
        receiptId: evaluation.receiptId,
      };
    }
    if (!claim.claimId) {
      throw new Error('Unable to claim receipt for execution');
    }

    // Check sandbox mode
    const sandboxMode = isSandboxMode();
    const startTime = Date.now();

    try {
      let result: T;
      const mode = sandboxMode ? 'stub' : 'real';

      if (sandboxMode && options.toolName) {
        // Return stubbed result without executing
        const stubResult = getStubResult(
          options.toolName,
          evaluation.receiptId,
          options.parameters || {}
        );
        if (stubResult) {
          result = stubResult as T;
        } else {
          // Fallback to basic stub if no specific stub defined
          result = { _stub: true, _mode: 'stub', message: 'Stubbed execution' } as T;
        }
      } else {
        // Real execution - pass receiptId for idempotency
        result = await executor(evaluation.receiptId);
      }

      const durationMs = Date.now() - startTime;

      await this.updateReceipt(
        evaluation.receiptId,
        'executed',
        {
          durationMs,
          result: result as Record<string, unknown>,
          mode,
        },
        claim.claimId
      );

      return { result, receiptId: evaluation.receiptId };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorInfo =
        error instanceof Error
          ? {
              message: error.message,
              code: (error as any).code,
              retryAt: (error as any).retryAt,
              retryable: (error as any).retryable,
            }
          : { message: 'Unknown error' };

      await this.updateReceipt(
        evaluation.receiptId,
        'failed',
        {
          durationMs,
          error: errorInfo,
          mode: sandboxMode ? 'stub' : 'real',
        },
        claim.claimId
      );

      throw error;
    }
  }
}
