/**
 * Approval Notifier
 *
 * Fires a webhook when a receipt with decision outcome `require_approval`
 * is created.  Best-effort: errors are logged but never thrown.
 *
 * Follows the same pattern as `maybeSendPolicyMissingAlert` in
 * routes/evaluate.ts.
 */

import type { ActionReceipt } from '@authensor/engine';

// ---------------------------------------------------------------------------
// Rate limiting – at most 1 webhook per second
// ---------------------------------------------------------------------------
const MIN_INTERVAL_MS = 1_000;
let lastSentAt = 0;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Send a webhook notification that a new receipt requires human approval.
 *
 * - Reads `AUTHENSOR_APPROVAL_WEBHOOK_URL` from the environment.
 *   If the variable is not set the function returns immediately.
 * - Optionally reads `AUTHENSOR_APPROVAL_WEBHOOK_SECRET` and, when
 *   present, sends it as a Bearer token in the Authorization header.
 * - Rate-limited to at most one call per second to prevent flooding.
 * - Best-effort: all errors are caught and logged; the function never
 *   throws.
 */
export async function notifyApprovalRequired(receipt: ActionReceipt): Promise<void> {
  try {
    const url = process.env.AUTHENSOR_APPROVAL_WEBHOOK_URL;
    if (!url) return;

    // Rate limit
    const now = Date.now();
    if (now - lastSentAt < MIN_INTERVAL_MS) return;
    lastSentAt = now;

    // Build headers
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const secret = process.env.AUTHENSOR_APPROVAL_WEBHOOK_SECRET;
    if (secret) headers.Authorization = `Bearer ${secret}`;

    // Extract fields from the receipt
    const envelope = receipt.envelope as
      | { action?: { type?: string }; principal?: { id?: string } }
      | undefined;

    const approval = receipt.approval as
      | { requiredApprovals?: number }
      | undefined;

    const body = JSON.stringify({
      event: 'approval_required',
      timestamp: new Date().toISOString(),
      receiptId: receipt.id,
      toolName: envelope?.action?.type ?? null,
      actorId: envelope?.principal?.id ?? null,
      reason: receipt.decision?.reason ?? null,
      requiredApprovals: approval?.requiredApprovals ?? 1,
      approveUrl: `/approvals/${receipt.id}/respond`,
      viewUrl: `/receipts/${receipt.id}/view`,
    });

    await fetch(url, { method: 'POST', headers, body });
  } catch (err) {
    console.error('[approval-notifier] webhook failed:', err);
  }
}
