-- ============================================================================
-- JOB ENQUEUE AND DUPLICATE PREVENTION
-- ============================================================================
-- Adds next_run_at for staggered scheduling, prevents duplicate pending jobs,
-- and provides atomic job enqueueing with bounded per-call staggering.

-- Add next_run_at column for staggered job scheduling
ALTER TABLE scrape_jobs
  ADD COLUMN IF NOT EXISTS next_run_at TIMESTAMPTZ;

-- Ensure completed_at exists (should already exist from 001_init.sql, but verify)
ALTER TABLE scrape_jobs
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Partial unique index to prevent duplicate PENDING jobs only
-- This allows multiple running jobs but prevents duplicate pending jobs
CREATE UNIQUE INDEX IF NOT EXISTS idx_scrape_jobs_pending_unique
  ON scrape_jobs(intake_id, source_id)
  WHERE status = 'pending';

-- Update claim_next_pending_job to respect next_run_at
-- Only claim jobs where next_run_at IS NULL OR next_run_at <= NOW()
-- Order by next_run_at ASC NULLS FIRST, created_at ASC
-- Drop existing function first to allow return type changes
DROP FUNCTION IF EXISTS claim_next_pending_job(TEXT, INTEGER);

CREATE FUNCTION claim_next_pending_job(
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
  
  -- Find and lock the oldest pending/retryable job (or stuck running job)
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

-- RPC function to enqueue jobs with bounded per-call staggering
-- Uses base_delay_seconds + stagger_seconds * i for deterministic staggering within the call
CREATE OR REPLACE FUNCTION enqueue_jobs(
  p_intake_id UUID,
  p_source_ids UUID[],
  p_base_delay_seconds INTEGER DEFAULT 0,
  p_stagger_seconds INTEGER DEFAULT 2
)
RETURNS INTEGER AS $$
DECLARE
  v_source_id UUID;
  job_index INTEGER := 0;
  inserted_count INTEGER := 0;
  attribution_record RECORD;
  query_params_json JSONB;
BEGIN
  -- Get attribution data for query_params
  SELECT * INTO attribution_record
  FROM attributions
  WHERE intake_id = p_intake_id
  LIMIT 1;
  
  -- Build query_params from attribution
  query_params_json := jsonb_build_object(
    'year', attribution_record.year,
    'mintmark', attribution_record.mintmark,
    'denomination', attribution_record.denomination,
    'series', attribution_record.series,
    'title', attribution_record.title,
    'intake_id', p_intake_id::TEXT,
    'keywords_include', COALESCE(attribution_record.keywords_include, '{}'::TEXT[]),
    'keywords_exclude', COALESCE(attribution_record.keywords_exclude, '{}'::TEXT[])
  );
  
  -- Iterate through source_ids and insert jobs with staggered next_run_at
  FOREACH v_source_id IN ARRAY p_source_ids
  LOOP
    INSERT INTO scrape_jobs (
      intake_id,
      source_id,
      status,
      query_params,
      next_run_at
    ) VALUES (
      p_intake_id,
      v_source_id,
      'pending',
      query_params_json,
      NOW() + make_interval(secs => p_base_delay_seconds + (p_stagger_seconds * job_index))
    )
    ON CONFLICT (intake_id, source_id) 
    WHERE status = 'pending' 
    DO NOTHING; -- Prevent duplicate pending jobs via partial unique index
    
    -- Count inserted rows (ON CONFLICT DO NOTHING returns 0 for conflicts)
    IF FOUND THEN
      inserted_count := inserted_count + 1;
    END IF;
    
    job_index := job_index + 1;
  END LOOP;
  
  RETURN inserted_count;
END;
$$ LANGUAGE plpgsql;

-- Update mark_job_retryable to NOT set completed_at (retryable is not terminal)
-- Ensure it sets next_retry_at, attempts, last_error appropriately
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
  
  -- Update job - do NOT set completed_at (retryable is not a terminal state)
  UPDATE scrape_jobs
  SET 
    status = 'retryable',
    retry_count = COALESCE(retry_count, 0) + 1,
    next_retry_at = NOW() + (delay_minutes || ' minutes')::INTERVAL,
    attempts = COALESCE(attempts, 0) + 1,
    last_error = COALESCE(error_message, 'Job marked for retry'),
    locked_by = NULL,
    locked_at = NULL,
    heartbeat_at = NULL,
    error_message = COALESCE(error_message, 'Job marked for retry'),
    updated_at = NOW()
    -- Explicitly do NOT set completed_at
  WHERE id = job_id;
END;
$$ LANGUAGE plpgsql;

