-- Migration: 008_claim_constraints
-- Purpose: Add database constraints to enforce claim invariants
--
-- Invariants:
-- 1. If claim_id is set, claim_expires_at must also be set
-- 2. If claim_expires_at is set, claimed_at must also be set
--
-- These constraints provide defense-in-depth for the atomic claim logic.

-- Constraint: claim_id requires claim_expires_at (idempotent, safe on retries)
DO $$
BEGIN
  BEGIN
    ALTER TABLE public.receipts ADD CONSTRAINT claim_requires_expiry
      CHECK (claim_id IS NULL OR claim_expires_at IS NOT NULL);
  EXCEPTION
    WHEN duplicate_object THEN
      -- already exists
      NULL;
  END;
END$$;

-- Constraint: claim_expires_at requires claimed_at (idempotent, safe on retries)
DO $$
BEGIN
  BEGIN
    ALTER TABLE public.receipts ADD CONSTRAINT expiry_requires_claimed_at
      CHECK (claim_expires_at IS NULL OR claimed_at IS NOT NULL);
  EXCEPTION
    WHEN duplicate_object THEN
      -- already exists
      NULL;
  END;
END$$;

-- Add index for efficient lookup of unclaimed or expired claims
CREATE INDEX IF NOT EXISTS idx_receipts_claimable
  ON receipts (status, claim_expires_at)
  WHERE status = 'pending';
