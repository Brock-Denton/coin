-- ============================================================================
-- ADD INTAKE METADATA
-- ============================================================================
-- Adds listed_at and sold_at timestamps to coin_intakes table for tracking
-- inventory status.

ALTER TABLE coin_intakes
  ADD COLUMN IF NOT EXISTS listed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sold_at TIMESTAMPTZ;


