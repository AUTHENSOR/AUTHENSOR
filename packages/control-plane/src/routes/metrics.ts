/**
 * Metrics Route
 *
 * GET /metrics/summary - Get metrics summary with insights
 * Requires admin role.
 */

import { Hono } from 'hono';
import { db } from '../db.js';
import { requireRole } from '../auth/middleware.js';

const VALID_WINDOWS = ['1h', '24h', '7d'] as const;

function parseWindow(input?: string): string {
  if (input && (VALID_WINDOWS as readonly string[]).includes(input)) return input;
  return '24h';
}

function windowToInterval(window: string): string {
  switch (window) {
    case '1h':
      return "interval '1 hour'";
    case '7d':
      return "interval '7 day'";
    case '24h':
    default:
      return "interval '24 hour'";
  }
}

export const metricsRoute = new Hono();

// Apply admin role requirement
metricsRoute.use('*', requireRole(['admin']));

const schemaSupportCache: { receiptsOrgEnv?: boolean; claimEventsOrgEnv?: boolean } = {};

async function hasOrgEnv(table: string): Promise<boolean> {
  const cacheKey =
    table === 'receipts' ? 'receiptsOrgEnv' : table === 'claim_events' ? 'claimEventsOrgEnv' : undefined;
  if (cacheKey && schemaSupportCache[cacheKey] !== undefined) {
    return Boolean(schemaSupportCache[cacheKey]);
  }
  const { rows } = await db.query<{ exists: boolean }>(
    `SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = $1 AND column_name IN ('org_id','environment')
    ) AS exists`,
    [table]
  );
  const exists = rows[0]?.exists || false;
  if (cacheKey) schemaSupportCache[cacheKey] = exists;
  return exists;
}

function parseScope(c: any) {
  const queryOrg = c.req.query('org');
  const queryEnv = c.req.query('env');
  const headerOrg = c.req.header('x-authensor-org');
  const headerEnv = c.req.header('x-authensor-env');
  const org = queryOrg || headerOrg || 'default';
  const env = queryEnv || headerEnv || 'dev';
  return { org, env };
}

const INSIGHT_THRESHOLDS = {
  denyRate: 0.2,
  denyMinCount: 20,
  configBlockedRate: 0.1,
  configBlockedMin: 5,
  claimConflictRate: 0.05,
  claimConflictMin: 3,
  expiredReclaimRate: 0.05,
  expiredReclaimMin: 3,
  approvalsStuckMin: 5,
};

function safeDivide(n: number, d: number): number | null {
  if (!d || Number.isNaN(n) || Number.isNaN(d)) return null;
  return n / d;
}

metricsRoute.get('/summary', async (c) => {
  const window = parseWindow(c.req.query('window') || undefined);
  const interval = windowToInterval(window);
  const { org, env } = parseScope(c);
  const receiptsScoped = await hasOrgEnv('receipts');
  const claimEventsScoped = await hasOrgEnv('claim_events');
  const scopeMode = receiptsScoped ? 'scoped' : 'global';

  const receiptParams: any[] = [];
  const receiptFilters: string[] = [`created_at >= now() - ${interval}`];
  if (receiptsScoped) {
    const base = receiptParams.length;
    receiptParams.push(org, env);
    receiptFilters.push(`org_id = $${base + 1} AND environment = $${base + 2}`);
  }
  const receiptWhere = `WHERE ${receiptFilters.join(' AND ')}`;

  const receiptsByStatus = await db.query<{ status: string; count: string }>(
    `SELECT status, COUNT(*)::int AS count
     FROM receipts
     ${receiptWhere}
     GROUP BY status`,
    receiptParams
  );

  const receiptsByDecision = await db.query<{ decision_outcome: string; count: string }>(
    `SELECT decision_outcome, COUNT(*)::int AS count
     FROM receipts
     ${receiptWhere}
     GROUP BY decision_outcome`,
    receiptParams
  );

  const approvalCounts = await db.query<{ approval_status: string | null; count: string }>(
    `SELECT approval_status, COUNT(*)::int AS count
     FROM receipts
     ${receiptWhere}
     GROUP BY approval_status`,
    receiptParams
  );

  const configBlockedCountResult = await db.query<{ count: string }>(
    `SELECT COUNT(*)::int AS count
     FROM receipts
     ${receiptWhere}
       AND (
         (error ->> 'code') = 'CONFIG_BLOCKED'
         OR (execution -> 'error' ->> 'code') = 'CONFIG_BLOCKED'
       )`,
    receiptParams
  );

  const claimParams: any[] = [];
  const claimFilters: string[] = [`created_at >= now() - ${interval}`];
  if (claimEventsScoped) {
    const base = claimParams.length;
    claimParams.push(org, env);
    claimFilters.push(`org_id = $${base + 1} AND environment = $${base + 2}`);
  }
  const claimWhere = `WHERE ${claimFilters.join(' AND ')}`;

  const claimEvents = await db.query<{ event: string; count: string }>(
    `SELECT event, COUNT(*)::int AS count
     FROM claim_events
     ${claimWhere}
     GROUP BY event`,
    claimParams
  );

  const byStatus = receiptsByStatus.rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = Number(row.count);
    return acc;
    }, {});
  const byDecision = receiptsByDecision.rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.decision_outcome] = Number(row.count);
    return acc;
  }, {});
  const claimCounts = claimEvents.rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.event] = Number(row.count);
    return acc;
  }, {});

  const approvalCountMap = approvalCounts.rows.reduce<Record<string, number>>((acc, row) => {
    const key = row.approval_status ?? 'none';
    acc[key] = Number(row.count);
    return acc;
  }, {});

  const totalReceipts =
    Object.values(byDecision).reduce((sum, v) => sum + v, 0) ||
    Object.values(byStatus).reduce((sum, v) => sum + v, 0);
  const denyRate = safeDivide(byDecision['deny'] || 0, totalReceipts) || 0;
  const approvalRequiredRate = safeDivide(byDecision['require_approval'] || 0, totalReceipts) || 0;
  const approvalGrantRate =
    byDecision['require_approval']
      ? safeDivide(approvalCountMap['approved'] || 0, byDecision['require_approval']) ?? 0
      : null;
  const configBlockedCount = Number(configBlockedCountResult.rows[0]?.count || 0);
  const configBlockedRate = totalReceipts ? configBlockedCount / totalReceipts : 0;
  const claimAttempts = claimCounts['attempt'] || 0;
  const claimConflictRate = claimAttempts ? (claimCounts['conflict'] || 0) / claimAttempts : null;
  const expiredReclaimRate = claimAttempts ? (claimCounts['expired_reclaimed'] || 0) / claimAttempts : null;

  const insights: Array<{
    id: string;
    severity: 'info' | 'warn';
    message: string;
    evidence: Record<string, unknown>;
    suggestions: string[];
  }> = [];

  if (totalReceipts >= INSIGHT_THRESHOLDS.denyMinCount && denyRate >= INSIGHT_THRESHOLDS.denyRate) {
    insights.push({
      id: 'deny_spike',
      severity: 'warn',
      message: 'High deny rate suggests policy too strict or action types mismatched.',
      evidence: { deny_rate: denyRate, total: totalReceipts, deny_count: byDecision['deny'] || 0 },
      suggestions: [
        'Review active policy rules for action.type and priority ordering.',
        'Check receipts for decision_outcome=deny and compare action.type vs rules.',
      ],
    });
  }

  if (
    configBlockedCount >= INSIGHT_THRESHOLDS.configBlockedMin ||
    configBlockedRate >= INSIGHT_THRESHOLDS.configBlockedRate
  ) {
    insights.push({
      id: 'config_blocked_spike',
      severity: 'warn',
      message: 'CONFIG_BLOCKED indicates integration config/allowlists not set.',
      evidence: { config_blocked: configBlockedCount, rate: configBlockedRate },
      suggestions: [
        'Set AUTHENSOR_GITHUB_ALLOWED_REPOS/ORGS (prod denies all when unset).',
        'Stripe live mode requires AUTHENSOR_STRIPE_ALLOW_LIVE=true + STRIPE_LIVE_KEY in prod.',
      ],
    });
  }

  if (
    claimCounts['conflict'] >= INSIGHT_THRESHOLDS.claimConflictMin ||
    (claimConflictRate !== null && claimConflictRate >= INSIGHT_THRESHOLDS.claimConflictRate)
  ) {
    insights.push({
      id: 'claim_conflicts_spike',
      severity: 'warn',
      message: 'Claim conflicts suggest concurrent executors or aggressive retries.',
      evidence: { conflicts: claimCounts['conflict'] || 0, claim_conflict_rate: claimConflictRate },
      suggestions: [
        'Ensure only one executor runs per receipt.',
        'Reduce parallelism or backoff retries.',
      ],
    });
  }

  if (
    claimCounts['expired_reclaimed'] >= INSIGHT_THRESHOLDS.expiredReclaimMin ||
    (expiredReclaimRate !== null && expiredReclaimRate >= INSIGHT_THRESHOLDS.expiredReclaimRate)
  ) {
    insights.push({
      id: 'expired_reclaimed_spike',
      severity: 'warn',
      message: 'Claims expiring suggests TTL too low or executions too slow.',
      evidence: { expired_reclaimed: claimCounts['expired_reclaimed'] || 0, expired_reclaim_rate: expiredReclaimRate },
      suggestions: [
        'Increase AUTHENSOR_CLAIM_TTL_SECONDS.',
        'Check tool execution duration in receipts.',
      ],
    });
  }

  const requireApprovalCount = byDecision['require_approval'] || 0;
  if (requireApprovalCount >= INSIGHT_THRESHOLDS.approvalsStuckMin && (approvalCountMap['approved'] || 0) === 0) {
    insights.push({
      id: 'approvals_stuck',
      severity: 'warn',
      message: 'Approvals required but none granted; executions will not proceed.',
      evidence: { require_approval: requireApprovalCount, approved: approvalCountMap['approved'] || 0 },
      suggestions: [
        'Call POST /approvals/:id/approve for pending receipts.',
        'Verify approval flow in your integration.',
      ],
    });
  }

  return c.json({
    window,
    scope: { org, env, mode: scopeMode },
    receipts: {
      by_status: byStatus,
      by_decision_outcome: byDecision,
    },
    claims: {
      conflicts: claimCounts['conflict'] || 0,
      expired_reclaimed: claimCounts['expired_reclaimed'] || 0,
      attempts: claimCounts['attempt'] || 0,
    },
    ratios: {
      deny_rate: denyRate,
      config_blocked_rate: totalReceipts ? configBlockedRate : null,
      claim_conflict_rate: claimConflictRate,
      expired_reclaim_rate: expiredReclaimRate,
      approval_required_rate: approvalRequiredRate || 0,
      approval_grant_rate: approvalGrantRate,
    },
    insights,
    generated_at: new Date().toISOString(),
  });
});
