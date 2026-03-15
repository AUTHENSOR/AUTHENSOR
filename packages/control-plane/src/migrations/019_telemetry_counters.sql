-- Anonymous aggregate counters for public stats
CREATE TABLE IF NOT EXISTS telemetry_counters (
  metric_name TEXT NOT NULL PRIMARY KEY,
  counter BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO telemetry_counters (metric_name, counter)
VALUES
  ('actions_evaluated', 0),
  ('threats_detected', 0),
  ('receipts_created', 0),
  ('approvals_requested', 0)
ON CONFLICT (metric_name) DO NOTHING;
