-- ============================================================================
-- GRADING RECOMMENDATIONS TABLE
-- ============================================================================
-- Stores ROI calculations and recommendations for each grading service.
-- Helps users decide whether to submit for grading or sell raw.

CREATE TABLE IF NOT EXISTS grading_recommendations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  intake_id UUID NOT NULL REFERENCES coin_intakes(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES grading_services(id) ON DELETE CASCADE,
  ship_policy_id UUID REFERENCES grading_ship_policies(id),
  expected_raw_value_cents INTEGER NOT NULL,
  expected_graded_value_cents INTEGER NOT NULL,
  total_cost_cents INTEGER NOT NULL,
  expected_profit_cents INTEGER NOT NULL,
  recommendation TEXT NOT NULL CHECK (recommendation IN ('sell_raw', 'submit_for_grading', 'needs_better_photos', 'high_details_risk')),
  breakdown JSONB NOT NULL DEFAULT '{}'::jsonb, -- Method used, comp counts, fallback decisions, etc.
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grading_recommendations_intake_id ON grading_recommendations(intake_id);
CREATE INDEX IF NOT EXISTS idx_grading_recommendations_service_id ON grading_recommendations(service_id);
CREATE INDEX IF NOT EXISTS idx_grading_recommendations_recommendation ON grading_recommendations(recommendation);

-- Add updated_at trigger
CREATE TRIGGER set_updated_at_grading_recommendations
BEFORE UPDATE ON grading_recommendations
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE grading_recommendations IS 'ROI calculations and recommendations for each grading service per coin intake.';
COMMENT ON COLUMN grading_recommendations.expected_profit_cents IS 'Expected profit = expected_graded_value - total_cost - expected_raw_value.';
COMMENT ON COLUMN grading_recommendations.recommendation IS 'Recommendation: sell_raw, submit_for_grading, needs_better_photos, or high_details_risk.';
COMMENT ON COLUMN grading_recommendations.breakdown IS 'JSONB breakdown: method_used, certified_comps_total, bucket_methods, bucket_comps_counts, multiplier_version, multiplier_lookup_path.';

