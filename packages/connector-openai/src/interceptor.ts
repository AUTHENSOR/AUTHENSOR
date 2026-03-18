/**
 * Proxy interceptor for the OpenAI client.
 *
 * Wraps the `chat.completions.create()` method so every call passes
 * through Authensor policy evaluation before reaching the OpenAI API,
 * and runs Aegis content scanning on every response.
 */

import { PolicyEngine } from '@authensor/engine';
import type { Policy, ActionEnvelope, EvaluationResult } from '@authensor/engine';

// ── Types ───────────────────────────────────────────────────────────────

export interface InterceptorConfig {
  /** Parsed policy objects to evaluate against */
  policies: Policy[];
  /** Principal ID for envelope creation (default: 'openai-connector') */
  principalId: string;
  /** Whether Aegis response scanning is enabled */
  aegisEnabled: boolean;
  /** Called after each policy evaluation with the result */
  onEvaluation?: (result: EvaluationResult, envelope: ActionEnvelope) => void;
  /** Called when Aegis flags a response */
  onAegisThreat?: (scanResult: AegisScanSummary) => void;
}

export interface AegisScanSummary {
  safe: boolean;
  threatLevel: string;
  detectionCount: number;
  redacted?: string;
}

// ── Engine singleton ────────────────────────────────────────────────────

const engine = new PolicyEngine();

// ── Helpers ─────────────────────────────────────────────────────────────

function extractTextFromMessages(messages: unknown[]): string {
  const parts: string[] = [];
  for (const msg of messages) {
    if (typeof msg !== 'object' || msg === null) continue;
    const m = msg as Record<string, unknown>;
    if (typeof m.content === 'string') {
      parts.push(m.content);
    } else if (Array.isArray(m.content)) {
      for (const block of m.content) {
        if (typeof block === 'object' && block !== null) {
          const b = block as Record<string, unknown>;
          if (b.type === 'text' && typeof b.text === 'string') {
            parts.push(b.text);
          }
        }
      }
    }
  }
  return parts.join('\n');
}

function extractTextFromResponse(response: Record<string, unknown>): string {
  const parts: string[] = [];
  const choices = response.choices;
  if (Array.isArray(choices)) {
    for (const choice of choices) {
      if (typeof choice !== 'object' || choice === null) continue;
      const c = choice as Record<string, unknown>;
      const message = c.message;
      if (typeof message === 'object' && message !== null) {
        const m = message as Record<string, unknown>;
        if (typeof m.content === 'string') {
          parts.push(m.content);
        }
      }
    }
  }
  return parts.join('\n');
}

function buildEnvelope(params: Record<string, unknown>, principalId: string): ActionEnvelope {
  const messages = Array.isArray(params.messages) ? params.messages : [];
  const messageText = extractTextFromMessages(messages);

  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    action: {
      type: 'chat.completions.create',
      resource: `openai://chat/completions`,
      operation: 'create',
      parameters: {
        model: params.model,
        max_tokens: params.max_tokens,
        content: messageText,
      },
    },
    principal: {
      type: 'agent',
      id: principalId,
    },
    context: {
      environment: (process.env.NODE_ENV as 'development' | 'staging' | 'production') ?? 'development',
    },
  };
}

// ── Lazy Aegis loader ───────────────────────────────────────────────────

let aegisScannerInstance: { scanOutput(content: string): { safe: boolean; threatLevel: string; detections: unknown[]; redacted?: string } } | null = null;
let aegisLoadAttempted = false;

async function getAegisScanner(): Promise<typeof aegisScannerInstance> {
  if (aegisLoadAttempted) return aegisScannerInstance;
  aegisLoadAttempted = true;
  try {
    const aegis = await import('@authensor/aegis');
    aegisScannerInstance = new aegis.AegisScanner();
  } catch {
    // Aegis is optional
  }
  return aegisScannerInstance;
}

// ── Interceptor ─────────────────────────────────────────────────────────

/**
 * Create a proxy around the OpenAI `completions` namespace that
 * intercepts `create()` calls.
 */
export function interceptCompletions(
  completionsObj: Record<string, unknown>,
  config: InterceptorConfig,
): Record<string, unknown> {
  return new Proxy(completionsObj, {
    get(target, prop, receiver) {
      if (prop === 'create') {
        return async function interceptedCreate(
          params: Record<string, unknown>,
          options?: unknown,
        ): Promise<unknown> {
          // 1. Build envelope from the request
          const envelope = buildEnvelope(params, config.principalId);

          // 2. Evaluate against policies
          const result = engine.evaluate(envelope, config.policies);
          config.onEvaluation?.(result, envelope);

          // 3. Deny / escalate
          if (result.decision.outcome === 'deny') {
            throw new AuthensorDeniedError(
              result.decision.reason ?? 'Action denied by policy',
              result,
            );
          }

          if (result.decision.outcome === 'require_approval') {
            throw new AuthensorEscalationError(
              result.decision.reason ?? 'Action requires approval',
              result,
            );
          }

          // 4. Forward to the real OpenAI API
          const originalCreate = Reflect.get(target, 'create', receiver) as (
            params: Record<string, unknown>,
            options?: unknown,
          ) => Promise<unknown>;
          const response = await originalCreate.call(target, params, options);

          // 5. Aegis scan on response (if enabled)
          if (config.aegisEnabled) {
            const scanner = await getAegisScanner();
            if (scanner) {
              const responseText = extractTextFromResponse(response as Record<string, unknown>);
              if (responseText.length > 0) {
                const scanResult = scanner.scanOutput(responseText);
                if (!scanResult.safe) {
                  const summary: AegisScanSummary = {
                    safe: false,
                    threatLevel: scanResult.threatLevel,
                    detectionCount: scanResult.detections.length,
                    redacted: scanResult.redacted,
                  };
                  config.onAegisThreat?.(summary);
                  throw new AuthensorContentThreatError(
                    `Response flagged by Aegis: ${scanResult.threatLevel} threat level (${scanResult.detections.length} detection(s))`,
                    summary,
                  );
                }
              }
            }
          }

          return response;
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

/**
 * Create a proxy around the `chat` namespace that intercepts
 * access to `chat.completions`.
 */
export function interceptChat(
  chatObj: Record<string, unknown>,
  config: InterceptorConfig,
): Record<string, unknown> {
  return new Proxy(chatObj, {
    get(target, prop, receiver) {
      if (prop === 'completions') {
        const completionsObj = Reflect.get(target, prop, receiver) as Record<string, unknown>;
        return interceptCompletions(completionsObj, config);
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

/**
 * Create a proxy around the top-level OpenAI client that intercepts
 * access to `client.chat`.
 */
export function interceptClient(
  client: Record<string, unknown>,
  config: InterceptorConfig,
): Record<string, unknown> {
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === 'chat') {
        const chatObj = Reflect.get(target, prop, receiver) as Record<string, unknown>;
        return interceptChat(chatObj, config);
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

// ── Error classes ───────────────────────────────────────────────────────

export class AuthensorDeniedError extends Error {
  public readonly evaluationResult: EvaluationResult;

  constructor(message: string, result: EvaluationResult) {
    super(message);
    this.name = 'AuthensorDeniedError';
    this.evaluationResult = result;
  }
}

export class AuthensorEscalationError extends Error {
  public readonly evaluationResult: EvaluationResult;

  constructor(message: string, result: EvaluationResult) {
    super(message);
    this.name = 'AuthensorEscalationError';
    this.evaluationResult = result;
  }
}

export class AuthensorContentThreatError extends Error {
  public readonly scanSummary: AegisScanSummary;

  constructor(message: string, summary: AegisScanSummary) {
    super(message);
    this.name = 'AuthensorContentThreatError';
    this.scanSummary = summary;
  }
}
