CREATE TABLE IF NOT EXISTS policies (
  org_id text NOT NULL DEFAULT 'default',
  environment text NOT NULL DEFAULT 'dev',
  policy_id text NOT NULL,
  version text NOT NULL,
  policy jsonb NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, environment, policy_id, version)
);

CREATE TABLE IF NOT EXISTS active_policies (
  org_id text NOT NULL DEFAULT 'default',
  environment text NOT NULL DEFAULT 'dev',
  policy_id text NOT NULL,
  version text NOT NULL,
  activated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, environment)
);

CREATE INDEX IF NOT EXISTS idx_policies_org_env ON policies (org_id, environment);
CREATE INDEX IF NOT EXISTS idx_active_policies_org_env ON active_policies (org_id, environment);
