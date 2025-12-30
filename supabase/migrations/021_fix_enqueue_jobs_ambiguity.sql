-- ============================================================================
-- FIX ENQUEUE_JOBS FUNCTION (ensure no ambiguous column references)
-- ============================================================================
-- This migration ensures the enqueue_jobs function is correctly defined
-- and fixes any potential column reference ambiguity issues.

-- Drop and recreate the function to ensure it's correct
DROP FUNCTION IF EXISTS enqueue_jobs(UUID, UUID[], INTEGER, INTEGER);

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
  rows_inserted INTEGER;
BEGIN
  -- Get attribution data for query_params
  SELECT * INTO attribution_record
  FROM attributions
  WHERE intake_id = p_intake_id
  LIMIT 1;
  
  -- Build query_params from attribution (handle NULL attribution gracefully)
  IF attribution_record.id IS NULL THEN
    query_params_json := jsonb_build_object(
      'intake_id', p_intake_id::TEXT,
      'keywords_include', '{}'::TEXT[],
      'keywords_exclude', '{}'::TEXT[]
    );
  ELSE
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
  END IF;
  
  -- Iterate through source_ids and insert jobs with staggered next_run_at
  FOREACH v_source_id IN ARRAY p_source_ids
  LOOP
    BEGIN
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
      
      -- Check if row was inserted (ROW_COUNT is 1 if inserted, 0 if conflict)
      GET DIAGNOSTICS rows_inserted = ROW_COUNT;
      IF rows_inserted > 0 THEN
        inserted_count := inserted_count + 1;
      END IF;
      
    EXCEPTION
      WHEN OTHERS THEN
        -- Log error but continue with next source
        RAISE WARNING 'Error inserting job for intake % and source %: %', p_intake_id, v_source_id, SQLERRM;
    END;
    
    job_index := job_index + 1;
  END LOOP;
  
  RETURN inserted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION enqueue_jobs(UUID, UUID[], INTEGER, INTEGER) IS 
  'Enqueues pricing jobs for a given intake and source IDs with staggered scheduling. Returns count of jobs inserted.';

