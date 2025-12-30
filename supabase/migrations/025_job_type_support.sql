-- ============================================================================
-- JOB TYPE SUPPORT
-- ============================================================================
-- Adds job_type column to scrape_jobs to support different job types (pricing, grading).
-- Updates unique index to include job_type for proper duplicate prevention.

-- Add job_type column (default 'pricing' for backward compatibility)
ALTER TABLE scrape_jobs
  ADD COLUMN IF NOT EXISTS job_type TEXT NOT NULL DEFAULT 'pricing';

-- Drop existing unique index (created in migration 015)
DROP INDEX IF EXISTS idx_scrape_jobs_pending_unique;

-- Recreate unique index with EXACT specification: (intake_id, source_id, job_type) WHERE status='pending'
-- NO extra columns - exactly as specified
CREATE UNIQUE INDEX idx_scrape_jobs_pending_unique
  ON scrape_jobs(intake_id, source_id, job_type)
  WHERE status = 'pending';

-- Add indexes for job_type filtering
CREATE INDEX IF NOT EXISTS idx_scrape_jobs_job_type_status 
  ON scrape_jobs(job_type, status);

CREATE INDEX IF NOT EXISTS idx_scrape_jobs_job_type_next_run_at 
  ON scrape_jobs(job_type, next_run_at) 
  WHERE next_run_at IS NOT NULL;

COMMENT ON COLUMN scrape_jobs.job_type IS 'Type of job: pricing (default) or grading. Used to differentiate job queues.';

