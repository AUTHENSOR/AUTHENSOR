-- Add rekor_entry_id column to receipts for Sigstore/Rekor transparency log integration.
-- Nullable: only set when AUTHENSOR_TRANSPARENCY_ENABLED=true and receipt is published.
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS rekor_entry_id text;

CREATE INDEX IF NOT EXISTS idx_receipts_rekor_entry_id ON receipts (rekor_entry_id) WHERE rekor_entry_id IS NOT NULL;
