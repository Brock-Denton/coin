-- ============================================================================
-- CERTIFIED COMPS TABLE
-- ============================================================================
-- Stores parsed certified grade information from price points.
-- Enables using actual certified comps for expected graded value calculations.

CREATE TABLE IF NOT EXISTS certified_comps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  price_point_id UUID NOT NULL REFERENCES price_points(id) ON DELETE CASCADE,
  grader TEXT NOT NULL, -- PCGS, NGC, ANACS, etc.
  grade_text TEXT NOT NULL, -- Full grade string from listing (e.g., "MS65", "AU50", "VF Details")
  grade_prefix TEXT, -- MS, AU, XF, VF, etc.
  grade_numeric INTEGER, -- Numeric part (e.g., 65, 50, NULL if not numeric)
  details_flag BOOLEAN NOT NULL DEFAULT false, -- true if "Details" or "Questionable Color" designation
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_certified_comps_price_point_id 
  ON certified_comps(price_point_id);

CREATE INDEX IF NOT EXISTS idx_certified_comps_grader_grade 
  ON certified_comps(grader, grade_prefix, grade_numeric);

-- Optional: Add minimal is_certified flag to price_points for quick filtering
-- This allows queries to quickly filter certified comps without joining
ALTER TABLE price_points
  ADD COLUMN IF NOT EXISTS is_certified BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_price_points_is_certified 
  ON price_points(is_certified) 
  WHERE is_certified = true;

COMMENT ON TABLE certified_comps IS 'Parsed certified grade information from price points. Enables using actual certified comps for graded value calculations.';
COMMENT ON COLUMN certified_comps.grade_text IS 'Full grade string as it appeared in the listing (e.g., "MS65", "AU50", "VF Details").';
COMMENT ON COLUMN certified_comps.grade_prefix IS 'Grade prefix extracted from grade_text (MS, AU, XF, VF, F, VG, G, AG).';
COMMENT ON COLUMN certified_comps.grade_numeric IS 'Numeric part of grade (e.g., 65, 50, 60). NULL if grade is not numeric (e.g., "AU").';
COMMENT ON COLUMN certified_comps.details_flag IS 'True if listing indicated "Details", "Questionable Color", or similar designations.';
COMMENT ON COLUMN price_points.is_certified IS 'Quick flag to indicate if this price point has certified grade data. Updated via trigger or application logic.';

