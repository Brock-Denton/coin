-- ============================================================================
-- ENQUEUE GRADING JOB RPC
-- ============================================================================
-- Creates a new RPC function to enqueue grading jobs.
-- Looks up Internal Grader source_id and calls enqueue_jobs with job_type='grading'.

CREATE OR REPLACE FUNCTION enqueue_grading_job(
  p_intake_id UUID
)
RETURNS INTEGER AS $$
DECLARE
  v_internal_grader_source_id UUID;
  v_count INTEGER;
BEGIN
  -- Lookup Internal Grader source_id by name WHERE adapter_type = 'internal_grader'
  SELECT id INTO v_internal_grader_source_id
  FROM sources
  WHERE name = 'Internal Grader'
    AND adapter_type = 'internal_grader'
    AND enabled = true
  LIMIT 1;
  
  -- Error if Internal Grader source not found
  IF v_internal_grader_source_id IS NULL THEN
    RAISE EXCEPTION 'Internal Grader source not found or not enabled. Ensure migration 022 has been run.';
  END IF;
  
  -- Call enqueue_jobs with Internal Grader source_id and job_type='grading'
  -- Single source, no staggering needed (base_delay=0, stagger=0)
  SELECT enqueue_jobs(
    p_intake_id := p_intake_id,
    p_source_ids := ARRAY[v_internal_grader_source_id],
    p_base_delay_seconds := 0,
    p_stagger_seconds := 0,
    p_job_type := 'grading'
  ) INTO v_count;
  
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION enqueue_grading_job(UUID) IS 
  'Enqueues a grading job for the given intake. Looks up Internal Grader source and creates a pending job with job_type=''grading''. Returns count of jobs inserted (0 or 1).';

