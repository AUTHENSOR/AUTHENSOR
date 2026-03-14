/**
 * Approvals Route
 *
 * POST /approvals/:id/respond - Submit an individual approval response (multi-party)
 * POST /approvals/:id/approve - Mark a pending approval as approved (legacy single-approver)
 * POST /approvals/:id/reject - Mark a pending approval as rejected
 * POST /approvals/:id/expire - Mark a pending approval as expired
 * GET  /approvals/:id - Get approval status and responses
 *
 * All endpoints require admin role.
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  getReceiptById,
  updateReceipt,
  addApprovalResponse,
  getApprovalResponses,
} from '../services/receipt-service.js';
import { requireRole } from '../auth/middleware.js';

export const approvalsRoute = new Hono();

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Apply admin role requirement to all routes
approvalsRoute.use('*', requireRole(['admin']));

// Multi-party approval response
const respondSchema = z.object({
  responderId: z.string().min(1),
  responderType: z.string().optional(),
  responderName: z.string().optional(),
  decision: z.enum(['approve', 'reject']),
  comment: z.string().optional(),
});

approvalsRoute.post('/:id/respond', zValidator('json', respondSchema), async (c) => {
  const id = c.req.param('id');
  if (!UUID_REGEX.test(id)) {
    return c.json({ error: 'Invalid receipt ID format' }, 400);
  }

  const body = c.req.valid('json');

  try {
    const result = await addApprovalResponse(id, body);
    return c.json({
      receipt: result.receipt,
      response: result.response,
      quorumReached: result.quorumReached,
      approveCount: result.approveCount,
      rejectCount: result.rejectCount,
      requiredApprovals: result.requiredApprovals,
    });
  } catch (error) {
    const message = (error as Error).message;
    if (message === 'Receipt not found') return c.json({ error: message }, 404);
    return c.json({ error: message }, 400);
  }
});

// Get approval status and all responses
approvalsRoute.get('/:id', async (c) => {
  const id = c.req.param('id');
  if (!UUID_REGEX.test(id)) {
    return c.json({ error: 'Invalid receipt ID format' }, 400);
  }

  const receipt = await getReceiptById(id);
  if (!receipt) return c.json({ error: 'Receipt not found' }, 404);
  if (receipt.decision.outcome !== 'require_approval') {
    return c.json({ error: 'Receipt does not require approval' }, 400);
  }

  const responses = await getApprovalResponses(id);
  const requiredApprovals = (receipt.approval as any)?.requiredApprovals ?? 1;
  const approveCount = responses.filter((r) => r.decision === 'approve').length;
  const rejectCount = responses.filter((r) => r.decision === 'reject').length;

  return c.json({
    receiptId: id,
    status: receipt.approval?.status ?? 'pending',
    requiredApprovals,
    approveCount,
    rejectCount,
    quorumReached: approveCount >= requiredApprovals,
    responses,
  });
});

// Legacy single-approver endpoints (still supported, equivalent to respond with decision=approve)
approvalsRoute.post('/:id/approve', async (c) => {
  const id = c.req.param('id');
  if (!UUID_REGEX.test(id)) {
    return c.json({ error: 'Invalid receipt ID format' }, 400);
  }
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
  if (!UUID_REGEX.test(id)) {
    return c.json({ error: 'Invalid receipt ID format' }, 400);
  }
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
  if (!UUID_REGEX.test(id)) {
    return c.json({ error: 'Invalid receipt ID format' }, 400);
  }
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
