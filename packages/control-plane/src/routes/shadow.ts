/**
 * Shadow Policy Route
 *
 * GET /shadow/report - Divergence statistics between active and shadow policy evaluations
 * Requires: admin role
 */

import { Hono } from 'hono';
import { requireRole } from '../auth/middleware.js';
import { getShadowReport } from '../services/shadow-service.js';

export const shadowRoute = new Hono();

shadowRoute.use('*', requireRole(['admin']));

shadowRoute.get('/report', async (c) => {
  const shadowPolicyId = c.req.query('shadow_policy_id');
  const shadowPolicyVersion = c.req.query('shadow_policy_version');
  const since = c.req.query('since');
  const limitStr = c.req.query('limit');
  const limit = limitStr ? parseInt(limitStr, 10) : undefined;

  const report = await getShadowReport({
    shadowPolicyId: shadowPolicyId ?? undefined,
    shadowPolicyVersion: shadowPolicyVersion ?? undefined,
    since: since ?? undefined,
    limit,
  });

  return c.json(report);
});
