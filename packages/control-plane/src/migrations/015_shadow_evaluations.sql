CREATE TABLE IF NOT EXISTS shadow_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id text NOT NULL,
  active_policy_id text NOT NULL,
  active_policy_version text NOT NULL,
  active_decision text NOT NULL,
  active_matched_rule text,
  active_reason text,
  shadow_policy_id text NOT NULL,
  shadow_policy_version text NOT NULL,
  shadow_decision text NOT NULL,
  shadow_matched_rule text,
  shadow_reason text,
  decisions_agree boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shadow_evaluations_created_at ON shadow_evaluations (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shadow_evaluations_agree ON shadow_evaluations (decisions_agree);
CREATE INDEX IF NOT EXISTS idx_shadow_evaluations_shadow_policy ON shadow_evaluations (shadow_policy_id, shadow_policy_version);
