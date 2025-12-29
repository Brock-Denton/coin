-- ============================================================================
-- UPSERT FUNCTIONS FOR ATOMIC OPERATIONS
-- ============================================================================
-- Creates PostgreSQL functions for atomic upsert operations that use ON CONFLICT

-- Function to upsert price_point with conflict resolution
CREATE OR REPLACE FUNCTION upsert_price_point(
  p_intake_id UUID,
  p_source_id UUID,
  p_dedupe_key TEXT,
  p_job_id UUID,
  p_price_cents INTEGER,
  p_price_type TEXT,
  p_raw_payload JSONB,
  p_listing_url TEXT,
  p_listing_title TEXT,
  p_listing_date TIMESTAMPTZ,
  p_observed_at TIMESTAMPTZ,
  p_match_strength DECIMAL(3,2),
  p_external_id TEXT,
  p_filtered_out BOOLEAN DEFAULT false
)
RETURNS UUID AS $$
DECLARE
  result_id UUID;
BEGIN
  INSERT INTO price_points (
    intake_id, source_id, dedupe_key, job_id, price_cents, price_type,
    raw_payload, listing_url, listing_title, listing_date, observed_at,
    match_strength, external_id, filtered_out
  ) VALUES (
    p_intake_id, p_source_id, p_dedupe_key, p_job_id, p_price_cents, p_price_type,
    p_raw_payload, p_listing_url, p_listing_title, p_listing_date, p_observed_at,
    p_match_strength, p_external_id, p_filtered_out
  )
  ON CONFLICT (intake_id, source_id, dedupe_key)
  DO UPDATE SET
    job_id = EXCLUDED.job_id,
    price_cents = EXCLUDED.price_cents,
    price_type = EXCLUDED.price_type,
    raw_payload = COALESCE(EXCLUDED.raw_payload, price_points.raw_payload),
    listing_url = EXCLUDED.listing_url,
    listing_title = EXCLUDED.listing_title,
    listing_date = EXCLUDED.listing_date,
    observed_at = EXCLUDED.observed_at,
    match_strength = CASE 
      WHEN EXCLUDED.match_strength > price_points.match_strength THEN EXCLUDED.match_strength
      ELSE price_points.match_strength
    END,
    external_id = COALESCE(EXCLUDED.external_id, price_points.external_id),
    filtered_out = EXCLUDED.filtered_out
  WHERE EXCLUDED.match_strength > price_points.match_strength
     OR (EXCLUDED.external_id IS NOT NULL AND price_points.external_id IS NULL)
     OR (EXCLUDED.raw_payload IS NOT NULL AND price_points.raw_payload IS NULL)
  RETURNING id INTO result_id;
  
  RETURN result_id;
END;
$$ LANGUAGE plpgsql;

-- Function to upsert valuation
CREATE OR REPLACE FUNCTION upsert_valuation(
  p_intake_id UUID,
  p_price_cents_p10 INTEGER,
  p_price_cents_p20 INTEGER,
  p_price_cents_p40 INTEGER,
  p_price_cents_median INTEGER,
  p_price_cents_p60 INTEGER,
  p_price_cents_p80 INTEGER,
  p_price_cents_p90 INTEGER,
  p_price_cents_mean INTEGER,
  p_confidence_score INTEGER,
  p_explanation TEXT,
  p_comp_count INTEGER,
  p_comp_sources_count INTEGER,
  p_sold_count INTEGER,
  p_ask_count INTEGER,
  p_metadata JSONB
)
RETURNS UUID AS $$
DECLARE
  result_id UUID;
BEGIN
  INSERT INTO valuations (
    intake_id, price_cents_p10, price_cents_p20, price_cents_p40,
    price_cents_median, price_cents_p60, price_cents_p80, price_cents_p90,
    price_cents_mean, confidence_score, explanation, comp_count,
    comp_sources_count, sold_count, ask_count, metadata
  ) VALUES (
    p_intake_id, p_price_cents_p10, p_price_cents_p20, p_price_cents_p40,
    p_price_cents_median, p_price_cents_p60, p_price_cents_p80, p_price_cents_p90,
    p_price_cents_mean, p_confidence_score, p_explanation, p_comp_count,
    p_comp_sources_count, p_sold_count, p_ask_count, p_metadata
  )
  ON CONFLICT (intake_id)
  DO UPDATE SET
    price_cents_p10 = EXCLUDED.price_cents_p10,
    price_cents_p20 = EXCLUDED.price_cents_p20,
    price_cents_p40 = EXCLUDED.price_cents_p40,
    price_cents_median = EXCLUDED.price_cents_median,
    price_cents_p60 = EXCLUDED.price_cents_p60,
    price_cents_p80 = EXCLUDED.price_cents_p80,
    price_cents_p90 = EXCLUDED.price_cents_p90,
    price_cents_mean = EXCLUDED.price_cents_mean,
    confidence_score = EXCLUDED.confidence_score,
    explanation = EXCLUDED.explanation,
    comp_count = EXCLUDED.comp_count,
    comp_sources_count = EXCLUDED.comp_sources_count,
    sold_count = EXCLUDED.sold_count,
    ask_count = EXCLUDED.ask_count,
    metadata = EXCLUDED.metadata,
    computed_at = NOW(),
    updated_at = NOW()
  RETURNING id INTO result_id;
  
  RETURN result_id;
END;
$$ LANGUAGE plpgsql;

