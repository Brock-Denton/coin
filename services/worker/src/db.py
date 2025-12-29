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
            'worker_id': worker_id,
            'max_age_minutes': max_age_minutes
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
    """Insert price points into the database."""
    if not price_points:
        return
    
    try:
        supabase.table("price_points") \
            .insert(price_points) \
            .execute()
        logger.info("Inserted price points", count=len(price_points))
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



