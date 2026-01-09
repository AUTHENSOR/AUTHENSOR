-- Add key_prefix column for displaying token hints in admin UI
-- Format: "authensor_XXXX...YYYY" (prefix + last 4 chars)

ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS key_prefix text;

-- Comment for documentation
COMMENT ON COLUMN api_keys.key_prefix IS 'Token prefix for display (e.g., authensor_abc1...xy9z). Never contains full token.';
