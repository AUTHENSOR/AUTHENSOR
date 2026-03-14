/**
 * Sentinel Service — Control plane integration for monitoring.
 *
 * Wraps @authensor/sentinel and persists alerts to DB.
 * Processes receipt events in the background after /evaluate.
 */

import crypto from 'crypto';
import { db } from '../db.js';

// Lazy-load sentinel
let _sentinel: any = null;

async function getSentinel() {
  if (_sentinel) return _sentinel;
  try {
    const mod = await import('@authensor/sentinel');
    _sentinel = new mod.Sentinel({
      onAlert: async (alert: any) => {
        await persistAlert(alert);
        await maybeSendAlertWebhook(alert);
      },
    });
    return _sentinel;
  } catch {
    console.warn('[sentinel] @authensor/sentinel not available — monitoring disabled');
    return null;
  }
}

export function isSentinelEnabled(): boolean {
  return process.env.AUTHENSOR_SENTINEL_ENABLED !== 'false'; // enabled by default
}

/**
 * Process a receipt event through Sentinel.
 * Called after receipt creation — fire-and-forget.
 */
export async function processReceiptEvent(receipt: any): Promise<void> {
  if (!isSentinelEnabled()) return;

  const sentinel = await getSentinel();
  if (!sentinel) return;

  try {
    const event = {
      receiptId: receipt.id,
      envelopeId: receipt.envelopeId || receipt.envelope_id,
      agentId: receipt.actorId || receipt.actor_id || receipt.envelope?.principal?.id || 'unknown',
      actionType:
        receipt.toolName || receipt.tool_name || receipt.envelope?.action?.type || 'unknown',
      outcome: receipt.decisionOutcome || receipt.decision_outcome || receipt.decision?.outcome,
      timestamp: Date.now(),
      latencyMs: receipt.execution?.durationMs,
      cost: receipt.execution?.result?.cost,
      error: receipt.status === 'failed',
    };

    sentinel.processEvent(event);
  } catch (err) {
    console.error('[sentinel] Error processing receipt event:', (err as Error).message);
  }
}

/**
 * Persist an alert to the database.
 */
async function persistAlert(alert: any): Promise<void> {
  try {
    await db.query(
      `INSERT INTO sentinel_alerts (id, rule_id, rule_name, severity, status, metric, current_value, threshold, agent_id, message, triggered_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (id) DO NOTHING`,
      [
        alert.id,
        alert.ruleId,
        alert.ruleName,
        alert.severity,
        alert.status,
        alert.metric,
        alert.currentValue,
        alert.threshold,
        alert.agentId || null,
        alert.message,
        new Date(alert.triggeredAt),
      ]
    );
  } catch (err) {
    console.error('[sentinel] Failed to persist alert:', (err as Error).message);
  }
}

/**
 * Send alert webhook notification.
 */
async function maybeSendAlertWebhook(alert: any): Promise<void> {
  const url = process.env.AUTHENSOR_SENTINEL_ALERT_WEBHOOK_URL;
  if (!url) return;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const secret = process.env.AUTHENSOR_SENTINEL_ALERT_WEBHOOK_SECRET;
  if (secret) headers.Authorization = `Bearer ${secret}`;

  try {
    await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        event: 'sentinel_alert',
        timestamp: new Date().toISOString(),
        alert,
      }),
    });
  } catch {
    // best-effort
  }
}

/**
 * Get agent stats from the in-memory Sentinel instance.
 */
export async function getAgentStats(agentId?: string) {
  const sentinel = await getSentinel();
  if (!sentinel) return agentId ? null : [];

  if (agentId) {
    const stats = sentinel.getAgentStats(agentId);
    if (!stats) return null;
    return serializeStats(stats);
  }
  return sentinel.getAllAgentStats().map(serializeStats);
}

function serializeStats(stats: any) {
  return {
    agentId: stats.agentId,
    totalActions: stats.totalActions,
    allowCount: stats.allowCount,
    denyCount: stats.denyCount,
    approvalCount: stats.approvalCount,
    errorCount: stats.errorCount,
    totalCost: stats.totalCost,
    avgLatencyMs: stats.avgLatencyMs,
    denyRate: stats.denyRate,
    riskScore: stats.riskScore,
    lastSeenAt: stats.lastSeenAt,
    topActions: Object.fromEntries(stats.topActions),
    topDenied: Object.fromEntries(stats.topDenied),
  };
}

/**
 * Get active alerts from both in-memory and DB.
 */
export async function getAlerts(options?: {
  status?: string;
  severity?: string;
  agentId?: string;
  limit?: number;
}) {
  const limit = options?.limit ?? 50;
  const conditions: string[] = [];
  const params: any[] = [];
  let paramIdx = 1;

  if (options?.status) {
    conditions.push(`status = $${paramIdx++}`);
    params.push(options.status);
  }
  if (options?.severity) {
    conditions.push(`severity = $${paramIdx++}`);
    params.push(options.severity);
  }
  if (options?.agentId) {
    conditions.push(`agent_id = $${paramIdx++}`);
    params.push(options.agentId);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit);

  try {
    const { rows } = await db.query(
      `SELECT * FROM sentinel_alerts ${where} ORDER BY triggered_at DESC LIMIT $${paramIdx}`,
      params
    );
    return rows.map((r: any) => ({
      id: r.id,
      ruleId: r.rule_id,
      ruleName: r.rule_name,
      severity: r.severity,
      status: r.status,
      metric: r.metric,
      currentValue: r.current_value,
      threshold: r.threshold,
      agentId: r.agent_id,
      message: r.message,
      triggeredAt: r.triggered_at,
      acknowledgedAt: r.acknowledged_at,
      resolvedAt: r.resolved_at,
    }));
  } catch {
    return [];
  }
}

/**
 * Acknowledge an alert.
 */
export async function acknowledgeAlert(alertId: string): Promise<boolean> {
  // Update in-memory
  const sentinel = await getSentinel();
  if (sentinel) sentinel.acknowledgeAlert(alertId);

  // Update in DB
  try {
    const { rowCount } = await db.query(
      `UPDATE sentinel_alerts SET status = 'acknowledged', acknowledged_at = NOW()
       WHERE id = $1 AND status = 'active'`,
      [alertId]
    );
    return (rowCount ?? 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Get Sentinel status summary.
 */
export async function getSentinelStatus() {
  const sentinel = await getSentinel();
  if (!sentinel) {
    return { enabled: false, totalEvents: 0, activeAgents: 0, activeAlerts: 0, uptimeMs: 0 };
  }

  const status = sentinel.getStatus();
  return { enabled: true, ...status };
}

/**
 * Get Sentinel alert rules.
 */
export async function getAlertRules() {
  const sentinel = await getSentinel();
  if (!sentinel) return [];
  return sentinel.getAlertRules();
}

/**
 * Process a budget threshold alert.
 * Called when budget utilization crosses configured thresholds (e.g., 80%, 90%, 100%).
 * Persists alerts and sends webhook notifications.
 */
export async function processBudgetAlert(params: {
  principalId: string;
  actionType: string;
  budgetAmount: number;
  spentAmount: number;
  utilization: number;
  period: string;
  breachedThresholds: number[];
}): Promise<void> {
  if (!isSentinelEnabled()) return;

  for (const threshold of params.breachedThresholds) {
    const pct = Math.round(threshold * 100);
    const severity = threshold >= 1.0 ? 'critical' : threshold >= 0.9 ? 'warning' : 'info';
    const alertId = crypto.randomUUID();

    const alert = {
      id: alertId,
      ruleId: `budget-threshold-${pct}`,
      ruleName: `Budget ${pct}% threshold`,
      severity,
      status: 'active',
      metric: 'cost_rate',
      currentValue: params.spentAmount,
      threshold: params.budgetAmount * threshold,
      agentId: params.principalId,
      message: `Budget ${pct}% threshold breached for ${params.principalId}: $${params.spentAmount.toFixed(2)} / $${params.budgetAmount.toFixed(2)} (${params.period})`,
      triggeredAt: Date.now(),
    };

    await persistAlert(alert);
    await maybeSendAlertWebhook(alert);
  }
}
