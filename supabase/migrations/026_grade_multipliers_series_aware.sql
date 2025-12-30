-- ============================================================================
-- GRADE MULTIPLIERS TABLE (SERIES-AWARE)
-- ============================================================================
-- Stores grade multipliers for converting raw coin values to graded values.
-- Supports denomination + series overrides for accurate pricing per coin type.

CREATE TABLE IF NOT EXISTS grade_multipliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bucket TEXT NOT NULL, -- Grade bucket: AG, G, VG, F, VF, XF, AU, MS, MS60-MS67
  multiplier NUMERIC(5,2) NOT NULL CHECK (multiplier > 0),
  version TEXT NOT NULL DEFAULT 'baseline_v1',
  denomination TEXT, -- penny, nickel, dime, quarter, half_dollar, dollar
  series TEXT, -- e.g., Morgan Dollar, Peace Dollar, Washington Quarter
  year_min INTEGER, -- Optional year range start
  year_max INTEGER, -- Optional year range end
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(bucket, version, denomination, series, year_min, year_max)
);

CREATE INDEX IF NOT EXISTS idx_grade_multipliers_lookup 
  ON grade_multipliers(denomination, series, version, enabled);

CREATE INDEX IF NOT EXISTS idx_grade_multipliers_bucket_version 
  ON grade_multipliers(bucket, version, enabled);

-- Add updated_at trigger
CREATE TRIGGER set_updated_at_grade_multipliers
BEFORE UPDATE ON grade_multipliers
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SEED BASELINE V1 GENERIC MULTIPLIERS
-- ============================================================================
-- Generic multipliers (denomination=NULL, series=NULL) apply to all coin types
-- These are fallback values when no specific override exists

INSERT INTO grade_multipliers (bucket, multiplier, version, denomination, series, enabled) VALUES
  ('AG', 1.0, 'baseline_v1', NULL, NULL, true),
  ('G', 1.1, 'baseline_v1', NULL, NULL, true),
  ('VG', 1.2, 'baseline_v1', NULL, NULL, true),
  ('F', 1.3, 'baseline_v1', NULL, NULL, true),
  ('VF', 1.5, 'baseline_v1', NULL, NULL, true),
  ('XF', 1.8, 'baseline_v1', NULL, NULL, true),
  ('AU', 2.2, 'baseline_v1', NULL, NULL, true),
  ('MS', 3.0, 'baseline_v1', NULL, NULL, true),
  -- MS sub-buckets with finer multipliers
  ('MS60', 2.5, 'baseline_v1', NULL, NULL, true),
  ('MS61', 2.6, 'baseline_v1', NULL, NULL, true),
  ('MS62', 2.7, 'baseline_v1', NULL, NULL, true),
  ('MS63', 2.9, 'baseline_v1', NULL, NULL, true),
  ('MS64', 3.2, 'baseline_v1', NULL, NULL, true),
  ('MS65', 3.8, 'baseline_v1', NULL, NULL, true),
  ('MS66', 4.5, 'baseline_v1', NULL, NULL, true),
  ('MS67', 5.5, 'baseline_v1', NULL, NULL, true)
ON CONFLICT (bucket, version, denomination, series, year_min, year_max) DO NOTHING;

COMMENT ON TABLE grade_multipliers IS 'Grade multipliers for converting raw coin values to graded values. Supports denomination + series overrides.';
COMMENT ON COLUMN grade_multipliers.bucket IS 'Grade bucket: AG, G, VG, F, VF, XF, AU, MS, or MS60-MS67.';
COMMENT ON COLUMN grade_multipliers.multiplier IS 'Multiplier to apply to raw value. Example: 2.2 means a raw coin worth $100 becomes $220 at AU grade.';
COMMENT ON COLUMN grade_multipliers.denomination IS 'Optional denomination filter (penny, nickel, dime, quarter, half_dollar, dollar). NULL means applies to all denominations.';
COMMENT ON COLUMN grade_multipliers.series IS 'Optional series filter (e.g., Morgan Dollar, Peace Dollar). NULL means applies to all series within denomination.';
COMMENT ON COLUMN grade_multipliers.version IS 'Model version identifier (e.g., baseline_v1). Allows updating multipliers without breaking existing data.';

