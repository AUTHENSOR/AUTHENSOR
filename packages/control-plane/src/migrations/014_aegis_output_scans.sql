-- Add scan_target and tool_name columns to aegis_scans
-- Supports output scanning for OWASP ASI01 (indirect prompt injection)

ALTER TABLE aegis_scans ADD COLUMN IF NOT EXISTS scan_target text NOT NULL DEFAULT 'input';
ALTER TABLE aegis_scans ADD COLUMN IF NOT EXISTS tool_name text;

CREATE INDEX IF NOT EXISTS idx_aegis_scans_scan_target ON aegis_scans (scan_target);
CREATE INDEX IF NOT EXISTS idx_aegis_scans_tool_name ON aegis_scans (tool_name);
