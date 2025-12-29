-- ============================================================================
-- JOB HEARTBEAT AND RECOVERY
-- ============================================================================
-- Adds heartbeat mechanism for job monitoring and stuck job recovery

-- Add heartbeat_at column to track worker activity
ALTER TABLE scrape_jobs
  ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMPTZ;

-- Add attempts and last_error for retry tracking
ALTER TABLE scrape_jobs
  ADD COLUMN IF NOT EXISTS attempts INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error TEXT;

-- Ensure next_retry_at exists (may already exist from 007)
ALTER TABLE scrape_jobs
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;

-- Create index for heartbeat-based queries
CREATE INDEX IF NOT EXISTS idx_scrape_jobs_heartbeat_at ON scrape_jobs(heartbeat_at) 
  WHERE status = 'running';

-- Update claim_next_pending_job function to use heartbeat_at and JOB_LOCK_TIMEOUT_SECONDS
CREATE OR REPLACE FUNCTION claim_next_pending_job(
  p_worker_id TEXT,
  p_lock_timeout_seconds INTEGER DEFAULT 300
)
RETURNS TABLE (
  id UUID,
  intake_id UUID,
  source_id UUID,
  status TEXT,
  query_params JSONB,
  locked_by TEXT,
  locked_at TIMESTAMPTZ,
  heartbeat_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  retry_count INTEGER,
  attempts INTEGER,
  created_at TIMESTAMPTZ
) AS $$
DECLARE
  claimed_job RECORD;
  lock_timeout_interval INTERVAL;
BEGIN
  -- Convert seconds to interval
  lock_timeout_interval := (p_lock_timeout_seconds || ' seconds')::INTERVAL;
  
  -- Find and lock the oldest pending job (or retryable job that's ready)
  -- Also check for stuck running jobs (no heartbeat within timeout)
  SELECT sj.* INTO claimed_job
  FROM scrape_jobs sj
  WHERE (
    sj.status = 'pending' 
    OR (sj.status = 'retryable' AND (sj.next_retry_at IS NULL OR sj.next_retry_at <= NOW()))
    OR (
      sj.status = 'running' 
      AND (
        sj.heartbeat_at IS NULL 
        OR sj.heartbeat_at < NOW() - lock_timeout_interval
      )
    )
  )
  ORDER BY 
    CASE WHEN sj.status = 'pending' THEN 0 ELSE 1 END, -- Pending jobs first
    sj.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;
  
  IF claimed_job.id IS NULL THEN
    RETURN;
  END IF;
  
  -- Atomically update to running with heartbeat
  UPDATE scrape_jobs
  SET 
    status = 'running',
    locked_by = p_worker_id,
    locked_at = NOW(),
    heartbeat_at = NOW(),
    started_at = COALESCE(started_at, NOW()),
    updated_at = NOW()
  WHERE id = claimed_job.id
  AND (
    status IN ('pending', 'retryable')
    OR (
      status = 'running' 
      AND (
        heartbeat_at IS NULL 
        OR heartbeat_at < NOW() - lock_timeout_interval
      )
    )
  )
  RETURNING 
    scrape_jobs.id,
    scrape_jobs.intake_id,
    scrape_jobs.source_id,
    scrape_jobs.status,
    scrape_jobs.query_params,
    scrape_jobs.locked_by,
    scrape_jobs.locked_at,
    scrape_jobs.heartbeat_at,
    scrape_jobs.started_at,
    scrape_jobs.retry_count,
    scrape_jobs.attempts,
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
    claimed_job.heartbeat_at,
    claimed_job.started_at,
    COALESCE(claimed_job.retry_count, 0),
    COALESCE(claimed_job.attempts, 0),
    claimed_job.created_at;
END;
$$ LANGUAGE plpgsql;

-- Function to update job heartbeat
CREATE OR REPLACE FUNCTION update_job_heartbeat(p_job_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE scrape_jobs
  SET 
    heartbeat_at = NOW(),
    updated_at = NOW()
  WHERE id = p_job_id
  AND status = 'running';
END;
$$ LANGUAGE plpgsql;

-- Function to reclaim stuck jobs (finds jobs with no heartbeat within timeout)
CREATE OR REPLACE FUNCTION reclaim_stuck_jobs(p_lock_timeout_seconds INTEGER DEFAULT 300)
RETURNS INTEGER AS $$
DECLARE
  reclaimed_count INTEGER;
  lock_timeout_interval INTERVAL;
BEGIN
  lock_timeout_interval := (p_lock_timeout_seconds || ' seconds')::INTERVAL;
  
  -- Reset stuck jobs back to pending
  WITH stuck_jobs AS (
    SELECT id, locked_by, attempts
    FROM scrape_jobs
    WHERE status = 'running'
    AND (
      heartbeat_at IS NULL 
      OR heartbeat_at < NOW() - lock_timeout_interval
    )
  )
  UPDATE scrape_jobs sj
  SET 
    status = 'pending',
    locked_by = NULL,
    locked_at = NULL,
    heartbeat_at = NULL,
    attempts = COALESCE(sj.attempts, 0) + 1,
    last_error = COALESCE(sj.last_error, '') || E'\nReclaimed due to missing heartbeat',
    updated_at = NOW()
  FROM stuck_jobs st
  WHERE sj.id = st.id;
  
  GET DIAGNOSTICS reclaimed_count = ROW_COUNT;
  RETURN reclaimed_count;
END;
$$ LANGUAGE plpgsql;

