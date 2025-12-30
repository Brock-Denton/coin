-- ============================================================================
-- GRADE ESTIMATES TABLE
-- ============================================================================
-- Stores AI model grade estimates for coin intakes.
-- Supports multiple model versions for future improvements.

CREATE TABLE IF NOT EXISTS grade_estimates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  intake_id UUID NOT NULL REFERENCES coin_intakes(id) ON DELETE CASCADE,
  model_version TEXT NOT NULL DEFAULT 'baseline_v1',
  grade_bucket TEXT NOT NULL, -- Most likely bucket (AG, G, VG, F, VF, XF, AU, MS)
  grade_distribution JSONB NOT NULL, -- Probability distribution across grade buckets
  details_risk JSONB NOT NULL, -- Risk flags with probabilities (cleaned, scratches, etc.)
  confidence NUMERIC(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1.0),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(intake_id, model_version)
);

CREATE INDEX IF NOT EXISTS idx_grade_estimates_intake_id ON grade_estimates(intake_id);
CREATE INDEX IF NOT EXISTS idx_grade_estimates_model_version ON grade_estimates(model_version);

-- Add updated_at trigger
CREATE TRIGGER set_updated_at_grade_estimates
BEFORE UPDATE ON grade_estimates
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE grade_estimates IS 'AI model grade estimates for coin intakes. Supports multiple model versions.';
COMMENT ON COLUMN grade_estimates.grade_bucket IS 'Most likely grade bucket (AG, G, VG, F, VF, XF, AU, MS).';
COMMENT ON COLUMN grade_estimates.grade_distribution IS 'JSONB probability distribution: {"AG": 0.0, "G": 0.0, "VG": 0.0, "F": 0.05, "VF": 0.1, "XF": 0.2, "AU": 0.3, "MS": 0.35}.';
COMMENT ON COLUMN grade_estimates.details_risk IS 'JSONB risk flags: {"cleaned": 0.3, "scratches": 0.2, "corrosion": 0.05, "damage": 0.1, "pvc": 0.0, "environmental": 0.15, "questionable_color": 0.1}.';
COMMENT ON COLUMN grade_estimates.confidence IS 'Confidence score 0.0 to 1.0 based on image quality and analysis certainty.';

