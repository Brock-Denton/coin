-- ============================================================================
-- WORKER HEARTBEATS TABLE
-- ============================================================================
-- Adds a worker_heartbeats table for true worker health reporting,
-- independent of job activity. Workers upsert their heartbeat every 30s.

CREATE TABLE IF NOT EXISTS worker_heartbeats (
  worker_id TEXT PRIMARY KEY,
  last_seen_at TIMESTAMPTZ NOT NULL,
  meta JSONB DEFAULT '{}'::jsonb -- optional: version, hostname, last_job_id
);

CREATE INDEX IF NOT EXISTS idx_worker_heartbeats_last_seen 
  ON worker_heartbeats(last_seen_at);

-- RPC function to upsert worker heartbeat
CREATE OR REPLACE FUNCTION upsert_worker_heartbeat(
  p_worker_id TEXT,
  p_meta JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO worker_heartbeats (worker_id, last_seen_at, meta)
  VALUES (p_worker_id, NOW(), p_meta)
  ON CONFLICT (worker_id) DO UPDATE SET
    last_seen_at = NOW(),
    meta = p_meta;
END;
$$ LANGUAGE plpgsql;

