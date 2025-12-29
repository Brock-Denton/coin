"""Database client and helpers."""
from supabase import create_client, Client
from src.config import settings
from typing import Optional
import structlog

logger = structlog.get_logger()

# Initialize Supabase client
supabase: Client = create_client(settings.supabase_url, settings.supabase_key)


def claim_next_job(worker_id: str, max_age_minutes: int = 30) -> Optional[dict]:
    """Atomically claim the next pending or retryable job.
    
    Uses the database function for atomic job acquisition to prevent
    double-processing by multiple workers.
    
    Args:
        worker_id: Worker instance identifier
        max_age_minutes: Maximum age in minutes for jobs to claim (default 30)
        
    Returns:
        Job dictionary if claimed, None otherwise
    """
    try:
        result = supabase.rpc('claim_next_pending_job', {
            'p_worker_id': worker_id,
            'p_lock_timeout_seconds': settings.job_lock_timeout_seconds,
            'p_max_age_minutes': max_age_minutes
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
        result = supabase.table("scrape_jobs") \
            .update({
                "status": "running",
                "locked_at": "now()",
                "locked_by": worker_id,
                "started_at": "now()",
                "updated_at": "now()"
            }) \
            .eq("id", job_id) \
            .eq("status", "pending") \
            .execute()
        
        return len(result.data) > 0
    except Exception as e:
        logger.error("Failed to lock job", job_id=job_id, error=str(e))
        return False


def update_job_status(job_id: str, status: str, error_message: str = None):
    """Update job status."""
    update_data = {
        "status": status,
        "updated_at": "now()"
    }
    
    # Map old status names to new ones for backwards compatibility
    status_map = {
        "completed": "succeeded",
        "cancelled": "failed"
    }
    if status in status_map:
        status = status_map[status]
        update_data["status"] = status
    
    if status in ("succeeded", "failed"):
        update_data["completed_at"] = "now()"
    
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
    """Insert or update price points into the database (UPSERT).
    
    Uses ON CONFLICT to update existing rows if they have the same
    (intake_id, source_id, dedupe_key), keeping the version with
    higher match_strength or more complete fields.
    
    Args:
        price_points: List of price point dictionaries
    """
    if not price_points:
        return
    
    inserted_count = 0
    updated_count = 0
    
    try:
        # Process price points one by one or in batches
        # Supabase Python client doesn't support ON CONFLICT directly,
        # so we'll use upsert which handles conflicts
        for pp in price_points:
            try:
                # Try to find existing price point
                existing = supabase.table("price_points") \
                    .select("id, match_strength") \
                    .eq("intake_id", pp.get("intake_id")) \
                    .eq("source_id", pp.get("source_id")) \
                    .eq("dedupe_key", pp.get("dedupe_key")) \
                    .execute()
                
                if existing.data and len(existing.data) > 0:
                    # Existing row found - update if new version is better
                    existing_pp = existing.data[0]
                    existing_match_strength = existing_pp.get('match_strength', 0.0)
                    new_match_strength = pp.get('match_strength', 0.0)
                    
                    # Update if new match_strength is higher
                    if new_match_strength > existing_match_strength:
                        supabase.table("price_points") \
                            .update({
                                'price_cents': pp.get('price_cents'),
                                'price_type': pp.get('price_type'),
                                'listing_url': pp.get('listing_url'),
                                'listing_title': pp.get('listing_title'),
                                'listing_date': pp.get('listing_date'),
                                'observed_at': pp.get('observed_at'),
                                'match_strength': pp.get('match_strength'),
                                'raw_payload': pp.get('raw_payload'),
                                'external_id': pp.get('external_id'),
                                'filtered_out': pp.get('filtered_out', False)
                            }) \
                            .eq("id", existing_pp['id']) \
                            .execute()
                        updated_count += 1
                else:
                    # Insert new row
                    supabase.table("price_points") \
                        .insert(pp) \
                        .execute()
                    inserted_count += 1
            except Exception as e:
                logger.error("Failed to upsert price point", error=str(e), price_point_id=pp.get('id'))
                continue
        
        logger.info("Upserted price points", 
                   inserted=inserted_count, 
                   updated=updated_count, 
                   total=len(price_points))
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
        if success:
            supabase.table("sources") \
                .update({
                    'last_success_at': 'now()',
                    'failure_streak': 0,
                    'updated_at': 'now()'
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
                    'last_failure_at': 'now()',
                    'failure_streak': new_streak,
                    'updated_at': 'now()'
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


def upsert_valuation(intake_id: str, valuation_data: dict):
    """Create or update a valuation."""
    try:
        # Check if valuation exists
        existing = supabase.table("valuations") \
            .select("id") \
            .eq("intake_id", intake_id) \
            .execute()
        
        if existing.data:
            # Update
            supabase.table("valuations") \
                .update(valuation_data) \
                .eq("intake_id", intake_id) \
                .execute()
        else:
            # Insert
            valuation_data["intake_id"] = intake_id
            supabase.table("valuations") \
                .insert(valuation_data) \
                .execute()
        
        logger.info("Upserted valuation", intake_id=intake_id)
    except Exception as e:
        logger.error("Failed to upsert valuation", intake_id=intake_id, error=str(e))



