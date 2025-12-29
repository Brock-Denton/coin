-- ============================================================================
-- IDEMPOTENCY AND DEDUPLICATION
-- ============================================================================
-- Adds external_id and dedupe_key for preventing duplicate price_points
-- Ensures one valuation per intake_id

-- Add external_id to price_points (for eBay item ID, etc.)
ALTER TABLE price_points
  ADD COLUMN IF NOT EXISTS external_id TEXT;

-- Add dedupe_key to price_points
-- This will be computed in application code and stored here
ALTER TABLE price_points
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

-- Create index on dedupe_key for faster lookups
CREATE INDEX IF NOT EXISTS idx_price_points_dedupe_key ON price_points(dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- Create unique constraint on (intake_id, source_id, dedupe_key)
-- This prevents duplicate price points for the same intake/source/dedupe_key
ALTER TABLE price_points
  DROP CONSTRAINT IF EXISTS price_points_intake_source_dedupe_unique;
  
ALTER TABLE price_points
  ADD CONSTRAINT price_points_intake_source_dedupe_unique
  UNIQUE (intake_id, source_id, dedupe_key);

-- Ensure valuations table has unique constraint on intake_id
ALTER TABLE valuations
  DROP CONSTRAINT IF EXISTS valuations_intake_id_unique;
  
ALTER TABLE valuations
  ADD CONSTRAINT valuations_intake_id_unique
  UNIQUE (intake_id);

-- Add index on external_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_price_points_external_id ON price_points(external_id)
  WHERE external_id IS NOT NULL;

