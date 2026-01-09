/**
 * Approvals Route
 *
 * POST /approvals/:id/approve - Mark a pending approval as approved
 * POST /approvals/:id/reject - Mark a pending approval as rejected
 * POST /approvals/:id/expire - Mark a pending approval as expired
 *
 * All endpoints require admin role.
 */

import { Hono } from 'hono';
import { getReceiptById, updateReceipt } from '../services/receipt-service.js';
import { requireRole } from '../auth/middleware.js';

export const approvalsRoute = new Hono();

// Apply admin role requirement to all routes
approvalsRoute.use('*', requireRole(['admin']));

approvalsRoute.post('/:id/approve', async (c) => {
  const id = c.req.param('id');
  const receipt = await getReceiptById(id);

  if (!receipt) {
    return c.json({ error: 'Receipt not found' }, 404);
  }

  if (receipt.decision.outcome !== 'require_approval') {
    return c.json({ error: 'Receipt does not require approval' }, 400);
  }

  try {
    const updated = await updateReceipt(id, {
      approval: {
        status: 'approved',
        respondedAt: new Date().toISOString(),
      },
    });
    return c.json(updated);
  } catch (error) {
    return c.json({ error: (error as Error).message }, 400);
  }
});

approvalsRoute.post('/:id/reject', async (c) => {
  const id = c.req.param('id');
  const receipt = await getReceiptById(id);

  if (!receipt) {
    return c.json({ error: 'Receipt not found' }, 404);
  }

  if (receipt.decision.outcome !== 'require_approval') {
    return c.json({ error: 'Receipt does not require approval' }, 400);
  }

  try {
    const updated = await updateReceipt(id, {
      status: 'cancelled',
      approval: {
        status: 'rejected',
        respondedAt: new Date().toISOString(),
      },
    });
    return c.json(updated);
  } catch (error) {
    return c.json({ error: (error as Error).message }, 400);
  }
});

approvalsRoute.post('/:id/expire', async (c) => {
  const id = c.req.param('id');
  const receipt = await getReceiptById(id);

  if (!receipt) {
    return c.json({ error: 'Receipt not found' }, 404);
  }

  if (receipt.decision.outcome !== 'require_approval') {
    return c.json({ error: 'Receipt does not require approval' }, 400);
  }

  try {
    const updated = await updateReceipt(id, {
      status: 'cancelled',
      approval: {
        status: 'expired',
        respondedAt: new Date().toISOString(),
      },
    });
    return c.json(updated);
  } catch (error) {
    return c.json({ error: (error as Error).message }, 400);
  }
});
