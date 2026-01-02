-- ============================================================================
-- FIX CLAIM_NEXT_PENDING_JOB STARTED_AT AMBIGUITY
-- ============================================================================
-- Fix ambiguous column reference for started_at by fully qualifying it.

CREATE OR REPLACE FUNCTION public.claim_next_pending_job(
  p_worker_id text,
  p_lock_timeout_seconds int,
  p_job_type text
)
RETURNS TABLE (
  id uuid,
  intake_id uuid,
  source_id uuid,
  worker_id text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  job_type text,
  next_retry_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  job record;
BEGIN
  SELECT *
  INTO job
  FROM public.scrape_jobs sj
  WHERE sj.status = 'pending'
    AND sj.job_type = p_job_type
    AND (sj.next_retry_at IS NULL OR sj.next_retry_at <= now())
  ORDER BY sj.created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public.scrape_jobs
  SET
    worker_id = p_worker_id,
    status = 'in_progress',
    started_at = COALESCE(public.scrape_jobs.started_at, NOW()),
    updated_at = NOW()
  WHERE public.scrape_jobs.id = job.id;

  RETURN QUERY
  SELECT
    sj.id, sj.intake_id, sj.source_id, sj.worker_id, sj.status,
    sj.created_at, sj.updated_at, sj.started_at, sj.completed_at,
    sj.job_type, sj.next_retry_at
  FROM public.scrape_jobs sj
  WHERE sj.id = job.id;
END;
$$;
