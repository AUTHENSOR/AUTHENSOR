/**
 * Sentinel Routes — Monitoring and alerting endpoints.
 *
 * GET  /sentinel/status  — Monitoring status (admin)
 * GET  /sentinel/agents  — Per-agent stats (admin)
 * GET  /sentinel/alerts  — Active/recent alerts (admin)
 * POST /sentinel/alerts/:id/ack — Acknowledge alert (admin)
 * GET  /sentinel/rules   — Alert rules (admin)
 */

import { Hono } from 'hono';
import { requireRole } from '../auth/middleware.js';
import {
  getSentinelStatus,
  getAgentStats,
  getAlerts,
  acknowledgeAlert,
  getAlertRules,
} from '../services/sentinel-service.js';

export const sentinelRoute = new Hono();

// GET /sentinel/status
sentinelRoute.get('/status', requireRole(['admin']), async (c) => {
  const status = await getSentinelStatus();
  return c.json(status);
});

// GET /sentinel/agents — all agents or specific agent
sentinelRoute.get('/agents', requireRole(['admin']), async (c) => {
  const agentId = c.req.query('agentId');
  if (agentId) {
    const stats = await getAgentStats(agentId);
    if (!stats) return c.json({ error: 'AGENT_NOT_FOUND' }, 404);
    return c.json(stats);
  }
  const allStats = await getAgentStats();
  return c.json({ agents: allStats, count: Array.isArray(allStats) ? allStats.length : 0 });
});

// GET /sentinel/agents/:id
sentinelRoute.get('/agents/:id', requireRole(['admin']), async (c) => {
  const agentId = c.req.param('id');
  const stats = await getAgentStats(agentId);
  if (!stats) return c.json({ error: 'AGENT_NOT_FOUND' }, 404);
  return c.json(stats);
});

// GET /sentinel/alerts
sentinelRoute.get('/alerts', requireRole(['admin']), async (c) => {
  const status = c.req.query('status');
  const severity = c.req.query('severity');
  const agentId = c.req.query('agentId');
  const limit = parseInt(c.req.query('limit') || '50');

  const alerts = await getAlerts({
    status: status || undefined,
    severity: severity || undefined,
    agentId: agentId || undefined,
    limit: Math.min(limit, 200),
  });

  return c.json({ alerts, count: alerts.length });
});

// POST /sentinel/alerts/:id/ack
sentinelRoute.post('/alerts/:id/ack', requireRole(['admin']), async (c) => {
  const alertId = c.req.param('id');
  const success = await acknowledgeAlert(alertId);
  if (!success) {
    return c.json({ error: 'ALERT_NOT_FOUND', message: 'Alert not found or already acknowledged' }, 404);
  }
  return c.json({ acknowledged: true, alertId });
});

// GET /sentinel/rules — alert rule configuration
sentinelRoute.get('/rules', requireRole(['admin']), async (c) => {
  const rules = await getAlertRules();
  return c.json({ rules, count: rules.length });
});
