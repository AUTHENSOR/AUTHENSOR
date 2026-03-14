-- Aegis content scan results
CREATE TABLE IF NOT EXISTS aegis_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid REFERENCES receipts(id),
  content_hash text,
  safe boolean NOT NULL,
  threat_level text NOT NULL,
  detections jsonb NOT NULL DEFAULT '[]',
  detector_stats jsonb,
  scan_time_ms real,
  mode text NOT NULL DEFAULT 'block',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aegis_scans_receipt_id ON aegis_scans (receipt_id);
CREATE INDEX IF NOT EXISTS idx_aegis_scans_safe ON aegis_scans (safe);
CREATE INDEX IF NOT EXISTS idx_aegis_scans_threat_level ON aegis_scans (threat_level);
CREATE INDEX IF NOT EXISTS idx_aegis_scans_created_at ON aegis_scans (created_at DESC);
