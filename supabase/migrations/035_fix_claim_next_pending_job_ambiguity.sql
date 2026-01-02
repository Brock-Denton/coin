-- ============================================================================
-- FIX CLAIM_NEXT_PENDING_JOB AMBIGUITY
-- ============================================================================
-- Fix ambiguous column references (started_at/status/etc.) caused by RETURNS TABLE OUT params.

create or replace function public.claim_next_pending_job(
  p_worker_id text,
  p_lock_timeout_seconds integer default 300,
  p_job_type text default null
)
returns table (
  id uuid,
  intake_id uuid,
  source_id uuid,
  worker_id text,
  job_type text,
  status text,
  error_message text,
  locked_by text,
  locked_at timestamptz,
  heartbeat_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  retry_count integer,
  created_at timestamptz,
  updated_at timestamptz,
  next_retry_at timestamptz,
  metadata jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
begin
  return query
  with candidate as (
    select sj.id
    from public.scrape_jobs sj
    where sj.status = 'pending'
      and (sj.next_retry_at is null or sj.next_retry_at <= v_now)
      and (p_job_type is null or sj.job_type = p_job_type)
    order by sj.created_at asc
    limit 1
    for update skip locked
  ),
  updated as (
    update public.scrape_jobs sj
    set
      status       = 'running',
      locked_by    = p_worker_id,
      locked_at    = v_now,
      heartbeat_at = v_now,
      started_at   = coalesce(sj.started_at, v_now),
      updated_at   = v_now
    where sj.id in (select id from candidate)
      and sj.status = 'pending'
    returning sj.*
  )
  select
    u.id,
    u.intake_id,
    u.source_id,
    u.worker_id,
    u.job_type,
    u.status,
    u.error_message,
    u.locked_by,
    u.locked_at,
    u.heartbeat_at,
    u.started_at,
    u.completed_at,
    u.retry_count,
    u.created_at,
    u.updated_at,
    u.next_retry_at,
    u.metadata
  from updated u;
end;
$$;
