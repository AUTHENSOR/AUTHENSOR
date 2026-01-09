/**
 * Controls Routes
 *
 * Endpoints for managing execution controls (kill switch, tool disables).
 * GET: executor|admin
 * POST: admin only
 */

import { Hono } from 'hono';
import { requireRole } from '../auth/middleware.js';
import { getControls, updateControls, checkToolExecution } from '../services/controls-service.js';

export const controlsRoute = new Hono();

/**
 * GET /controls - Get current controls state
 * Accessible by executor and admin roles
 */
controlsRoute.get('/', requireRole(['executor', 'admin']), async (c) => {
  const controls = await getControls();
  return c.json(controls);
});

/**
 * POST /controls - Update controls
 * Admin only
 *
 * Request body (partial):
 * {
 *   disableExecution?: boolean,
 *   disableHttp?: boolean,
 *   disableGithub?: boolean,
 *   disableStripe?: boolean
 * }
 */
controlsRoute.post('/', requireRole(['admin']), async (c) => {
  const body = await c.req.json<{
    disableExecution?: boolean;
    disable_execution?: boolean;
    disableHttp?: boolean;
    disable_http?: boolean;
    disableGithub?: boolean;
    disable_github?: boolean;
    disableStripe?: boolean;
    disable_stripe?: boolean;
  }>();

  // Accept both camelCase and snake_case
  const updates: {
    disableExecution?: boolean;
    disableHttp?: boolean;
    disableGithub?: boolean;
    disableStripe?: boolean;
  } = {};

  if (body.disableExecution !== undefined || body.disable_execution !== undefined) {
    updates.disableExecution = body.disableExecution ?? body.disable_execution;
  }
  if (body.disableHttp !== undefined || body.disable_http !== undefined) {
    updates.disableHttp = body.disableHttp ?? body.disable_http;
  }
  if (body.disableGithub !== undefined || body.disable_github !== undefined) {
    updates.disableGithub = body.disableGithub ?? body.disable_github;
  }
  if (body.disableStripe !== undefined || body.disable_stripe !== undefined) {
    updates.disableStripe = body.disableStripe ?? body.disable_stripe;
  }

  const controls = await updateControls(updates);
  return c.json(controls);
});

/**
 * GET /controls/check - Check if a tool is allowed to execute
 * Accessible by executor and admin roles
 * Used by MCP server for defense-in-depth controls enforcement
 *
 * Query params:
 *   tool: string - Tool name (http, github, stripe)
 *
 * Response:
 * {
 *   allowed: boolean,
 *   code?: string,    // EXECUTION_DISABLED | TOOL_DISABLED (if not allowed)
 *   message?: string  // Human-readable message (if not allowed)
 * }
 */
controlsRoute.get('/check', requireRole(['executor', 'admin']), async (c) => {
  const toolName = c.req.query('tool');

  if (!toolName) {
    return c.json({ error: { code: 'INVALID_REQUEST', message: 'Missing tool parameter' } }, 400);
  }

  const result = await checkToolExecution(toolName);

  if (!result.allowed) {
    return c.json({
      allowed: false,
      code: result.code,
      message: result.message,
    });
  }

  return c.json({ allowed: true });
});
