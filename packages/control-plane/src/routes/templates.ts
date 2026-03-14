/**
 * Templates Route
 *
 * Public discovery endpoints for policy templates (GET).
 * Protected endpoint to apply a template (POST, requires admin).
 */

import { Hono } from 'hono';
import { listTemplates, getTemplate } from '../services/policy-templates.js';
import { createPolicy, setActivePolicy } from '../services/policy-service.js';
import { requireRole } from '../auth/middleware.js';

export const templatesRoute = new Hono();

/**
 * GET /templates
 *
 * List all available policy templates.
 * Returns lightweight metadata: id, name, description.
 * No auth required — this is a public discovery endpoint.
 */
templatesRoute.get('/', (c) => {
  const templates = listTemplates();
  return c.json({ templates });
});

/**
 * GET /templates/:id
 *
 * Get the full policy JSON for a specific template.
 * No auth required — templates are reference material.
 */
templatesRoute.get('/:id', (c) => {
  const id = c.req.param('id');
  const template = getTemplate(id);

  if (!template) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: `Template '${id}' not found` } },
      404
    );
  }

  return c.json({ template });
});

/**
 * POST /templates/:id/apply
 *
 * Apply a template: creates the policy in the caller's org/environment
 * and activates it. Requires admin role.
 *
 * Headers:
 *   x-authensor-org  — org id (defaults to 'default')
 *   x-authensor-env  — environment (defaults to 'dev')
 */
templatesRoute.post('/:id/apply', requireRole(['admin']), async (c) => {
  const id = c.req.param('id');
  const template = getTemplate(id);

  if (!template) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: `Template '${id}' not found` } },
      404
    );
  }

  // Extract org/env context from headers (same pattern as policies route)
  const orgId = sanitizeHeader(c.req.header('x-authensor-org'), 'default');
  const environment = sanitizeHeader(c.req.header('x-authensor-env'), 'dev');

  try {
    // Create the policy from the template
    await createPolicy(orgId, environment, template);

    // Activate it
    await setActivePolicy(orgId, environment, template.id, template.version);

    return c.json(
      {
        ok: true,
        applied: {
          templateId: id,
          policyId: template.id,
          version: template.version,
          orgId,
          environment,
        },
      },
      201
    );
  } catch (error) {
    return c.json(
      { error: { code: 'APPLY_FAILED', message: (error as Error).message } },
      400
    );
  }
});

/**
 * Sanitize a header value to prevent injection.
 * Matches the pattern used in policies.ts.
 */
function sanitizeHeader(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const trimmed = value.trim().slice(0, 64);
  if (!/^[A-Za-z0-9_\-]+$/.test(trimmed)) {
    return fallback;
  }
  return trimmed;
}
