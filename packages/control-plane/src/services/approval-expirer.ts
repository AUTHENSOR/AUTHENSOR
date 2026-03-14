/**
 * Approval Expirer
 *
 * Periodically scans for pending approval receipts whose expiresAt has passed
 * and transitions them to cancelled / expired.
 */

import { db } from '../db.js';

const DEFAULT_INTERVAL_MS = 60_000; // 1 minute

/**
 * Parse a human-readable duration string into milliseconds.
 * Supported formats: '30m', '1h', '24h', '7d', '90s', etc.
 */
export function parseDuration(duration: string): number {
  const match = duration.trim().match(/^(\d+(?:\.\d+)?)\s*(s|m|h|d)$/i);
  if (!match) {
    throw new Error(`Invalid duration format: "${duration}". Expected e.g. "30m", "1h", "7d".`);
  }

  const value = parseFloat(match[1]);
  const unit = match[2].toLowerCase();

  const multipliers: Record<string, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };

  return Math.round(value * multipliers[unit]);
}

/**
 * Query for receipts that require approval, are still pending, and whose
 * approval JSONB contains an expiresAt timestamp that has passed.
 * Updates them in bulk: status -> cancelled, approval_status -> expired,
 * and patches the approval JSONB accordingly.
 *
 * Returns the count of expired receipts.
 */
export async function expireStaleApprovals(): Promise<{ expired: number }> {
  // Single atomic UPDATE using a JSONB condition on approval->'expiresAt'.
  // The cast to timestamptz lets Postgres compare the ISO-8601 string directly.
  const { rowCount } = await db.query(
    `UPDATE receipts
     SET status          = 'cancelled',
         approval_status = 'expired',
         approval        = approval
                           || jsonb_build_object(
                                'status', 'expired',
                                'expiredAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
                              ),
         updated_at      = now()
     WHERE decision_outcome = 'require_approval'
       AND status           = 'pending'
       AND approval_status  = 'pending'
       AND approval->>'expiresAt' IS NOT NULL
       AND (approval->>'expiresAt')::timestamptz <= now()`
  );

  return { expired: rowCount ?? 0 };
}

/**
 * Start a recurring loop that expires stale approvals on a fixed interval.
 *
 * @param intervalMs  Polling interval in milliseconds (default 60 000 / 1 min).
 * @returns A cleanup function that stops the interval.
 */
export function startExpirationLoop(intervalMs: number = DEFAULT_INTERVAL_MS): () => void {
  console.log(`[approval-expirer] Starting expiration loop (interval=${intervalMs}ms)`);

  const tick = async () => {
    try {
      const { expired } = await expireStaleApprovals();
      if (expired > 0) {
        console.log(`[approval-expirer] Expired ${expired} stale approval(s)`);
      }
    } catch (err) {
      console.error('[approval-expirer] Error expiring stale approvals:', err);
    }
  };

  // Run immediately on startup, then on interval
  tick();

  const handle = setInterval(tick, intervalMs);

  return () => {
    console.log('[approval-expirer] Stopping expiration loop');
    clearInterval(handle);
  };
}
