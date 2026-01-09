/**
 * Evaluate Route
 *
 * POST /evaluate - Evaluate an action envelope against policies
 * Requires: ingest | admin role
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { PolicyEngine, type Policy } from '@authensor/engine';
import { getActivePolicy } from '../services/policy-service.js';
import { createReceipt } from '../services/receipt-service.js';
import { requireRole } from '../auth/middleware.js';

export const evaluateRoute = new Hono();

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

    const orgIdHeader = c.req.header('x-authensor-org');
    const envHeader = c.req.header('x-authensor-env');
    const orgId =
      orgIdHeader && /^[A-Za-z0-9_\-]{1,64}$/.test(orgIdHeader) ? orgIdHeader : 'default';
    const environment =
      envHeader && /^[A-Za-z0-9_\-]{1,64}$/.test(envHeader) ? envHeader : 'dev';

    // Get active policy
    const activePolicy = await getActivePolicy(orgId, environment);
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

    // Create receipt
    const receipt = await createReceipt({
      envelopeId: envelope.id,
      decision: result.decision,
      envelope,
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
      decision: result.decision,
      policy: {
        id: policyToUse.id,
        version: policyToUse.version,
        source: activePolicy ? 'db' : 'fallback',
      },
      evaluationTimeMs: result.evaluationTimeMs,
    });
  }
);
