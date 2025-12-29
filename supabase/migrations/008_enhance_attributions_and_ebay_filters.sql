-- ============================================================================
-- ENHANCE ATTRIBUTIONS WITH CONDITION FLAGS AND MINTMARK NORMALIZATION
-- ============================================================================

-- Add condition flags to attributions
ALTER TABLE attributions
  ADD COLUMN IF NOT EXISTS cleaned BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS scratches BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS rim_damage BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS details_damaged BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS harsh_cleaning BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS toning BOOLEAN DEFAULT false;

-- Function to normalize mintmark (P, D, S, O, CC, W, C, etc.)
CREATE OR REPLACE FUNCTION normalize_mintmark(mark TEXT)
RETURNS TEXT AS $$
BEGIN
  IF mark IS NULL OR mark = '' THEN
    RETURN NULL;
  END IF;
  
  -- Normalize to uppercase and trim
  mark := UPPER(TRIM(mark));
  
  -- Common variations
  CASE mark
    WHEN 'P', 'PHILADELPHIA', 'PHIL', 'NO MINT MARK', 'NONE' THEN RETURN 'P';
    WHEN 'D', 'DENVER' THEN RETURN 'D';
    WHEN 'S', 'SAN FRANCISCO' THEN RETURN 'S';
    WHEN 'O', 'NEW ORLEANS' THEN RETURN 'O';
    WHEN 'CC', 'CARSON CITY' THEN RETURN 'CC';
    WHEN 'W', 'WEST POINT' THEN RETURN 'W';
    WHEN 'C', 'CHARLOTTE' THEN RETURN 'C';
    ELSE RETURN mark; -- Return as-is if not recognized
  END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Add normalized_mintmark column
ALTER TABLE attributions
  ADD COLUMN IF NOT EXISTS normalized_mintmark TEXT;

-- Populate normalized_mintmark for existing records
UPDATE attributions
SET normalized_mintmark = normalize_mintmark(mintmark)
WHERE normalized_mintmark IS NULL;

-- Create index on normalized_mintmark for faster queries
CREATE INDEX IF NOT EXISTS idx_attributions_normalized_mintmark ON attributions(normalized_mintmark);

-- ============================================================================
-- ENHANCE SOURCE RULES WITH STRONGER EBAY FILTERS
-- ============================================================================

-- Insert additional exclude keywords for eBay (if not already present)
INSERT INTO source_rules (source_id, rule_type, rule_value, priority, active)
SELECT id, 'exclude_keywords', rule_value, 1, true
FROM sources,
(VALUES 
  ('replica'), ('copy'), ('plated'), ('clad over'), ('souvenir'), ('token'), 
  ('lot'), ('roll'), ('cleaned'), ('damaged'), ('ex-jewelry'), ('pendant'), 
  ('bezel'), ('jewelry'), ('damage'), ('scratched'), ('fake'), ('reproduction'), 
  ('duplicate'), ('altered'), ('whizzed'), ('environmental damage')
) AS keywords(rule_value)
WHERE name = 'eBay Sold Listings'
AND NOT EXISTS (
  SELECT 1 FROM source_rules sr 
  WHERE sr.source_id = sources.id 
  AND sr.rule_type = 'exclude_keywords' 
  AND sr.rule_value = keywords.rule_value
);

