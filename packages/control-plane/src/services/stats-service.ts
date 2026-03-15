/**
 * Stats Service
 *
 * Anonymous aggregate counters for public stats display.
 * No per-user, per-org, or per-session data — just totals.
 */

import { db } from '../db.js';

const VALID_METRICS = [
  'actions_evaluated',
  'threats_detected',
  'receipts_created',
  'approvals_requested',
] as const;

export type MetricName = (typeof VALID_METRICS)[number];

export function isValidMetric(name: string): name is MetricName {
  return VALID_METRICS.includes(name as MetricName);
}

/**
 * Increment a counter by the given amount.
 * Fire-and-forget — never throws.
 */
export async function incrementCounter(metric: MetricName, amount = 1): Promise<void> {
  try {
    await db.query(
      `UPDATE telemetry_counters SET counter = counter + $1, updated_at = now() WHERE metric_name = $2`,
      [amount, metric]
    );
  } catch {
    // Never let stats tracking break the main flow
  }
}

/**
 * Get all counters.
 */
export async function getCounters(): Promise<Record<MetricName, number>> {
  const { rows } = await db.query<{ metric_name: string; counter: string; updated_at: string }>(
    'SELECT metric_name, counter, updated_at FROM telemetry_counters ORDER BY metric_name'
  );

  const result: Record<string, number> = {
    actions_evaluated: 0,
    threats_detected: 0,
    receipts_created: 0,
    approvals_requested: 0,
  };

  for (const row of rows) {
    if (isValidMetric(row.metric_name)) {
      result[row.metric_name] = parseInt(row.counter, 10);
    }
  }

  return result as Record<MetricName, number>;
}

/**
 * Ingest counter increments from external sources (opt-in telemetry).
 * Validates and caps each increment to prevent abuse.
 */
export async function ingestCounters(
  increments: Partial<Record<MetricName, number>>
): Promise<void> {
  const MAX_INCREMENT = 10_000;

  for (const [metric, amount] of Object.entries(increments)) {
    if (!isValidMetric(metric)) continue;
    if (typeof amount !== 'number' || amount <= 0 || amount > MAX_INCREMENT) continue;
    await incrementCounter(metric, Math.floor(amount));
  }
}
