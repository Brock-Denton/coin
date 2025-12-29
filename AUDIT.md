# Worker System Audit and Architecture

This document explains the job lifecycle, recovery logic, deduplication strategy, and how to run concurrency tests.

## Job State Machine

Jobs progress through the following states:

```
pending → running → succeeded
              ↓
           retryable → running (after backoff expires)
              ↓
            failed (terminal)
            
stuck/running → pending (via reclaim after heartbeat timeout)
```

### States

- **pending**: Initial state, ready to be claimed
- **running**: Currently being processed by a worker
- **retryable**: Transient error occurred, will retry after backoff period
- **succeeded**: Completed successfully
- **failed**: Permanently failed (terminal)

### State Transitions

1. **pending → running**: Atomic claim operation via `claim_next_pending_job` RPC
2. **running → succeeded**: Job completes successfully
3. **running → failed**: Permanent error (not retryable)
4. **running → retryable**: Transient error (timeout, connection, rate limit, etc.)
5. **retryable → running**: Job retried after `next_retry_at` timestamp expires (checked in claim function)
6. **running → pending**: Stuck job reclaimed (no heartbeat within `JOB_LOCK_TIMEOUT_SECONDS`)

## Recovery Logic

### Heartbeat Mechanism

While processing a job, the worker sends heartbeat updates every 20 seconds to indicate it's still alive:

- `heartbeat_at` timestamp is updated in the database
- If heartbeat stops, the job is considered "stuck"

### Stuck Job Reclamation

The worker periodically checks for stuck jobs:

- Runs every 60 seconds in the main loop
- Finds jobs where `status = 'running'` AND `heartbeat_at` is older than `JOB_LOCK_TIMEOUT_SECONDS` (default 300 seconds / 5 minutes)
- Resets these jobs to `pending` state so they can be reclaimed
- Increments `attempts` counter and logs the prior `locked_by` worker

### Atomic Job Claiming

The `claim_next_pending_job` RPC ensures only one worker can claim a job:

1. Uses `FOR UPDATE SKIP LOCKED` to select a job atomically
2. Immediately updates status to `running` and sets `locked_by`, `locked_at`, `heartbeat_at`
3. Returns the claimed job in a single transaction
4. Also checks for stuck jobs and allows claiming them

This prevents double-processing even with multiple workers.

### Exponential Backoff

When a job is marked as `retryable`:

- Calculates delay: `base_delay_minutes * 2^retry_count`
- Caps at 24 hours (1440 minutes)
- Sets `next_retry_at` to schedule retry
- Job is only claimable after `next_retry_at` passes

## Deduplication Strategy

### Price Points

Price points are deduplicated using a `dedupe_key`:

1. **Preferred**: If `external_id` exists (e.g., eBay item ID), use it directly: `dedupe_key = "ext_{external_id}"`
2. **Fallback**: Hash of normalized components:
   - Normalized URL (query params and fragments removed)
   - Normalized title (lowercased, whitespace normalized)
   - Price in cents
   - Date bucket (YYYY-MM-DD)
   - Price type (sold, ask, bid)
   - `dedupe_key = "hash_{sha256_hash[:16]}"`

Unique constraint: `UNIQUE(intake_id, source_id, dedupe_key)`

On conflict (UPSERT):
- If new row has higher `match_strength`, update existing row
- Otherwise, keep existing row (prevents duplicates)

### Valuations

One valuation per intake:

- Unique constraint: `UNIQUE(intake_id)`
- Upsert operation: Update existing or insert new

## Concurrency Test

To test that multiple workers don't process the same job:

### Setup

1. Ensure migrations are applied (including `011_job_heartbeat_and_recovery.sql`)
2. Create test jobs in the database
3. Run two worker instances concurrently

### Manual Test

```sql
-- Create 20 test jobs
INSERT INTO scrape_jobs (intake_id, source_id, query_params, status)
SELECT 
  (SELECT id FROM coin_intakes LIMIT 1),
  (SELECT id FROM sources WHERE enabled = true LIMIT 1),
  '{}'::jsonb,
  'pending'
FROM generate_series(1, 20);
```

```powershell
# Terminal 1: Start worker 1
$env:WORKER_ID="worker-1"
docker-compose -f infra/docker-compose.yml up worker

# Terminal 2: Start worker 2 (in separate Docker container or process)
$env:WORKER_ID="worker-2"
python services/worker/main.py
```

### Verify Results

```sql
-- Check that each job was processed exactly once
SELECT 
  status,
  locked_by,
  COUNT(*) as count
FROM scrape_jobs
WHERE status IN ('succeeded', 'failed', 'running')
GROUP BY status, locked_by;

-- Verify no duplicate price_points for same intake/source/dedupe_key
SELECT 
  intake_id,
  source_id,
  dedupe_key,
  COUNT(*) as count
FROM price_points
GROUP BY intake_id, source_id, dedupe_key
HAVING COUNT(*) > 1;
-- Should return 0 rows
```

### Simulate Dead Worker

1. Start a worker and let it claim a job
2. Kill the worker (Ctrl+C or `docker kill`)
3. Wait for `JOB_LOCK_TIMEOUT_SECONDS` (default 5 minutes)
4. Start another worker
5. Verify the stuck job is reclaimed and processed

```sql
-- Manually check for stuck jobs
SELECT 
  id,
  status,
  locked_by,
  heartbeat_at,
  NOW() - heartbeat_at as time_since_heartbeat
FROM scrape_jobs
WHERE status = 'running'
AND heartbeat_at < NOW() - INTERVAL '5 minutes';
```

## Source Governance

### Rate Limiting

- Token bucket algorithm per source
- Configurable `rate_limit_per_minute` in `sources` table
- Waits if necessary to respect rate limit

### Circuit Breaker

- Tracks `failure_streak` in `sources` table
- Opens circuit (pauses source) after 5 consecutive failures
- Sets `paused_until` timestamp (5 minute cooldown)
- Source is automatically checked before each collection attempt

### Caching

- SQLite cache database persisted in Docker volume
- Cache key: `source_id|year|mintmark|denomination|series|title`
- TTL: `CACHE_TTL_SECONDS` (default 3600 seconds)
- Can be disabled with `CACHE_ENABLED=false`

## Monitoring

### Job Status

```sql
-- Recent jobs
SELECT 
  id,
  status,
  locked_by,
  heartbeat_at,
  created_at,
  completed_at,
  error_message
FROM scrape_jobs
ORDER BY created_at DESC
LIMIT 20;
```

### Source Health

```sql
-- Source status
SELECT 
  name,
  enabled,
  failure_streak,
  last_success_at,
  last_failure_at,
  paused_until
FROM sources
ORDER BY name;
```

### Stuck Jobs

```sql
-- Jobs with no recent heartbeat
SELECT 
  id,
  status,
  locked_by,
  heartbeat_at,
  NOW() - heartbeat_at as time_since_heartbeat
FROM scrape_jobs
WHERE status = 'running'
AND (heartbeat_at IS NULL OR heartbeat_at < NOW() - INTERVAL '5 minutes');
```

