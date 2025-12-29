-- ============================================================================
-- SOURCE GOVERNANCE
-- ============================================================================
-- Adds tracking for source health, rate limiting, and circuit breaker functionality

-- Add source governance columns to sources table
ALTER TABLE sources
  ADD COLUMN IF NOT EXISTS last_success_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_failure_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failure_streak INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paused_until TIMESTAMPTZ;

-- Create index for filtering paused sources
CREATE INDEX IF NOT EXISTS idx_sources_paused_until ON sources(paused_until)
  WHERE paused_until IS NOT NULL;

-- Create index for enabled sources (common query pattern)
CREATE INDEX IF NOT EXISTS idx_sources_enabled ON sources(enabled)
  WHERE enabled = true;

