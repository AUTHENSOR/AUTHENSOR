-- Controls table for kill switch and per-tool disables
-- Phase 4: Partner-safe execution controls

CREATE TABLE IF NOT EXISTS controls (
  id int PRIMARY KEY DEFAULT 1,
  disable_execution boolean NOT NULL DEFAULT false,
  disable_http boolean NOT NULL DEFAULT false,
  disable_github boolean NOT NULL DEFAULT false,
  disable_stripe boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Insert default row (singleton pattern - only one row with id=1)
INSERT INTO controls (id, disable_execution, disable_http, disable_github, disable_stripe, updated_at)
VALUES (1, false, false, false, false, now())
ON CONFLICT (id) DO NOTHING;
