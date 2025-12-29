-- ============================================================================
-- ADD KEYWORDS ARRAYS TO ATTRIBUTIONS
-- ============================================================================
-- Adds keywords_include and keywords_exclude as TEXT[] arrays (not comma-separated strings)
-- for structured keyword filtering in search queries and listing filters.

ALTER TABLE attributions
  ADD COLUMN IF NOT EXISTS keywords_include TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS keywords_exclude TEXT[] DEFAULT '{}';

-- Add indexes for array operations (GIN indexes for efficient array queries)
CREATE INDEX IF NOT EXISTS idx_attributions_keywords_include ON attributions USING GIN (keywords_include)
  WHERE keywords_include IS NOT NULL AND array_length(keywords_include, 1) > 0;

CREATE INDEX IF NOT EXISTS idx_attributions_keywords_exclude ON attributions USING GIN (keywords_exclude)
  WHERE keywords_exclude IS NOT NULL AND array_length(keywords_exclude, 1) > 0;

