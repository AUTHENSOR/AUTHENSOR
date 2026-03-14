-- Multi-party approval support
-- Tracks individual approval responses per receipt, enabling quorum-based approval workflows.

CREATE TABLE IF NOT EXISTS approval_responses (
  id uuid PRIMARY KEY,
  receipt_id uuid NOT NULL,
  responder_type text,
  responder_id text NOT NULL,
  responder_name text,
  decision text NOT NULL CHECK (decision IN ('approve', 'reject')),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approval_responses_receipt_id ON approval_responses (receipt_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_approval_responses_receipt_responder ON approval_responses (receipt_id, responder_id);
