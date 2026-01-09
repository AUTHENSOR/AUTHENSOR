CREATE TABLE IF NOT EXISTS receipts (
  id uuid PRIMARY KEY,
  envelope_id uuid NOT NULL,
  status text NOT NULL,
  decision_outcome text NOT NULL,
  tool_name text,
  actor_id text,
  envelope jsonb NOT NULL,
  decision jsonb NOT NULL,
  approval jsonb,
  approval_status text,
  execution jsonb,
  result jsonb,
  error jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Backfill for dev environments that already created the table without new columns
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS decision_outcome text NOT NULL DEFAULT 'deny';
ALTER TABLE receipts ALTER COLUMN decision_outcome DROP DEFAULT;

ALTER TABLE receipts ADD COLUMN IF NOT EXISTS tool_name text;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS actor_id text;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS approval jsonb;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS approval_status text;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS execution jsonb;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS result jsonb;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS error jsonb;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_receipts_created_at ON receipts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_receipts_status_created_at ON receipts (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_receipts_envelope_id ON receipts (envelope_id);
CREATE INDEX IF NOT EXISTS idx_receipts_actor_id ON receipts (actor_id);
CREATE INDEX IF NOT EXISTS idx_receipts_tool_name ON receipts (tool_name);
CREATE INDEX IF NOT EXISTS idx_receipts_decision_outcome ON receipts (decision_outcome);
