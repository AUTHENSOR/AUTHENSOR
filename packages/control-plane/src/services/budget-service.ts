/**
 * Budget Service — Dollar-denominated cost budget tracking.
 *
 * Manages per-principal spending budgets to prevent denial-of-wallet attacks.
 * Tracks cumulative spend, resets on period boundaries, and provides
 * BudgetState to the engine for synchronous evaluation.
 */

import { db } from '../db.js';
import type { BudgetState } from '@authensor/engine';

export type BudgetPeriod = 'hourly' | 'daily' | 'monthly';
export type BudgetScope = 'principal' | 'action_type' | 'global';

export interface Budget {
  id: string;
  principalId: string;
  budgetAmount: number;
  spentAmount: number;
  currency: string;
  period: BudgetPeriod;
  scope: BudgetScope;
  scopeKey: string | null;
  resetAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBudgetInput {
  principalId: string;
  budgetAmount: number;
  currency?: string;
  period: BudgetPeriod;
  scope?: BudgetScope;
  scopeKey?: string;
}

/**
 * Calculate the next reset time for a given period.
 */
function calculateResetAt(period: BudgetPeriod, from: Date = new Date()): Date {
  const resetAt = new Date(from);
  switch (period) {
    case 'hourly':
      resetAt.setUTCMinutes(0, 0, 0);
      resetAt.setUTCHours(resetAt.getUTCHours() + 1);
      break;
    case 'daily':
      resetAt.setUTCHours(0, 0, 0, 0);
      resetAt.setUTCDate(resetAt.getUTCDate() + 1);
      break;
    case 'monthly':
      resetAt.setUTCHours(0, 0, 0, 0);
      resetAt.setUTCDate(1);
      resetAt.setUTCMonth(resetAt.getUTCMonth() + 1);
      break;
  }
  return resetAt;
}

function rowToBudget(row: any): Budget {
  return {
    id: row.id,
    principalId: row.principal_id,
    budgetAmount: parseFloat(row.budget_amount),
    spentAmount: parseFloat(row.spent_amount),
    currency: row.currency,
    period: row.period,
    scope: row.scope,
    scopeKey: row.scope_key,
    resetAt: row.reset_at instanceof Date ? row.reset_at.toISOString() : row.reset_at,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

/**
 * Create or update a budget for a principal.
 * If a budget already exists for the same principal+period+scope, update it.
 */
export async function upsertBudget(input: CreateBudgetInput): Promise<Budget> {
  const {
    principalId,
    budgetAmount,
    currency = 'USD',
    period,
    scope = 'principal',
    scopeKey = null,
  } = input;

  const resetAt = calculateResetAt(period);
  const scopeKeyVal = scopeKey ?? '';

  const { rows } = await db.query(
    `INSERT INTO budgets (principal_id, budget_amount, currency, period, scope, scope_key, reset_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (principal_id, period, scope)
     DO UPDATE SET
       budget_amount = $2,
       currency = $3,
       updated_at = now()
     RETURNING *`,
    [principalId, budgetAmount, currency, period, scope, scopeKeyVal || null, resetAt]
  );

  return rowToBudget(rows[0]);
}

/**
 * Get a budget by principal ID, period, and scope.
 * Auto-resets the budget if the period has elapsed.
 */
export async function getBudget(
  principalId: string,
  period: BudgetPeriod,
  scope: BudgetScope = 'principal',
  scopeKey: string | null = null
): Promise<Budget | null> {
  const scopeKeyVal = scopeKey ?? '';

  const { rows } = await db.query(
    `SELECT * FROM budgets
     WHERE principal_id = $1 AND period = $2 AND scope = $3
       AND (scope_key = $4 OR (scope_key IS NULL AND $4 = ''))`,
    [principalId, period, scope, scopeKeyVal]
  );

  if (rows.length === 0) return null;

  const budget = rowToBudget(rows[0]);

  // Check if the budget period has elapsed and needs reset
  if (new Date(budget.resetAt) <= new Date()) {
    return resetBudget(budget.id, period);
  }

  return budget;
}

/**
 * Get all budgets for a principal.
 */
export async function getBudgetsForPrincipal(principalId: string): Promise<Budget[]> {
  const { rows } = await db.query(
    `SELECT * FROM budgets WHERE principal_id = $1 ORDER BY period, scope`,
    [principalId]
  );

  const budgets: Budget[] = [];
  for (const row of rows) {
    const budget = rowToBudget(row);
    // Auto-reset if period elapsed
    if (new Date(budget.resetAt) <= new Date()) {
      budgets.push(await resetBudget(budget.id, budget.period));
    } else {
      budgets.push(budget);
    }
  }
  return budgets;
}

/**
 * List all budgets with utilization info.
 */
export async function listBudgets(options?: {
  limit?: number;
  offset?: number;
}): Promise<{ budgets: (Budget & { utilization: number })[]; total: number }> {
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  const [countResult, dataResult] = await Promise.all([
    db.query('SELECT COUNT(*) as count FROM budgets'),
    db.query(
      'SELECT * FROM budgets ORDER BY updated_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    ),
  ]);

  const total = parseInt(countResult.rows[0].count, 10);
  const budgets = dataResult.rows.map((row: any) => {
    const budget = rowToBudget(row);
    const utilization =
      budget.budgetAmount > 0 ? budget.spentAmount / budget.budgetAmount : 0;
    return { ...budget, utilization };
  });

  return { budgets, total };
}

/**
 * Reset a budget's spent amount and advance the reset time.
 */
async function resetBudget(budgetId: string, period: BudgetPeriod): Promise<Budget> {
  const newResetAt = calculateResetAt(period);

  const { rows } = await db.query(
    `UPDATE budgets
     SET spent_amount = 0, reset_at = $2, updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [budgetId, newResetAt]
  );

  return rowToBudget(rows[0]);
}

/**
 * Record a cost event against a budget.
 * Atomically increments spent_amount and writes to the ledger.
 * Returns the updated budget.
 */
export async function recordSpend(
  principalId: string,
  envelopeId: string,
  actionType: string,
  amount: number,
  period: BudgetPeriod,
  scope: BudgetScope = 'principal',
  scopeKey: string | null = null
): Promise<Budget | null> {
  if (amount <= 0) return null;

  const scopeKeyVal = scopeKey ?? '';

  // Atomically increment spent_amount
  const { rows } = await db.query(
    `UPDATE budgets
     SET spent_amount = spent_amount + $2, updated_at = now()
     WHERE principal_id = $1 AND period = $3 AND scope = $4
       AND (scope_key = $5 OR (scope_key IS NULL AND $5 = ''))
     RETURNING *`,
    [principalId, amount, period, scope, scopeKeyVal]
  );

  if (rows.length === 0) return null;

  const budget = rowToBudget(rows[0]);

  // Write to the immutable ledger
  try {
    await db.query(
      `INSERT INTO budget_ledger (budget_id, envelope_id, principal_id, action_type, amount, running_total)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [budget.id, envelopeId, principalId, actionType, amount, budget.spentAmount]
    );
  } catch (err) {
    console.error('[budget] Failed to write ledger entry:', (err as Error).message);
    // Non-fatal: the budget update succeeded, ledger is best-effort
  }

  return budget;
}

/**
 * Get BudgetState for the engine's synchronous evaluation.
 * Returns null if no budget exists for this principal+period+scope.
 */
export async function getBudgetState(
  principalId: string,
  period: BudgetPeriod,
  scope: BudgetScope = 'principal',
  scopeKey: string | null = null
): Promise<BudgetState | null> {
  const budget = await getBudget(principalId, period, scope, scopeKey);
  if (!budget) return null;

  return {
    spentAmount: budget.spentAmount,
    budgetAmount: budget.budgetAmount,
    period: budget.period,
    resetAt: budget.resetAt,
  };
}

/**
 * Delete a budget.
 */
export async function deleteBudget(budgetId: string): Promise<boolean> {
  // Delete ledger entries first (FK constraint)
  await db.query('DELETE FROM budget_ledger WHERE budget_id = $1', [budgetId]);
  const { rowCount } = await db.query('DELETE FROM budgets WHERE id = $1', [budgetId]);
  return (rowCount ?? 0) > 0;
}

/**
 * Get budget ledger entries for audit.
 */
export async function getBudgetLedger(
  principalId: string,
  options?: { limit?: number; offset?: number }
): Promise<any[]> {
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  const { rows } = await db.query(
    `SELECT * FROM budget_ledger
     WHERE principal_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [principalId, limit, offset]
  );

  return rows.map((r: any) => ({
    id: r.id,
    budgetId: r.budget_id,
    envelopeId: r.envelope_id,
    principalId: r.principal_id,
    actionType: r.action_type,
    amount: parseFloat(r.amount),
    runningTotal: parseFloat(r.running_total),
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
  }));
}
