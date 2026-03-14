-- Sentinel alerts
CREATE TABLE IF NOT EXISTS sentinel_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id text NOT NULL,
  rule_name text NOT NULL,
  severity text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  metric text NOT NULL,
  current_value real NOT NULL,
  threshold real NOT NULL,
  agent_id text,
  message text NOT NULL,
  triggered_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_sentinel_alerts_status ON sentinel_alerts (status);
CREATE INDEX IF NOT EXISTS idx_sentinel_alerts_severity ON sentinel_alerts (severity);
CREATE INDEX IF NOT EXISTS idx_sentinel_alerts_agent_id ON sentinel_alerts (agent_id);
CREATE INDEX IF NOT EXISTS idx_sentinel_alerts_triggered_at ON sentinel_alerts (triggered_at DESC);

-- Sentinel agent metrics snapshots (periodic, not per-event)
CREATE TABLE IF NOT EXISTS sentinel_agent_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text NOT NULL,
  total_actions integer NOT NULL DEFAULT 0,
  allow_count integer NOT NULL DEFAULT 0,
  deny_count integer NOT NULL DEFAULT 0,
  approval_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  total_cost real NOT NULL DEFAULT 0,
  avg_latency_ms real NOT NULL DEFAULT 0,
  deny_rate real NOT NULL DEFAULT 0,
  risk_score integer NOT NULL DEFAULT 100,
  snapshot_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sentinel_snapshots_agent_id ON sentinel_agent_snapshots (agent_id);
CREATE INDEX IF NOT EXISTS idx_sentinel_snapshots_at ON sentinel_agent_snapshots (snapshot_at DESC);
