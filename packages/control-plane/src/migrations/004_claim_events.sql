-- Claim events for friction metrics
CREATE TABLE IF NOT EXISTS claim_events (
  id uuid PRIMARY KEY,
  receipt_id uuid NOT NULL,
  event text NOT NULL, -- "conflict" | "expired_reclaimed"
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_claim_events_created_at ON claim_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_claim_events_event ON claim_events (event);
