import { Hono } from 'hono';
import { claimReceipt } from '../services/receipt-service.js';
import { requireRole } from '../auth/middleware.js';

export const claimsRoute = new Hono();

// POST /receipts/:id/claim - Claim a receipt for execution
// Requires: executor | admin role
claimsRoute.post('/:id/claim', requireRole(['executor', 'admin']), async (c) => {
  const id = c.req.param('id');
  const result = await claimReceipt(id);

  if (result.status === 'claimed') {
    return c.json({ claimId: result.claimId, claimExpiresAt: result.receipt.metadata?.claimExpiresAt, receipt: result.receipt });
  }

  if (result.status === 'already_executed') {
    return c.json({ already_executed: true, receipt: result.receipt });
  }

  if (result.status === 'already_claimed') {
    return c.json(
      {
        error: 'Receipt already claimed',
        retryAfterSeconds: result.retryAfterSeconds,
        claimExpiresAt: result.claimExpiresAt,
      },
      409
    );
  }

  // Return 403 for controls-blocked scenarios (EXECUTION_DISABLED, TOOL_DISABLED)
  if (result.code === 'EXECUTION_DISABLED' || result.code === 'TOOL_DISABLED') {
    return c.json(
      {
        error: { code: result.code, message: result.reason },
      },
      403
    );
  }

  // Return 409 for other conflict scenarios
  return c.json(
    {
      error: result.reason,
      code: result.code,
      claimExpiresAt: result.claimExpiresAt,
      retryAfterSeconds: 5,
    },
    409
  );
});
