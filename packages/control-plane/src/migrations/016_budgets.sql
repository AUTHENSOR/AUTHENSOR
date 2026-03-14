-- Migration: 016_budgets
-- Purpose: Dollar-denominated cost budget tracking for denial-of-wallet prevention.
--
-- Tracks cumulative spend per principal (or per action type / global) within
-- rolling time windows (hourly, daily, monthly). The control plane updates
-- spent_amount after each allowed action that declares a cost via
-- constraints.maxAmount in the envelope.

CREATE TABLE IF NOT EXISTS budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  principal_id text NOT NULL,
  budget_amount real NOT NULL,
  spent_amount real NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  period text NOT NULL,
  scope text NOT NULL DEFAULT 'principal',
  scope_key text,
  reset_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Fast lookups by principal + period + scope
CREATE UNIQUE INDEX IF NOT EXISTS idx_budgets_principal_period_scope
  ON budgets (principal_id, period, scope);
CREATE INDEX IF NOT EXISTS idx_budgets_reset_at ON budgets (reset_at);

-- Budget ledger: immutable log of every cost event for audit
CREATE TABLE IF NOT EXISTS budget_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id uuid NOT NULL,
  envelope_id text NOT NULL,
  principal_id text NOT NULL,
  action_type text NOT NULL,
  amount real NOT NULL,
  running_total real NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_budget_ledger_budget_id ON budget_ledger (budget_id);
CREATE INDEX IF NOT EXISTS idx_budget_ledger_principal_id ON budget_ledger (principal_id);
CREATE INDEX IF NOT EXISTS idx_budget_ledger_created_at ON budget_ledger (created_at DESC);
