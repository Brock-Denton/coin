"""Database client and helpers."""
from supabase import create_client, Client
from src.config import settings
from typing import Optional
from datetime import datetime, timezone, timedelta
import structlog

logger = structlog.get_logger()

# Initialize Supabase client
supabase: Client = create_client(settings.supabase_url, settings.supabase_key)


def upsert_worker_heartbeat(worker_id: str, meta: dict = None):
    """Upsert worker heartbeat to worker_heartbeats table.
    
    Args:
        worker_id: Worker instance identifier
        meta: Optional metadata (version, hostname, last_job_id, etc.)
    """
    try:
        meta_json = meta or {}
        supabase.rpc('upsert_worker_heartbeat', {
            'p_worker_id': worker_id,
            'p_meta': meta_json
        }).execute()
        logger.debug("Worker heartbeat updated", worker_id=worker_id)
    except Exception as e:
        logger.error("Failed to upsert worker heartbeat", worker_id=worker_id, error=str(e))


def claim_next_job(worker_id: str) -> Optional[dict]:
    """Atomically claim the next pending pricing job from the queue.
    
    Uses the database function for atomic job acquisition to prevent
    double-processing by multiple workers. Only claims jobs with job_type='pricing'.
    
    Args:
        worker_id: Worker instance identifier
        
    Returns:
        Job dictionary if claimed, None otherwise
    """
    try:
        result = supabase.rpc('claim_next_pending_job', {
            'p_worker_id': worker_id,
            'p_lock_timeout_seconds': settings.job_lock_timeout_seconds,
            'p_job_type': 'pricing'
        }).execute()
        
        if result.data and len(result.data) > 0:
            return result.data[0]
        return None
    except Exception as e:
        logger.error("Failed to claim job", worker_id=worker_id, error=str(e))
        return None


def get_pending_jobs(limit: int = 10):
    """Get pending scrape jobs from the queue. (Deprecated - use claim_next_job instead)"""
    try:
        result = supabase.table("scrape_jobs") \
            .select("*") \
            .eq("status", "pending") \
            .order("created_at", desc=False) \
            .limit(limit) \
            .execute()
        return result.data
    except Exception as e:
        logger.error("Failed to get pending jobs", error=str(e))
        return []


def lock_job(job_id: str, worker_id: str) -> bool:
    """Attempt to lock a job. Returns True if successfully locked. (Deprecated - use claim_next_job instead)"""
    try:
        now_iso = datetime.now(timezone.utc).isoformat()
        result = supabase.table("scrape_jobs") \
            .update({
                "status": "running",
                "locked_at": now_iso,
                "locked_by": worker_id,
                "started_at": now_iso,
                "updated_at": now_iso
            }) \
            .eq("id", job_id) \
            .eq("status", "pending") \
            .execute()
        
        return len(result.data) > 0
    except Exception as e:
        logger.error("Failed to lock job", job_id=job_id, error=str(e))
        return False


def update_job_status(job_id: str, status: str, error_message: str = None):
    """Update job status.
    
    Sets completed_at only for terminal states: 'succeeded' or 'failed'.
    Does NOT set completed_at for 'retryable' (it's not terminal).
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    update_data = {
        "status": status,
        "updated_at": now_iso
    }
    
    # Map old status names to new ones for backwards compatibility
    status_map = {
        "completed": "succeeded",
        "cancelled": "failed"
    }
    if status in status_map:
        status = status_map[status]
        update_data["status"] = status
    
    # Only set completed_at for terminal states (succeeded, failed)
    # Do NOT set for retryable - it's handled by mark_job_retryable SQL function
    if status in ("succeeded", "failed"):
        update_data["completed_at"] = now_iso
    
    if error_message:
        update_data["error_message"] = error_message
    
    try:
        supabase.table("scrape_jobs") \
            .update(update_data) \
            .eq("id", job_id) \
            .execute()
        logger.info("Updated job status", job_id=job_id, status=status)
    except Exception as e:
        logger.error("Failed to update job status", job_id=job_id, error=str(e))


def mark_job_retryable(job_id: str, base_delay_minutes: int = 5):
    """Mark a job as retryable with exponential backoff.
    
    Args:
        job_id: Job ID to mark as retryable
        base_delay_minutes: Base delay in minutes for exponential backoff (default 5)
    """
    try:
        supabase.rpc('mark_job_retryable', {
            'job_id': job_id,
            'base_delay_minutes': base_delay_minutes
        }).execute()
        logger.info("Marked job as retryable", job_id=job_id)
    except Exception as e:
        logger.error("Failed to mark job as retryable", job_id=job_id, error=str(e))


def log_job_event(job_id: str, level: str, message: str, metadata: dict = None):
    """Log an event for a job."""
    try:
        supabase.table("scrape_job_logs") \
            .insert({
                "job_id": job_id,
                "log_level": level,
                "message": message,
                "metadata": metadata or {}
            }) \
            .execute()
    except Exception as e:
        logger.error("Failed to log job event", job_id=job_id, error=str(e))


def insert_price_points(price_points: list):
    """Insert or update price points into the database (atomic UPSERT).
    
    Uses PostgreSQL function with ON CONFLICT to atomically upsert rows
    based on (intake_id, source_id, dedupe_key) unique constraint.
    Updates existing rows if new version has higher match_strength or
    more complete fields (external_id, raw_payload).
    
    Args:
        price_points: List of price point dictionaries
    """
    if not price_points:
        return
    
    inserted_count = 0
    updated_count = 0
    
    try:
        for pp in price_points:
            try:
                # Use PostgreSQL function for atomic upsert
                result = supabase.rpc('upsert_price_point', {
                    'p_intake_id': pp.get('intake_id'),
                    'p_source_id': pp.get('source_id'),
                    'p_dedupe_key': pp.get('dedupe_key'),
                    'p_job_id': pp.get('job_id'),
                    'p_price_cents': pp.get('price_cents'),
                    'p_price_type': pp.get('price_type'),
                    'p_raw_payload': pp.get('raw_payload'),
                    'p_listing_url': pp.get('listing_url'),
                    'p_listing_title': pp.get('listing_title'),
                    'p_listing_date': pp.get('listing_date'),
                    'p_observed_at': pp.get('observed_at'),
                    'p_match_strength': float(pp.get('match_strength', 1.0)),
                    'p_external_id': pp.get('external_id'),
                    'p_filtered_out': pp.get('filtered_out', False)
                }).execute()
                
                if result.data:
                    # Check if this was an insert or update by checking if row existed before
                    # Since we can't easily tell, we'll assume it's an update if we get a result
                    # In practice, both inserts and updates return the id
                    inserted_count += 1
            except Exception as e:
                # If it's a unique constraint violation that wasn't handled, log and continue
                error_str = str(e)
                if 'unique constraint' in error_str.lower() or 'duplicate key' in error_str.lower():
                    # This shouldn't happen with the function, but handle gracefully
                    logger.warning("Price point conflict (should be handled by function)", 
                                 error=error_str, 
                                 dedupe_key=pp.get('dedupe_key'))
                    updated_count += 1
                else:
                    logger.error("Failed to upsert price point", error=error_str, price_point_id=pp.get('id'))
                continue
        
        logger.info("Upserted price points", 
                   total=len(price_points),
                   processed=inserted_count + updated_count)
    except Exception as e:
        logger.error("Failed to insert price points", error=str(e))


def get_source(source_id: str):
    """Get source configuration."""
    try:
        result = supabase.table("sources") \
            .select("*") \
            .eq("id", source_id) \
            .single() \
            .execute()
        return result.data
    except Exception as e:
        logger.error("Failed to get source", source_id=source_id, error=str(e))
        return None


def get_source_rules(source_id: str):
    """Get active source rules."""
    try:
        result = supabase.table("source_rules") \
            .select("*") \
            .eq("source_id", source_id) \
            .eq("active", True) \
            .order("priority", desc=False) \
            .execute()
        return result.data
    except Exception as e:
        logger.error("Failed to get source rules", source_id=source_id, error=str(e))
        return []


def get_attribution(intake_id: str):
    """Get attribution data for an intake."""
    try:
        result = supabase.table("attributions") \
            .select("*") \
            .eq("intake_id", intake_id) \
            .single() \
            .execute()
        return result.data
    except Exception as e:
        logger.error("Failed to get attribution", intake_id=intake_id, error=str(e))
        return None


def update_job_heartbeat(job_id: str):
    """Update job heartbeat timestamp.
    
    Args:
        job_id: Job ID to update heartbeat for
    """
    try:
        supabase.rpc('update_job_heartbeat', {
            'p_job_id': job_id
        }).execute()
        logger.debug("Updated job heartbeat", job_id=job_id)
    except Exception as e:
        logger.error("Failed to update job heartbeat", job_id=job_id, error=str(e))


def reclaim_stuck_jobs() -> int:
    """Reclaim stuck jobs (jobs with no heartbeat within timeout).
    
    Returns:
        Number of jobs reclaimed
    """
    try:
        result = supabase.rpc('reclaim_stuck_jobs', {
            'p_lock_timeout_seconds': settings.job_lock_timeout_seconds
        }).execute()
        
        # Handle scalar return - PostgreSQL functions returning INTEGER
        # may return the value directly in data or as data[0]
        if result.data:
            if isinstance(result.data, int):
                reclaimed_count = result.data
            elif isinstance(result.data, list) and len(result.data) > 0:
                reclaimed_count = result.data[0]
            else:
                reclaimed_count = 0
        else:
            reclaimed_count = 0
            
        if reclaimed_count > 0:
            logger.info("Reclaimed stuck jobs", count=reclaimed_count)
        return reclaimed_count
    except Exception as e:
        logger.error("Failed to reclaim stuck jobs", error=str(e))
        return 0


def update_source_stats(source_id: str, success: bool):
    """Update source statistics (success/failure tracking).
    
    Args:
        source_id: Source ID
        success: True if operation succeeded, False if failed
    """
    try:
        now_iso = datetime.now(timezone.utc).isoformat()
        if success:
            supabase.table("sources") \
                .update({
                    'last_success_at': now_iso,
                    'failure_streak': 0,
                    'updated_at': now_iso
                }) \
                .eq("id", source_id) \
                .execute()
        else:
            # Read current streak, increment, update
            current = supabase.table("sources") \
                .select("failure_streak") \
                .eq("id", source_id) \
                .single() \
                .execute()
            
            new_streak = (current.data.get('failure_streak', 0) if current.data else 0) + 1
            
            supabase.table("sources") \
                .update({
                    'last_failure_at': now_iso,
                    'failure_streak': new_streak,
                    'updated_at': now_iso
                }) \
                .eq("id", source_id) \
                .execute()
    except Exception as e:
        logger.error("Failed to update source stats", source_id=source_id, error=str(e))


def check_source_available(source_id: str) -> bool:
    """Check if source is available (enabled and not paused).
    
    Args:
        source_id: Source ID
        
    Returns:
        True if source is available, False otherwise
    """
    try:
        result = supabase.table("sources") \
            .select("enabled, paused_until") \
            .eq("id", source_id) \
            .single() \
            .execute()
        
        if not result.data:
            return False
        
        enabled = result.data.get('enabled', False)
        paused_until = result.data.get('paused_until')
        
        if not enabled:
            return False
        
        if paused_until:
            # Check if pause has expired
            from datetime import datetime, timezone
            try:
                pause_time = datetime.fromisoformat(paused_until.replace('Z', '+00:00'))
                if pause_time > datetime.now(timezone.utc):
                    return False  # Still paused
            except Exception:
                pass  # Invalid date, assume available
        
        return True
    except Exception as e:
        logger.error("Failed to check source availability", source_id=source_id, error=str(e))
        return False


def get_source_pause_until(source_id: str) -> Optional[str]:
    """Return paused_until (ISO string) for a source, if any."""
    try:
        result = supabase.table("sources") \
            .select("paused_until") \
            .eq("id", source_id) \
            .limit(1) \
            .execute()
        if result.data and len(result.data) > 0:
            return result.data[0].get("paused_until")
        return None
    except Exception as e:
        logger.error("Failed to get source paused_until", source_id=source_id, error=str(e))
        return None


def pause_source(source_id: str, seconds: int, reason: str = None) -> None:
    """Temporarily pause a source by setting paused_until."""
    try:
        now = datetime.now(timezone.utc)
        paused_until = (now + timedelta(seconds=seconds)).isoformat()
        update_data = {
            "paused_until": paused_until,
            "last_failure_at": now.isoformat(),
            "updated_at": now.isoformat(),
        }
        supabase.table("sources").update(update_data).eq("id", source_id).execute()
        logger.warning("Paused source", source_id=source_id, paused_until=paused_until, reason=reason)
    except Exception as e:
        logger.error("Failed to pause source", source_id=source_id, seconds=seconds, error=str(e))


def upsert_valuation(intake_id: str, valuation_data: dict):
    """Create or update a valuation (atomic UPSERT).
    
    Uses PostgreSQL function with ON CONFLICT to atomically upsert
    based on unique constraint on intake_id.
    
    Args:
        intake_id: Intake ID
        valuation_data: Valuation data dictionary
    """
    try:
        # Use PostgreSQL function for atomic upsert
        result = supabase.rpc('upsert_valuation', {
            'p_intake_id': intake_id,
            'p_price_cents_p10': valuation_data.get('price_cents_p10'),
            'p_price_cents_p20': valuation_data.get('price_cents_p20'),
            'p_price_cents_p40': valuation_data.get('price_cents_p40'),
            'p_price_cents_median': valuation_data.get('price_cents_median'),
            'p_price_cents_p60': valuation_data.get('price_cents_p60'),
            'p_price_cents_p80': valuation_data.get('price_cents_p80'),
            'p_price_cents_p90': valuation_data.get('price_cents_p90'),
            'p_price_cents_mean': valuation_data.get('price_cents_mean'),
            'p_confidence_score': valuation_data.get('confidence_score'),
            'p_explanation': valuation_data.get('explanation'),
            'p_comp_count': valuation_data.get('comp_count', 0),
            'p_comp_sources_count': valuation_data.get('comp_sources_count', 0),
            'p_sold_count': valuation_data.get('sold_count', 0),
            'p_ask_count': valuation_data.get('ask_count', 0),
            'p_metadata': valuation_data.get('metadata', {})
        }).execute()
        
        logger.info("Upserted valuation", intake_id=intake_id)
    except Exception as e:
        logger.error("Failed to upsert valuation", intake_id=intake_id, error=str(e))



