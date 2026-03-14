-- Add parent_receipt_id column for cross-agent receipt chain tracing.
-- Links a receipt to its parent in a delegation chain.
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS parent_receipt_id uuid;

CREATE INDEX IF NOT EXISTS idx_receipts_parent_receipt_id ON receipts (parent_receipt_id) WHERE parent_receipt_id IS NOT NULL;
