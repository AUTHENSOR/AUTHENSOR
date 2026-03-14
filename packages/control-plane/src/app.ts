/**
 * Hono Application
 *
 * Defines the HTTP routes for the control plane API.
 * Includes authentication, authorization, and rate limiting.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { evaluateRoute } from './routes/evaluate.js';
import { receiptsRoute } from './routes/receipts.js';
import { policiesRoute } from './routes/policies.js';
import { healthRoute } from './routes/health.js';
import { templatesRoute } from './routes/templates.js';
import { DEFAULT_SAFE_POLICY } from './services/default-policies.js';
import { approvalsRoute } from './routes/approvals.js';
import { claimsRoute } from './routes/claims.js';
import { metricsRoute } from './routes/metrics.js';
import { keysRoute } from './routes/keys.js';
import { controlsRoute } from './routes/controls.js';
import { dashboardRoute } from './routes/dashboard.js';
import { authMiddleware } from './auth/middleware.js';
import { rateLimitMiddleware } from './middleware/rate_limit.js';
import { bodyLimitMiddleware } from './middleware/body_limit.js';

export function createApp() {
  const app = new Hono();

  // Logging and CORS (applied first, before auth)
  app.use('*', logger());
  app.use('*', cors());

  // Body size limit (before parsing body)
  app.use('*', bodyLimitMiddleware);

  // Health check is public (before auth middleware)
  app.route('/health', healthRoute);

  // Public endpoint: default-safe policy template (before auth middleware)
  app.get('/policies/default', (c) => {
    return c.json({ policy: DEFAULT_SAFE_POLICY });
  });

  // Policy templates: GET endpoints are public discovery, POST /apply requires admin
  app.route('/templates', templatesRoute);

  // Authentication middleware (applied to all protected routes)
  app.use('*', authMiddleware);

  // Rate limiting (after auth, so we have auth context)
  app.use('*', rateLimitMiddleware);

  // API routes with role-based access control
  // Role requirements are enforced within each route handler

  // Evaluate: ingest | admin
  app.route('/evaluate', evaluateRoute);

  // Receipts: various roles depending on endpoint
  // - GET list/detail/view: admin
  // - POST claim: executor | admin
  // - PATCH finalize: executor | admin
  app.route('/receipts', receiptsRoute);
  app.route('/receipts', claimsRoute);

  // Policies: admin only
  app.route('/policies', policiesRoute);

  // Approvals: admin only
  app.route('/approvals', approvalsRoute);

  // Metrics: admin only
  app.route('/metrics', metricsRoute);

  // Keys: admin only
  app.route('/keys', keysRoute);

  // Controls: GET (executor | admin), POST (admin)
  app.route('/controls', controlsRoute);

  // Dashboard: admin only (HTMX-powered admin UI)
  app.route('/dashboard', dashboardRoute);

  // Whoami: any authenticated key - debug endpoint for auth issues
  app.get('/whoami', (c) => {
    const auth = c.get('auth');
    return c.json({
      keyId: auth.keyId,
      role: auth.role,
      name: auth.name,
    });
  });

  // Root route (public)
  app.get('/', (c) => {
    return c.json({
      name: 'Authensor Control Plane',
      version: '0.0.1',
      docs: '/docs',
    });
  });

  return app;
}
