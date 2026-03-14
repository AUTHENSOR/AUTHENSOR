import { Hono } from 'hono';
import { PolicyEngine } from '@authensor/engine';
import { claimReceipt, updateReceipt } from '../services/receipt-service.js';
import { getActivePolicy } from '../services/policy-service.js';
import { requireRole } from '../auth/middleware.js';

export const claimsRoute = new Hono();

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /receipts/:id/claim - Claim a receipt for execution
// Requires: executor | admin role
claimsRoute.post('/:id/claim', requireRole(['executor', 'admin']), async (c) => {
  const id = c.req.param('id');
  if (!UUID_REGEX.test(id)) {
    return c.json({ error: 'Invalid receipt ID format' }, 400);
  }
  const result = await claimReceipt(id);

  if (result.status === 'claimed') {
    const receipt = result.receipt;

    // TOCTOU re-evaluation: only for require_approval decisions
    const toctouEnabled = process.env.AUTHENSOR_TOCTOU_REEVALUATE !== 'false';
    if (toctouEnabled && receipt.decision.outcome === 'require_approval' && receipt.envelope) {
      const orgId = c.req.header('x-authensor-org') || 'default';
      const environment = c.req.header('x-authensor-env') || 'dev';

      const currentPolicy = await getActivePolicy(orgId, environment);

      if (!currentPolicy) {
        // No active policy — fail closed
        const reason = 'No active policy at claim time — fail closed';
        await updateReceipt(id, {
          status: 'cancelled',
          approval: {
            ...receipt.approval,
            toctouRejectedAt: new Date().toISOString(),
            toctouReason: reason,
          },
        });
        return c.json(
          { error: { code: 'TOCTOU_POLICY_CHANGED', message: reason } },
          403
        );
      }

      // Re-evaluate envelope against the current active policy
      const engine = new PolicyEngine();
      const reEvalResult = engine.evaluate(receipt.envelope, [currentPolicy]);
      const newOutcome = reEvalResult.decision.outcome;
      const policyChanged =
        currentPolicy.id !== receipt.decision.policyId ||
        currentPolicy.version !== receipt.decision.policyVersion;

      if (newOutcome === 'deny') {
        // Policy changed and now denies — reject the claim
        const reason = `Policy changed since approval: now ${newOutcome}`;
        await updateReceipt(id, {
          status: 'cancelled',
          approval: {
            ...receipt.approval,
            toctouRejectedAt: new Date().toISOString(),
            toctouReason: reason,
          },
        });
        return c.json(
          { error: { code: 'TOCTOU_POLICY_CHANGED', message: reason } },
          403
        );
      }

      // Policy still allows (or still requires approval) — record re-evaluation metadata
      await updateReceipt(id, {
        approval: {
          ...receipt.approval,
          reEvaluatedAt: new Date().toISOString(),
          policyChangedSinceApproval: policyChanged,
        },
      });
    }

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
