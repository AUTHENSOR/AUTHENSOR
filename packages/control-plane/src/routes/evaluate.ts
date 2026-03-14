/**
 * Evaluate Route
 *
 * POST /evaluate - Evaluate an action envelope against policies
 * Requires: ingest | admin role
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { PolicyEngine, createDecision, type Policy } from '@authensor/engine';
import { getActivePolicy, getPolicyById } from '../services/policy-service.js';
import { recordShadowEvaluation } from '../services/shadow-service.js';
import { createReceipt } from '../services/receipt-service.js';
import { requireRole } from '../auth/middleware.js';
import {
  startEvaluationSpan,
  endEvaluationSpan,
  buildEvalAttributes,
} from '../services/telemetry-service.js';

export const evaluateRoute = new Hono();

const POLICY_ALERT_MIN_INTERVAL_MS = 60_000;
let lastPolicyAlertAt = 0;

async function maybeSendPolicyMissingAlert(payload: {
  orgId: string;
  environment: string;
  receiptId: string;
  actionType?: string;
  principalId?: string;
}): Promise<void> {
  const url = process.env.AUTHENSOR_POLICY_ALERT_WEBHOOK_URL;
  if (!url) return;

  const now = Date.now();
  if (now - lastPolicyAlertAt < POLICY_ALERT_MIN_INTERVAL_MS) return;
  lastPolicyAlertAt = now;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const secret = process.env.AUTHENSOR_POLICY_ALERT_WEBHOOK_SECRET;
  if (secret) headers.Authorization = `Bearer ${secret}`;

  const body = JSON.stringify({
    event: 'policy_missing',
    timestamp: new Date().toISOString(),
    ...payload,
  });

  try {
    await fetch(url, { method: 'POST', headers, body });
  } catch {
    // best-effort alerting
  }
}

// Request schema (matches ActionEnvelope but more permissive for validation)
const evaluateRequestSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.string().datetime(),
  action: z.object({
    type: z.string(),
    resource: z.string(),
    operation: z.enum(['create', 'read', 'update', 'delete', 'execute']).optional(),
    parameters: z.record(z.unknown()).optional(),
  }),
  principal: z.object({
    type: z.enum(['user', 'agent', 'service', 'system']),
    id: z.string(),
    name: z.string().optional(),
    attributes: z.record(z.unknown()).optional(),
  }),
  context: z.object({
    sessionId: z.string().optional(),
    traceId: z.string().optional(),
    parentEnvelopeId: z.string().uuid().optional(),
    parentReceiptId: z.string().uuid().optional(),
    environment: z.enum(['development', 'staging', 'production']).optional(),
    sourceIp: z.string().optional(),
    userAgent: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),
  }),
  constraints: z
    .object({
      maxAmount: z.number().optional(),
      currency: z.string().optional(),
      allowedDomains: z.array(z.string()).optional(),
      timeout: z.number().optional(),
      retryPolicy: z
        .object({
          maxRetries: z.number().int().nonnegative().optional(),
          backoffMs: z.number().int().nonnegative().optional(),
        })
        .optional(),
    })
    .optional(),
});

evaluateRoute.post(
  '/',
  requireRole(['ingest', 'admin']),
  zValidator('json', evaluateRequestSchema),
  async (c) => {
    const envelope = c.req.valid('json');
    const auth = c.get('auth');

    // Principal binding verification
    // Admin keys are exempt — they may specify any principal
    if (auth.role !== 'admin') {
      if (auth.principalId) {
        // Key has a bound principal — envelope must match
        if (envelope.principal.id !== auth.principalId) {
          return c.json(
            {
              error: {
                code: 'PRINCIPAL_MISMATCH',
                message: 'Principal ID does not match authenticated key',
              },
            },
            403
          );
        }
      } else if (process.env.AUTHENSOR_STRICT_PRINCIPAL_BINDING === 'true') {
        // Strict mode: all non-admin keys must have a principal binding
        return c.json(
          {
            error: {
              code: 'PRINCIPAL_BINDING_REQUIRED',
              message: 'Strict mode requires all keys to have a principal binding',
            },
          },
          403
        );
      }
    }

    // Start OTel span (no-ops if disabled or unavailable)
    const span = await startEvaluationSpan();
    const evalStart = performance.now();

    const orgIdHeader = c.req.header('x-authensor-org');
    const envHeader = c.req.header('x-authensor-env');
    const orgId =
      orgIdHeader && /^[A-Za-z0-9_\-]{1,64}$/.test(orgIdHeader) ? orgIdHeader : 'default';
    const environment =
      envHeader && /^[A-Za-z0-9_\-]{1,64}$/.test(envHeader) ? envHeader : 'dev';

    // Get active policy
    const activePolicy = await getActivePolicy(orgId, environment);
    const allowFallback = process.env.AUTHENSOR_ALLOW_FALLBACK_POLICY === 'true';

    if (!activePolicy && !allowFallback) {
      const decision = createDecision('deny', {
        policyId: 'none',
        policyVersion: 'none',
        reason: 'NO_POLICY_CONFIGURED',
      });

      const receipt = await createReceipt({
        envelopeId: envelope.id,
        decision,
        envelope,
      });

      await maybeSendPolicyMissingAlert({
        orgId,
        environment,
        receiptId: receipt.id,
        actionType: envelope.action?.type,
        principalId: envelope.principal?.id,
      });

      const baseUrl = (() => {
        try {
          const url = new URL(c.req.url);
          if (url.protocol && url.host) return `${url.protocol}//${url.host}`;
        } catch {
          // ignore
        }
        const host = c.req.header('host');
        if (host) {
          const proto = c.req.header('x-forwarded-proto') || 'http';
          return `${proto}://${host}`;
        }
        return '';
      })();

      const receiptViewPath = `/receipts/${receipt.id}/view`;
      const receiptApiPath = `/receipts/${receipt.id}`;

      return c.json({
        receiptId: receipt.id,
        receiptUrl: receiptViewPath,
        receiptApiUrl: receiptApiPath,
        receiptLink: baseUrl ? `${baseUrl}${receiptViewPath}` : undefined,
        receiptApiLink: baseUrl ? `${baseUrl}${receiptApiPath}` : undefined,
        decision,
        policy: {
          id: 'none',
          version: 'none',
          source: 'none',
        },
        evaluationTimeMs: 0,
      });
    }

    const fallbackPolicy: Policy = {
      id: 'allow-all',
      name: 'Default Allow-All',
      version: '0.0.0',
      rules: [{ id: 'allow-all', effect: 'allow' as const, description: 'Fallback allow-all policy' }],
      defaultEffect: 'allow',
    };

    const policyToUse = activePolicy ?? fallbackPolicy;
    if (!activePolicy) {
      console.warn('[evaluate] No active policy configured; using fallback allow-all');
    }

    // Evaluate
    const engine = new PolicyEngine();
    const result = engine.evaluate(envelope, [policyToUse]);

    // Create receipt (pass approvalConfig from matched rule for multi-party approval)
    const receipt = await createReceipt({
      envelopeId: envelope.id,
      decision: result.decision,
      envelope,
      approvalConfig: result.matchedRule?.approvalConfig,
    });

    // Finish OTel span with evaluation attributes
    const durationMs = performance.now() - evalStart;
    const attrs = buildEvalAttributes(envelope, result, receipt.id);
    endEvaluationSpan(span, attrs, durationMs);

    // Shadow/canary evaluation (non-blocking, never affects active decision)
    let shadowResult: {
      decision: string;
      policyId: string;
      policyVersion: string;
      matchedRule?: string;
      reason?: string;
    } | undefined;

    const shadowPolicyParam = c.req.query('shadow') ?? process.env.AUTHENSOR_SHADOW_POLICY_ID;
    if (shadowPolicyParam) {
      try {
        // Parse optional version: "policyId@version"
        const [shadowPolicyId, shadowVersion] = shadowPolicyParam.includes('@')
          ? shadowPolicyParam.split('@', 2)
          : [shadowPolicyParam, undefined];

        const shadowPolicy = await getPolicyById(orgId, environment, shadowPolicyId, shadowVersion);

        if (shadowPolicy) {
          const shadowEngine = new PolicyEngine();
          const shadowEval = shadowEngine.evaluate(envelope, [shadowPolicy]);

          shadowResult = {
            decision: shadowEval.decision.outcome,
            policyId: shadowPolicy.id,
            policyVersion: shadowPolicy.version,
            matchedRule: shadowEval.matchedRule?.id,
            reason: shadowEval.decision.reason,
          };

          // Record shadow evaluation (fire-and-forget)
          recordShadowEvaluation({
            receiptId: receipt.id,
            activePolicyId: policyToUse.id,
            activePolicyVersion: policyToUse.version,
            activeDecision: result.decision.outcome,
            activeMatchedRule: result.matchedRule?.id,
            activeReason: result.decision.reason,
            shadowPolicyId: shadowPolicy.id,
            shadowPolicyVersion: shadowPolicy.version,
            shadowDecision: shadowEval.decision.outcome,
            shadowMatchedRule: shadowEval.matchedRule?.id,
            shadowReason: shadowEval.decision.reason,
          }).catch(() => {});
        }
      } catch {
        // Shadow evaluation failures never affect the active decision
      }
    }

    const baseUrl = (() => {
      try {
        const url = new URL(c.req.url);
        if (url.protocol && url.host) return `${url.protocol}//${url.host}`;
      } catch {
        // ignore
      }
      const host = c.req.header('host');
      if (host) {
        const proto = c.req.header('x-forwarded-proto') || 'http';
        return `${proto}://${host}`;
      }
      return '';
    })();

    const receiptViewPath = `/receipts/${receipt.id}/view`;
    const receiptApiPath = `/receipts/${receipt.id}`;

    return c.json({
      receiptId: receipt.id,
      receiptUrl: receiptViewPath,
      receiptApiUrl: receiptApiPath,
      receiptLink: baseUrl ? `${baseUrl}${receiptViewPath}` : undefined,
      receiptApiLink: baseUrl ? `${baseUrl}${receiptApiPath}` : undefined,
      decision: result.decision,
      policy: {
        id: policyToUse.id,
        version: policyToUse.version,
        source: activePolicy ? 'db' : 'fallback',
      },
      evaluationTimeMs: result.evaluationTimeMs,
      ...(shadowResult ? { shadowResult } : {}),
    });
  }
);
