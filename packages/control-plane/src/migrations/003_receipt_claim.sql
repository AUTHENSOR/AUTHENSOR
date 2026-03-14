ALTER TABLE receipts ADD COLUMN IF NOT EXISTS claim_id uuid;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS claim_expires_at timestamptz;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS execution_attempts integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_receipts_claim_id ON receipts (claim_id);
