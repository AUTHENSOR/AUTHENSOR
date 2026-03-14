/**
 * Telemetry Service
 *
 * Optional OpenTelemetry integration for the Authensor control plane.
 * Lazy-loads @opentelemetry/api as an optional dependency.
 * Controlled by the AUTHENSOR_OTEL_ENABLED environment variable.
 *
 * If @opentelemetry/api is not installed or AUTHENSOR_OTEL_ENABLED is not "true",
 * all operations gracefully no-op.
 */

import type { EvaluationResult, ActionEnvelope } from '@authensor/engine';

// Types mirroring the @opentelemetry/api surface we use.
// Defined locally so the module compiles even when the SDK is absent.
interface OtelSpan {
  setAttribute(key: string, value: string | number | boolean): this;
  setStatus(status: { code: number; message?: string }): this;
  end(): void;
  recordException(error: unknown): void;
}

interface OtelTracer {
  startSpan(name: string): OtelSpan;
}

interface OtelCounter {
  add(value: number, attributes?: Record<string, string>): void;
}

interface OtelHistogram {
  record(value: number, attributes?: Record<string, string>): void;
}

interface OtelGauge {
  record(value: number, attributes?: Record<string, string>): void;
}

interface OtelMeter {
  createCounter(name: string, options?: { description?: string }): OtelCounter;
  createHistogram(name: string, options?: { description?: string; unit?: string }): OtelHistogram;
  createObservableGauge(
    name: string,
    options?: { description?: string }
  ): OtelGauge;
}

interface OtelApi {
  trace: {
    getTracer(name: string, version?: string): OtelTracer;
  };
  metrics: {
    getMeter(name: string, version?: string): OtelMeter;
  };
  SpanStatusCode: {
    OK: number;
    ERROR: number;
  };
}

// Module-level singletons, initialised lazily.
let otel: OtelApi | null = null;
let tracer: OtelTracer | null = null;
let evaluationsCounter: OtelCounter | null = null;
let evaluationDurationHistogram: OtelHistogram | null = null;
let budgetUtilizationGauge: OtelGauge | null = null;
let initialised = false;

const INSTRUMENTATION_NAME = '@authensor/control-plane';
const INSTRUMENTATION_VERSION = '0.0.1';

/**
 * Attempt to load @opentelemetry/api. Returns true if successful.
 * Called once; subsequent calls are no-ops.
 */
async function ensureInitialised(): Promise<boolean> {
  if (initialised) return otel !== null;
  initialised = true;

  if (process.env.AUTHENSOR_OTEL_ENABLED !== 'true') {
    return false;
  }

  try {
    const api = (await import('@opentelemetry/api')) as unknown as OtelApi;
    otel = api;
    tracer = api.trace.getTracer(INSTRUMENTATION_NAME, INSTRUMENTATION_VERSION);

    const meter = api.metrics.getMeter(INSTRUMENTATION_NAME, INSTRUMENTATION_VERSION);
    evaluationsCounter = meter.createCounter('authensor.evaluations.total', {
      description: 'Total number of policy evaluations',
    });
    evaluationDurationHistogram = meter.createHistogram('authensor.evaluation.duration_ms', {
      description: 'Policy evaluation duration in milliseconds',
      unit: 'ms',
    });
    budgetUtilizationGauge = meter.createObservableGauge('authensor.budget.utilization', {
      description: 'Budget utilization by principal',
    });

    return true;
  } catch {
    // @opentelemetry/api not installed — degrade silently
    return false;
  }
}

/** Attributes attached to an evaluation span. */
export interface TelemetryEvalAttributes {
  policyId?: string;
  policyVersion?: string;
  outcome: string;
  principalId: string;
  principalType: string;
  actionType: string;
  actionResource: string;
  receiptId: string;
  budgetUtilization?: number;
  aegisFlagged?: boolean;
  sessionActionCount?: number;
}

/**
 * Start an evaluation span. Returns an opaque handle that the caller passes
 * to `endEvaluationSpan` when the evaluation is complete.
 *
 * If OTel is disabled or unavailable the returned handle is null and
 * `endEvaluationSpan` becomes a no-op.
 */
export async function startEvaluationSpan(): Promise<OtelSpan | null> {
  const ready = await ensureInitialised();
  if (!ready || !tracer) return null;
  return tracer.startSpan('authensor.evaluate');
}

/**
 * Finalise an evaluation span by recording attributes, metrics and ending
 * the span.
 */
export function endEvaluationSpan(
  span: OtelSpan | null,
  attrs: TelemetryEvalAttributes,
  durationMs: number,
  error?: unknown
): void {
  if (!span) return;

  // Span attributes
  if (attrs.policyId) span.setAttribute('authensor.policy.id', attrs.policyId);
  if (attrs.policyVersion) span.setAttribute('authensor.policy.version', attrs.policyVersion);
  span.setAttribute('authensor.decision.outcome', attrs.outcome);
  span.setAttribute('authensor.principal.id', attrs.principalId);
  span.setAttribute('authensor.principal.type', attrs.principalType);
  span.setAttribute('authensor.action.type', attrs.actionType);
  span.setAttribute('authensor.action.resource', attrs.actionResource);
  span.setAttribute('authensor.receipt.id', attrs.receiptId);

  if (attrs.budgetUtilization !== undefined) {
    span.setAttribute('authensor.budget.utilization', attrs.budgetUtilization);
  }
  if (attrs.aegisFlagged !== undefined) {
    span.setAttribute('authensor.aegis.flagged', attrs.aegisFlagged);
  }
  if (attrs.sessionActionCount !== undefined) {
    span.setAttribute('authensor.session.action_count', attrs.sessionActionCount);
  }

  // Metrics
  const outcomeLabel = { outcome: attrs.outcome };
  evaluationsCounter?.add(1, outcomeLabel);
  evaluationDurationHistogram?.record(durationMs, outcomeLabel);

  if (attrs.budgetUtilization !== undefined) {
    budgetUtilizationGauge?.record(attrs.budgetUtilization, {
      principal: attrs.principalId,
    });
  }

  // Span status
  if (error) {
    span.recordException(error);
    span.setStatus({ code: otel?.SpanStatusCode.ERROR ?? 2, message: String(error) });
  } else {
    span.setStatus({ code: otel?.SpanStatusCode.OK ?? 1 });
  }

  span.end();
}

/**
 * Build TelemetryEvalAttributes from the evaluation inputs and outputs.
 * Convenience helper so the route does not need to know the attribute keys.
 */
export function buildEvalAttributes(
  envelope: ActionEnvelope,
  result: EvaluationResult,
  receiptId: string
): TelemetryEvalAttributes {
  return {
    policyId: result.decision.policyId,
    policyVersion: result.decision.policyVersion,
    outcome: result.decision.outcome,
    principalId: envelope.principal.id,
    principalType: envelope.principal.type,
    actionType: envelope.action.type,
    actionResource: envelope.action.resource,
    receiptId,
  };
}

/**
 * Reset internal state. Exported for testing only.
 */
export function _resetTelemetry(): void {
  otel = null;
  tracer = null;
  evaluationsCounter = null;
  evaluationDurationHistogram = null;
  budgetUtilizationGauge = null;
  initialised = false;
}
