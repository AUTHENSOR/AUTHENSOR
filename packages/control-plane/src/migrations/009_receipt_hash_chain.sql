-- Hash-chained receipts for tamper-evident audit trail
-- Each receipt stores its own SHA-256 hash and a reference to the previous receipt's hash,
-- creating a verifiable chain similar to a blockchain but without the overhead.

ALTER TABLE receipts ADD COLUMN IF NOT EXISTS receipt_hash text;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS prev_receipt_hash text;

CREATE INDEX IF NOT EXISTS idx_receipts_receipt_hash ON receipts (receipt_hash);
