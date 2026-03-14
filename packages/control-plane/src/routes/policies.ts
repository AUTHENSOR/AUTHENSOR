/**
 * Policies Route
 *
 * Minimal REST for policy CRUD + active pointer.
 * All endpoints require admin role.
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  createPolicy,
  getActivePolicy,
  listPolicies,
  setActivePolicy,
} from '../services/policy-service.js';
import { requireRole } from '../auth/middleware.js';

export const policiesRoute = new Hono();

// Apply admin role requirement to all routes
policiesRoute.use('*', requireRole(['admin']));

const policyRuleSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  effect: z.enum(['allow', 'deny', 'require_approval']),
  condition: z.record(z.unknown()).optional(),
  rateLimit: z
    .object({
      requests: z.number(),
      window: z.string(),
      scope: z.enum(['principal', 'action', 'global']).optional(),
    })
    .optional(),
  approvalConfig: z
    .object({
      approvers: z
        .array(z.object({ type: z.string().optional(), id: z.string().optional() }))
        .optional(),
      expiresIn: z.string().optional(),
      requiredApprovals: z.number().int().min(1).optional(),
    })
    .optional(),
});

const policySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  version: z.string(),
  enabled: z.boolean().optional(),
  priority: z.number().optional(),
  scope: z
    .object({
      actionTypes: z.array(z.string()).optional(),
      principalTypes: z.array(z.enum(['user', 'agent', 'service', 'system'])).optional(),
      environments: z.array(z.enum(['development', 'staging', 'production'])).optional(),
    })
    .optional(),
  rules: z.array(policyRuleSchema),
  defaultEffect: z.enum(['allow', 'deny']).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const activePolicySchema = z.object({
  policy_id: z.string(),
  version: z.string(),
});

function sanitizeHeader(value: string | undefined, fallback: string) {
  if (!value) return fallback;
  const trimmed = value.trim().slice(0, 64);
  if (!/^[A-Za-z0-9_\-]+$/.test(trimmed)) {
    return fallback;
  }
  return trimmed;
}

function extractContext(c: any) {
  const orgId = sanitizeHeader(c.req.header('x-authensor-org'), 'default');
  const environment = sanitizeHeader(c.req.header('x-authensor-env'), 'dev');
  return { orgId, environment };
}

policiesRoute.get('/', async (c) => {
  const { orgId, environment } = extractContext(c);
  const policies = await listPolicies(orgId, environment);
  const active = await getActivePolicy(orgId, environment);
  return c.json({ policies, active });
});

policiesRoute.get('/active', async (c) => {
  const { orgId, environment } = extractContext(c);
  const active = await getActivePolicy(orgId, environment);
  if (!active) {
    return c.json({ error: 'No active policy' }, 404);
  }
  return c.json({ policy: active });
});

policiesRoute.post(
  '/',
  zValidator('json', policySchema),
  async (c) => {
    const { orgId, environment } = extractContext(c);
    const policy = c.req.valid('json');
    try {
      await createPolicy(orgId, environment, policy);
      return c.json({ ok: true }, 201);
    } catch (error) {
      return c.json({ error: (error as Error).message }, 400);
    }
  }
);

policiesRoute.post(
  '/active',
  zValidator('json', activePolicySchema),
  async (c) => {
    const { orgId, environment } = extractContext(c);
    const body = c.req.valid('json');
    await setActivePolicy(orgId, environment, body.policy_id, body.version);
    return c.json({ ok: true });
  }
);
