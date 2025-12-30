-- ============================================================================
-- UPDATE CLAIM_NEXT_PENDING_JOB FOR JOB_TYPE
-- ============================================================================
-- NEW MIGRATION (not modifying 011): Adds job_type parameter to claim_next_pending_job.
-- Allows filtering by job_type (grading vs pricing jobs).

-- Drop and recreate the function with job_type support
DROP FUNCTION IF EXISTS claim_next_pending_job(TEXT, INTEGER);

CREATE OR REPLACE FUNCTION claim_next_pending_job(
  p_worker_id TEXT,
  p_lock_timeout_seconds INTEGER DEFAULT 300,
  p_job_type TEXT DEFAULT NULL
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
  created_at TIMESTAMPTZ,
  job_type TEXT
) AS $$
DECLARE
  claimed_job RECORD;
  lock_timeout_interval INTERVAL;
BEGIN
  -- Convert seconds to interval
  lock_timeout_interval := (p_lock_timeout_seconds || ' seconds')::INTERVAL;
  
  -- Find and lock the oldest pending/retryable job (or stuck running job)
  -- Filter by job_type if provided (NULL means any type)
  -- Only claim jobs where next_run_at IS NULL OR next_run_at <= NOW()
  SELECT sj.* INTO claimed_job
  FROM scrape_jobs sj
  WHERE (
    (sj.status = 'pending' AND (sj.next_run_at IS NULL OR sj.next_run_at <= NOW()))
    OR (sj.status = 'retryable' AND (sj.next_retry_at IS NULL OR sj.next_retry_at <= NOW()))
    OR (
      sj.status = 'running' 
      AND (
        sj.heartbeat_at IS NULL 
        OR sj.heartbeat_at < NOW() - lock_timeout_interval
      )
    )
  )
  AND (p_job_type IS NULL OR sj.job_type = p_job_type) -- Filter by job_type if provided
  ORDER BY 
    CASE WHEN sj.status = 'pending' THEN 0 
         WHEN sj.status = 'retryable' THEN 1
         ELSE 2 END, -- Pending jobs first, then retryable, then stuck running
    sj.next_run_at ASC NULLS FIRST, -- Respect scheduled time
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
    COALESCE(scrape_jobs.retry_count, 0),
    COALESCE(scrape_jobs.attempts, 0),
    scrape_jobs.created_at,
    scrape_jobs.job_type
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
    claimed_job.created_at,
    claimed_job.job_type;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION claim_next_pending_job(TEXT, INTEGER, TEXT) IS 
  'Atomically claims the next pending/retryable job for a worker. Optional p_job_type parameter filters by job type (NULL = any type). Returns job details including job_type.';

