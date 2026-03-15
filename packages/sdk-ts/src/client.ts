/**
 * Authensor Client
 *
 * Main SDK client for integrating Authensor into TypeScript applications.
 */

import { createEnvelope } from './envelope.js';
import { TelemetryReporter } from './telemetry.js';
import type {
  ActionEnvelope,
  Decision,
  EvaluateResponse,
  ExecuteOptions,
  ExecuteResult,
} from './types.js';

export interface AuthensorConfig {
  /** URL of the Authensor Control Plane */
  controlPlaneUrl: string;
  /** API key for authentication (optional in development) */
  apiKey?: string;
  /** Principal ID for this client */
  principalId?: string;
  /** Principal type */
  principalType?: 'user' | 'agent' | 'service' | 'system';
  /** Principal name (optional, for display) */
  principalName?: string;
  /** Default environment */
  environment?: 'development' | 'staging' | 'production';
  /** Request timeout in ms */
  timeout?: number;
  /** Enable anonymous telemetry reporting (opt-in, default false) */
  telemetry?: boolean;
  /** Custom telemetry endpoint (defaults to central Authensor stats) */
  telemetryEndpoint?: string;
}

export class Authensor {
  private config: Required<
    Pick<AuthensorConfig, 'controlPlaneUrl' | 'principalId' | 'principalType'>
  > &
    AuthensorConfig;
  private reporter: TelemetryReporter | null = null;

  constructor(config: AuthensorConfig) {
    this.config = {
      principalId: 'anonymous',
      principalType: 'agent',
      timeout: 10000,
      ...config,
      controlPlaneUrl: config.controlPlaneUrl.replace(/\/$/, ''),
    };

    if (config.telemetry) {
      this.reporter = new TelemetryReporter(config.telemetryEndpoint);
      this.reporter.start();
    }
  }

  /**
   * Evaluate an action without executing it.
   * Use this to check if an action would be allowed before doing it.
   */
  async evaluate(
    actionType: string,
    resource: string,
    options: ExecuteOptions = {}
  ): Promise<{
    allowed: boolean;
    decision: Decision;
    receiptId: string;
    receiptUrl?: string;
    receiptLink?: string;
  }> {
    const envelope = this.createEnvelope(actionType, resource, options);
    const response = await this.sendEvaluate(envelope);

    // Anonymous telemetry (opt-in)
    if (this.reporter) {
      this.reporter.increment('actions_evaluated');
      this.reporter.increment('receipts_created');
      if (response.decision.outcome === 'deny') {
        this.reporter.increment('threats_detected');
      }
      if (response.decision.outcome === 'require_approval') {
        this.reporter.increment('approvals_requested');
      }
    }

    return {
      allowed: response.decision.outcome === 'allow',
      decision: response.decision,
      receiptId: response.receiptId,
      receiptUrl: response.receiptUrl,
      receiptLink: response.receiptLink,
    };
  }

  /**
   * Execute an action with policy enforcement.
   * The action is only executed if the policy allows it.
   *
   * @throws {AuthensorDeniedError} If the action is denied by policy
   */
  async execute<T>(
    actionType: string,
    resource: string,
    executor: () => Promise<T>,
    options: ExecuteOptions = {}
  ): Promise<ExecuteResult<T>> {
    const envelope = this.createEnvelope(actionType, resource, options);
    const evaluation = await this.sendEvaluate(envelope);

    if (evaluation.decision.outcome !== 'allow') {
      throw new AuthensorDeniedError(evaluation.decision);
    }

    const startTime = Date.now();
    try {
      const result = await executor();
      const durationMs = Date.now() - startTime;

      await this.updateReceipt(evaluation.receiptId, 'executed', {
        durationMs,
        result: result as Record<string, unknown>,
      });

      return {
        result,
        receiptId: evaluation.receiptId,
        decision: evaluation.decision,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const message = error instanceof Error ? error.message : 'Unknown error';

      await this.updateReceipt(evaluation.receiptId, 'failed', {
        durationMs,
        error: { message },
      });

      throw error;
    }
  }

  /**
   * Get a receipt by ID
   */
  async getReceipt(receiptId: string): Promise<unknown> {
    const response = await this.fetch(`/receipts/${receiptId}`);
    return response.json();
  }

  /**
   * List recent receipts
   */
  async listReceipts(options: {
    limit?: number;
    offset?: number;
    status?: string;
  } = {}): Promise<unknown> {
    const params = new URLSearchParams();
    if (options.limit) params.set('limit', String(options.limit));
    if (options.offset) params.set('offset', String(options.offset));
    if (options.status) params.set('status', options.status);

    const response = await this.fetch(`/receipts?${params}`);
    return response.json();
  }

  /**
   * Create an envelope for an action
   */
  private createEnvelope(
    actionType: string,
    resource: string,
    options: ExecuteOptions
  ): ActionEnvelope {
    return createEnvelope({
      actionType,
      resource,
      operation: options.operation,
      parameters: options.parameters,
      constraints: options.constraints,
      principal: {
        type: this.config.principalType,
        id: this.config.principalId,
        name: this.config.principalName,
      },
      context: {
        environment: this.config.environment,
        ...options.context,
      },
    });
  }

  /**
   * Send an envelope for evaluation
   */
  private async sendEvaluate(envelope: ActionEnvelope): Promise<EvaluateResponse> {
    const response = await this.fetch('/evaluate', {
      method: 'POST',
      body: JSON.stringify(envelope),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Evaluation failed: ${error}`);
    }

    return response.json() as Promise<EvaluateResponse>;
  }

  /**
   * Update a receipt after execution
   */
  private async updateReceipt(
    receiptId: string,
    status: 'executed' | 'failed',
    execution: {
      durationMs?: number;
      result?: Record<string, unknown>;
      error?: { message: string };
    }
  ): Promise<void> {
    try {
      await this.fetch(`/receipts/${receiptId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          execution: {
            completedAt: new Date().toISOString(),
            ...execution,
          },
        }),
      });
    } catch {
      // Don't fail the action if receipt update fails
      console.warn(`Failed to update receipt ${receiptId}`);
    }
  }

  /**
   * Make a fetch request to the control plane
   */
  private async fetch(path: string, options: RequestInit = {}): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    return fetch(`${this.config.controlPlaneUrl}${path}`, {
      ...options,
      headers,
    });
  }
}

/**
 * Error thrown when an action is denied by policy
 */
export class AuthensorDeniedError extends Error {
  public readonly decision: Decision;

  constructor(decision: Decision) {
    const reason = decision.reason || decision.outcome;
    super(`Action denied: ${reason}`);
    this.name = 'AuthensorDeniedError';
    this.decision = decision;
  }
}
