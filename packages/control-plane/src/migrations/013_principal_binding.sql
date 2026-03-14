-- Migration: 013_principal_binding
-- Purpose: Add principal identity binding to API keys
--
-- When an API key has a principal_id, any envelope submitted with that key
-- must have a matching principal.id. This prevents Agent A from impersonating
-- Agent B.
--
-- Admin keys are exempt: they may specify any principal.

ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS principal_id text;

-- Index for looking up keys by principal_id
CREATE INDEX IF NOT EXISTS idx_api_keys_principal_id ON api_keys (principal_id) WHERE principal_id IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN api_keys.principal_id IS 'Bound principal identity. When set, envelopes must have matching principal.id.';
