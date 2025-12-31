-- ============================================================================
-- FIX STUCK JOBS AND STATUS UPDATES
-- ============================================================================
-- Fix jobs that are stuck in 'running' state due to failed status updates
-- Also ensure any jobs with invalid status values are corrected

-- Fix jobs stuck in 'running' state that have been running too long (> 10 minutes)
-- and have no recent heartbeat (likely failed but status update failed)
UPDATE scrape_jobs
SET 
  status = 'failed',
  error_message = COALESCE(error_message, 'Job stuck in running state - likely failed but status update failed'),
  completed_at = NOW(),
  updated_at = NOW()
WHERE status = 'running'
  AND (
    -- No heartbeat for > 5 minutes (job is dead)
    (heartbeat_at IS NULL OR heartbeat_at < NOW() - INTERVAL '5 minutes')
    -- OR running for > 10 minutes (stuck)
    OR (started_at IS NOT NULL AND started_at < NOW() - INTERVAL '10 minutes')
  )
  AND completed_at IS NULL;

-- Fix any jobs with invalid status values (shouldn't happen, but just in case)
-- Map 'completed' to 'succeeded' if any exist
UPDATE scrape_jobs
SET 
  status = 'succeeded',
  updated_at = NOW()
WHERE status = 'completed';

-- Map 'cancelled' to 'failed' if any exist
UPDATE scrape_jobs
SET 
  status = 'failed',
  error_message = COALESCE(error_message, 'Job was cancelled'),
  updated_at = NOW()
WHERE status = 'cancelled';

COMMENT ON TABLE scrape_jobs IS 'Job queue for pricing and grading collection. Status must be: pending, running, succeeded, failed, or retryable.';
