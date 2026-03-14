/**
 * Budget Routes — Dollar-denominated cost budget management.
 *
 * POST   /budgets              — Create or update a budget (admin)
 * GET    /budgets               — List all budgets with utilization (admin)
 * GET    /budgets/:principalId  — Get budgets for a principal (admin)
 * GET    /budgets/:principalId/ledger — Get spend ledger for a principal (admin)
 * DELETE /budgets/:id           — Delete a budget (admin)
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireRole } from '../auth/middleware.js';
import {
  upsertBudget,
  getBudgetsForPrincipal,
  listBudgets,
  deleteBudget,
  getBudgetLedger,
} from '../services/budget-service.js';

export const budgetsRoute = new Hono();

// POST /budgets — create or update a budget
const createBudgetSchema = z.object({
  principalId: z.string().min(1).max(255),
  budgetAmount: z.number().positive(),
  currency: z.string().length(3).default('USD'),
  period: z.enum(['hourly', 'daily', 'monthly']),
  scope: z.enum(['principal', 'action_type', 'global']).default('principal'),
  scopeKey: z.string().max(255).optional(),
});

budgetsRoute.post(
  '/',
  requireRole(['admin']),
  zValidator('json', createBudgetSchema),
  async (c) => {
    const input = c.req.valid('json');

    try {
      const budget = await upsertBudget(input);
      return c.json({ budget }, 201);
    } catch (err) {
      console.error('[budgets] Error creating budget:', (err as Error).message);
      return c.json(
        { error: { code: 'INTERNAL_ERROR', message: 'Failed to create budget' } },
        500
      );
    }
  }
);

// GET /budgets — list all budgets
budgetsRoute.get('/', requireRole(['admin']), async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 200);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  try {
    const result = await listBudgets({ limit, offset });
    return c.json({
      budgets: result.budgets,
      total: result.total,
      limit,
      offset,
    });
  } catch (err) {
    console.error('[budgets] Error listing budgets:', (err as Error).message);
    return c.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to list budgets' } },
      500
    );
  }
});

// GET /budgets/:principalId — get budgets for a specific principal
budgetsRoute.get('/:principalId', requireRole(['admin']), async (c) => {
  const principalId = c.req.param('principalId');

  try {
    const budgets = await getBudgetsForPrincipal(principalId);

    if (budgets.length === 0) {
      return c.json(
        { error: { code: 'NOT_FOUND', message: `No budgets found for principal: ${principalId}` } },
        404
      );
    }

    const enriched = budgets.map((b) => ({
      ...b,
      utilization: b.budgetAmount > 0 ? b.spentAmount / b.budgetAmount : 0,
      remaining: b.budgetAmount - b.spentAmount,
    }));

    return c.json({ principalId, budgets: enriched });
  } catch (err) {
    console.error('[budgets] Error getting budgets:', (err as Error).message);
    return c.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to get budgets' } },
      500
    );
  }
});

// GET /budgets/:principalId/ledger — get spend ledger for audit
budgetsRoute.get('/:principalId/ledger', requireRole(['admin']), async (c) => {
  const principalId = c.req.param('principalId');
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 200);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  try {
    const entries = await getBudgetLedger(principalId, { limit, offset });
    return c.json({ principalId, entries, count: entries.length, limit, offset });
  } catch (err) {
    console.error('[budgets] Error getting ledger:', (err as Error).message);
    return c.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to get budget ledger' } },
      500
    );
  }
});

// DELETE /budgets/:id — delete a budget
budgetsRoute.delete('/:id', requireRole(['admin']), async (c) => {
  const id = c.req.param('id');

  try {
    const deleted = await deleteBudget(id);
    if (!deleted) {
      return c.json(
        { error: { code: 'NOT_FOUND', message: `Budget not found: ${id}` } },
        404
      );
    }
    return c.json({ deleted: true, id });
  } catch (err) {
    console.error('[budgets] Error deleting budget:', (err as Error).message);
    return c.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to delete budget' } },
      500
    );
  }
});
