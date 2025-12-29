-- ============================================================================
-- ENHANCE VALUATIONS WITH PRICE BANDS
-- ============================================================================

-- Add price band columns to valuations table
ALTER TABLE valuations
  ADD COLUMN IF NOT EXISTS price_cents_p20 INTEGER, -- quick_sale (20th percentile)
  ADD COLUMN IF NOT EXISTS price_cents_p40 INTEGER, -- fair_low (40th percentile)
  ADD COLUMN IF NOT EXISTS price_cents_p60 INTEGER, -- fair_high (60th percentile)
  ADD COLUMN IF NOT EXISTS price_cents_p80 INTEGER; -- premium (80th percentile)

-- Add comments for clarity
COMMENT ON COLUMN valuations.price_cents_p20 IS 'Quick sale price (20th percentile)';
COMMENT ON COLUMN valuations.price_cents_p40 IS 'Fair market low (40th percentile)';
COMMENT ON COLUMN valuations.price_cents_median IS 'Fair market mid (50th percentile / median)';
COMMENT ON COLUMN valuations.price_cents_p60 IS 'Fair market high (60th percentile)';
COMMENT ON COLUMN valuations.price_cents_p80 IS 'Premium price (80th percentile)';

