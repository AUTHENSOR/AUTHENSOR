-- API Keys for AuthN/AuthZ
-- Phase 2: Partner-safe access control

CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('ingest', 'executor', 'admin')),
  key_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  last_used_at timestamptz
);

-- Hash must be unique (no duplicate keys)
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys (key_hash);

-- Query by role for authorization checks
CREATE INDEX IF NOT EXISTS idx_api_keys_role ON api_keys (role);

-- Query active keys (not revoked)
CREATE INDEX IF NOT EXISTS idx_api_keys_revoked_at ON api_keys (revoked_at) WHERE revoked_at IS NULL;

-- Audit by creation time
CREATE INDEX IF NOT EXISTS idx_api_keys_created_at ON api_keys (created_at DESC);
