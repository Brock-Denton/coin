-- ============================================================================
-- HARDEN JOB SAFETY AND THROUGHPUT
-- ============================================================================

-- Update scrape_jobs to use clearer states: pending, running, succeeded, failed, retryable
-- First migrate existing data
UPDATE scrape_jobs SET status = 'succeeded' WHERE status = 'completed';
UPDATE scrape_jobs SET status = 'failed' WHERE status = 'cancelled';

-- Drop old constraint and add new one
ALTER TABLE scrape_jobs 
  DROP CONSTRAINT IF EXISTS scrape_jobs_status_check;

ALTER TABLE scrape_jobs
  ADD CONSTRAINT scrape_jobs_status_check 
  CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'retryable'));

-- Add retry_count and next_retry_at for exponential backoff
ALTER TABLE scrape_jobs
  ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;

-- Add observed_at to price_points for better indexing
ALTER TABLE price_points
  ADD COLUMN IF NOT EXISTS observed_at TIMESTAMPTZ DEFAULT NOW();

-- Update existing price_points to set observed_at from listing_date or created_at
UPDATE price_points
SET observed_at = COALESCE(listing_date, created_at)
WHERE observed_at IS NULL;

-- Add match_strength to price_points (0.0 to 1.0) for quality weighting
ALTER TABLE price_points
  ADD COLUMN IF NOT EXISTS match_strength DECIMAL(3,2) DEFAULT 1.0 
  CHECK (match_strength >= 0 AND match_strength <= 1.0);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_scrape_jobs_status_created_at ON scrape_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_scrape_jobs_retryable ON scrape_jobs(status, next_retry_at) 
  WHERE status = 'retryable';
CREATE INDEX IF NOT EXISTS idx_price_points_intake_observed ON price_points(intake_id, observed_at);
CREATE INDEX IF NOT EXISTS idx_price_points_match_strength ON price_points(match_strength) 
  WHERE match_strength IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_valuations_intake_created ON valuations(intake_id, created_at);

-- Function for atomic job claim (single-step update from pending to running)
CREATE OR REPLACE FUNCTION claim_next_pending_job(worker_id TEXT, max_age_minutes INTEGER DEFAULT 30)
RETURNS TABLE (
  id UUID,
  intake_id UUID,
  source_id UUID,
  status TEXT,
  query_params JSONB,
  locked_by TEXT,
  locked_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  retry_count INTEGER,
  created_at TIMESTAMPTZ
) AS $$
DECLARE
  claimed_job RECORD;
BEGIN
  -- Find and lock the oldest pending job (or retryable job that's ready)
  SELECT sj.* INTO claimed_job
  FROM scrape_jobs sj
  WHERE (
    sj.status = 'pending' 
    OR (sj.status = 'retryable' AND (sj.next_retry_at IS NULL OR sj.next_retry_at <= NOW()))
  )
  AND (sj.locked_at IS NULL OR sj.locked_at < NOW() - INTERVAL '1 hour') -- Stale locks
  ORDER BY 
    CASE WHEN sj.status = 'pending' THEN 0 ELSE 1 END, -- Pending jobs first
    sj.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;
  
  IF claimed_job.id IS NULL THEN
    RETURN;
  END IF;
  
  -- Atomically update to running
  UPDATE scrape_jobs
  SET 
    status = 'running',
    locked_by = worker_id,
    locked_at = NOW(),
    started_at = COALESCE(started_at, NOW()),
    updated_at = NOW()
  WHERE id = claimed_job.id
  AND status IN ('pending', 'retryable') -- Only claim if still in claimable state
  RETURNING 
    scrape_jobs.id,
    scrape_jobs.intake_id,
    scrape_jobs.source_id,
    scrape_jobs.status,
    scrape_jobs.query_params,
    scrape_jobs.locked_by,
    scrape_jobs.locked_at,
    scrape_jobs.started_at,
    scrape_jobs.retry_count,
    scrape_jobs.created_at
  INTO claimed_job;
  
  -- Return the claimed job
  RETURN QUERY SELECT 
    claimed_job.id,
    claimed_job.intake_id,
    claimed_job.source_id,
    claimed_job.status,
    claimed_job.query_params,
    claimed_job.locked_by,
    claimed_job.locked_at,
    claimed_job.started_at,
    claimed_job.retry_count,
    claimed_job.created_at;
END;
$$ LANGUAGE plpgsql;

-- Function to mark job as retryable with exponential backoff
CREATE OR REPLACE FUNCTION mark_job_retryable(job_id UUID, base_delay_minutes INTEGER DEFAULT 5)
RETURNS VOID AS $$
DECLARE
  current_retry_count INTEGER;
  delay_minutes INTEGER;
BEGIN
  -- Get current retry count
  SELECT retry_count INTO current_retry_count
  FROM scrape_jobs
  WHERE id = job_id;
  
  -- Calculate exponential backoff: base_delay * 2^retry_count
  delay_minutes := base_delay_minutes * POWER(2, COALESCE(current_retry_count, 0));
  
  -- Cap at 24 hours
  IF delay_minutes > 1440 THEN
    delay_minutes := 1440;
  END IF;
  
  -- Update job
  UPDATE scrape_jobs
  SET 
    status = 'retryable',
    retry_count = COALESCE(retry_count, 0) + 1,
    next_retry_at = NOW() + (delay_minutes || ' minutes')::INTERVAL,
    locked_by = NULL,
    locked_at = NULL,
    error_message = COALESCE(error_message, 'Job marked for retry'),
    updated_at = NOW()
  WHERE id = job_id;
END;
$$ LANGUAGE plpgsql;

