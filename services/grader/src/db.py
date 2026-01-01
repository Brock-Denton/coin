"""Database client and helpers for grader service."""
from supabase import create_client, Client
from src.config import settings
from typing import Optional, List, Dict
from datetime import datetime, timezone
import structlog
import requests

logger = structlog.get_logger()

# Initialize Supabase client
supabase: Client = create_client(settings.supabase_url, settings.supabase_key)

def _first_row(table: str, filters: List[tuple], columns: str = "*") -> Optional[Dict]:
    """
    Safe "maybe single" helper that never uses PostgREST .single()/maybe_single().
    PostgREST returns 406 when object is requested but 0 rows exist.
    We always fetch an array and take the first row.
    """
    q = supabase.table(table).select(columns)
    for op, key, val in filters:
        if op == "eq":
            q = q.eq(key, val)
        elif op == "is":
            q = q.is_(key, val)
        elif op == "in":
            q = q.in_(key, val)
        else:
            raise ValueError(f"Unsupported filter op: {op}")
    res = q.limit(1).execute()
    data = getattr(res, "data", None) or []
    if isinstance(data, list):
        return data[0] if data else None
    # Some clients return dict for single row; normalize.
    return data if data else None


def get_internal_grader_source_id() -> Optional[str]:
    """Get the Internal Grader source ID.
    
    Returns:
        Source ID if found, None otherwise
    """
    try:
        row = _first_row(
            "sources",
            [
                ("eq", "name", "Internal Grader"),
                ("eq", "adapter_type", "internal_grader"),
                ("eq", "enabled", True),
            ],
            columns="id",
        )
        return row.get("id") if row else None
    except Exception as e:
        logger.error("Failed to get Internal Grader source ID", error=str(e))
        return None


def claim_next_job(grader_id: str) -> Optional[dict]:
    """Atomically claim the next pending grading job.
    
    Uses the database function for atomic job acquisition, filtering by job_type='grading'.
    
    Args:
        grader_id: Grader instance identifier
        
    Returns:
        Job dictionary if claimed, None otherwise
    """
    try:
        result = supabase.rpc('claim_next_pending_job', {
            'p_worker_id': grader_id,
            'p_lock_timeout_seconds': settings.job_lock_timeout_seconds,
            'p_job_type': 'grading'
        }).execute()
        
        if result.data and len(result.data) > 0:
            return result.data[0]
        return None
    except Exception as e:
        logger.error("Failed to claim grading job", grader_id=grader_id, error=str(e))
        return None


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
    
    # Only set completed_at for terminal states (succeeded, failed)
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


def get_coin_images(intake_id: str) -> List[Dict]:
    """Get coin images for an intake.
    
    Tries to fetch by `kind` column first (new schema). Falls back to `media_type`
    column for backward compatibility with existing data.
    
    Args:
        intake_id: Intake ID
        
    Returns:
        List of image dictionaries
    """
    try:
        # First try: use kind column (new schema)
        result = supabase.table("coin_media") \
            .select("*") \
            .eq("intake_id", intake_id) \
            .in_("kind", ["obverse", "reverse", "edge"]) \
            .order("kind", desc=False) \
            .execute()
        
        if result.data and len(result.data) > 0:
            return result.data
        
        # Fallback: use media_type column (backward compatibility)
        result = supabase.table("coin_media") \
            .select("*") \
            .eq("intake_id", intake_id) \
            .in_("media_type", ["obverse", "reverse", "edge"]) \
            .order("media_type", desc=False) \
            .execute()
        
        return result.data if result.data else []
    except Exception as e:
        logger.error("Failed to get coin images", intake_id=intake_id, error=str(e))
        return []


def get_attribution(intake_id: str) -> Optional[Dict]:
    """Get attribution data for an intake.
    
    Args:
        intake_id: Intake ID
        
    Returns:
        Attribution dictionary or None
    """
    try:
        return _first_row("attributions", [("eq", "intake_id", intake_id)], columns="*")
    except Exception as e:
        logger.error("Failed to get attribution", intake_id=intake_id, error=str(e))
        return None


def get_valuation(intake_id: str) -> Optional[Dict]:
    """Get valuation data for an intake.
    
    Args:
        intake_id: Intake ID
        
    Returns:
        Valuation dictionary or None
    """
    try:
        return _first_row("valuations", [("eq", "intake_id", intake_id)], columns="*")
    except Exception as e:
        logger.error("Failed to get valuation", intake_id=intake_id, error=str(e))
        return None


def upsert_grade_estimate(intake_id: str, grade_estimate_data: dict, model_version: str = "baseline_v1"):
    """Create or update a grade estimate using a single atomic UPSERT.

    Uses unique constraint: (intake_id, model_version).
    Avoids "select then insert/update" race conditions and NoneType result issues.
    """
    # IMPORTANT: do not swallow errors here. If this fails, the grader should fail the job.
    now_iso = datetime.now(timezone.utc).isoformat()
    estimate_data = {
        "intake_id": intake_id,
        "model_version": model_version,
        "grade_bucket": grade_estimate_data.get("grade_bucket"),
        "grade_distribution": grade_estimate_data.get("grade_distribution"),
        "details_risk": grade_estimate_data.get("details_risk"),
        "confidence": float(grade_estimate_data.get("confidence", 0.5)),
        "notes": grade_estimate_data.get("notes"),
        "updated_at": now_iso,
    }
    res = supabase.table("grade_estimates") \
        .upsert(estimate_data, on_conflict="intake_id,model_version") \
        .execute()
    if getattr(res, "data", None) is None:
        raise RuntimeError(f"grade_estimates upsert returned no data for intake_id={intake_id}")
    logger.info("Upserted grade estimate", intake_id=intake_id, model_version=model_version)


def upsert_grading_recommendation(intake_id: str, service_id: str, recommendation_data: dict, ship_policy_id: Optional[str] = None):
    """Create or update a grading recommendation.
    
    Args:
        intake_id: Intake ID
        service_id: Grading service ID
        recommendation_data: Recommendation data dictionary
        ship_policy_id: Optional shipping policy ID
    """
    try:
        now_iso = datetime.now(timezone.utc).isoformat()
        rec_data = {
            "intake_id": intake_id,
            "service_id": service_id,
            "ship_policy_id": ship_policy_id,
            "expected_raw_value_cents": recommendation_data.get("expected_raw_value_cents"),
            "expected_graded_value_cents": recommendation_data.get("expected_graded_value_cents"),
            "total_cost_cents": recommendation_data.get("total_cost_cents"),
            "expected_profit_cents": recommendation_data.get("expected_profit_cents"),
            "recommendation": recommendation_data.get("recommendation"),
            "breakdown": recommendation_data.get("breakdown", {}),
            "updated_at": now_iso,
        }

        # Prefer a single atomic UPSERT to avoid edge cases and races.
        # This requires a UNIQUE constraint on (intake_id, service_id).
        supabase.table("grading_recommendations") \
            .upsert(rec_data, on_conflict="intake_id,service_id") \
            .execute()

        logger.info("Upserted grading recommendation", intake_id=intake_id, service_id=service_id)
    except Exception as e:
        logger.error("Failed to upsert grading recommendation", intake_id=intake_id, service_id=service_id, error=str(e))


def get_grading_services(enabled_only: bool = True) -> List[Dict]:
    """Get grading services.
    
    Args:
        enabled_only: If True, only return enabled services
        
    Returns:
        List of grading service dictionaries
    """
    try:
        query = supabase.table("grading_services").select("*")
        if enabled_only:
            query = query.eq("enabled", True)
        result = query.order("name", desc=False).execute()
        return result.data if result.data else []
    except Exception as e:
        logger.error("Failed to get grading services", error=str(e))
        return []


def get_default_ship_policy() -> Optional[Dict]:
    """Get the default shipping policy.
    
    Returns:
        Ship policy dictionary or None
    """
    try:
        result = supabase.table("grading_ship_policies") \
            .select("*") \
            .order("name", desc=False) \
            .limit(1) \
            .execute()
        return result.data[0] if result.data else None
    except Exception as e:
        logger.error("Failed to get default ship policy", error=str(e))
        return None


def get_image_url(storage_path: str) -> str:
    """Get public URL for an image in storage.
    
    Args:
        storage_path: Storage path from coin_media.storage_path
        
    Returns:
        Public URL string
    """
    try:
        # Since bucket is public, construct URL directly
        # Format: {supabase_url}/storage/v1/object/public/{bucket}/{path}
        base_url = settings.supabase_url.rstrip('/')
        url = f"{base_url}/storage/v1/object/public/coin-media/{storage_path}"
        return url
    except Exception as e:
        logger.error("Failed to get image URL", storage_path=storage_path, error=str(e))
        return ""


def download_image(storage_path: str) -> Optional[bytes]:
    """Download image from Supabase Storage using public URL.
    
    Args:
        storage_path: Storage path from coin_media.storage_path
        
    Returns:
        Image bytes or None if download fails
    """
    try:
        url = get_image_url(storage_path)
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        return response.content
    except Exception as e:
        logger.error("Failed to download image", storage_path=storage_path, error=str(e))
        return None


def get_certified_comps(intake_id: str, denomination: Optional[str] = None, series: Optional[str] = None) -> List[Dict]:
    """Get certified comps for an intake (optionally filtered by denomination/series).
    
    Args:
        intake_id: Intake ID
        denomination: Optional denomination filter
        series: Optional series filter
        
    Returns:
        List of certified comp dictionaries with price_point data
    """
    try:
        # Get certified comps via price_points for this intake
        query = supabase.table("price_points") \
            .select("*, certified_comps(*)") \
            .eq("intake_id", intake_id) \
            .eq("is_certified", True)
        
        result = query.execute()
        
        if not result.data:
            return []
        
        # Filter by denomination/series if provided
        comps = []
        for pp in result.data:
            if pp.get("certified_comps"):
                # If we have filters, check attribution match
                # Note: We'd need to join with attributions table for proper filtering
                # For now, return all certified comps for the intake
                for cc in pp["certified_comps"] if isinstance(pp["certified_comps"], list) else [pp["certified_comps"]]:
                    comps.append({
                        **cc,
                        "price_point": pp
                    })
        
        return comps
    except Exception as e:
        logger.error("Failed to get certified comps", intake_id=intake_id, error=str(e))
        return []


def get_grade_multipliers(
    version: str = "baseline_v1",
    denomination: Optional[str] = None,
    series: Optional[str] = None
) -> Dict[str, float]:
    """Get grade multipliers, trying series-specific, then denomination-specific, then generic.
    
    Args:
        version: Multiplier version (default: baseline_v1)
        denomination: Optional denomination filter
        series: Optional series filter
        
    Returns:
        Dictionary mapping bucket -> multiplier
    """
    try:
        multipliers = {}
        
        # Try most specific first: denomination + series
        if denomination and series:
            result = supabase.table("grade_multipliers") \
                .select("bucket, multiplier") \
                .eq("version", version) \
                .eq("enabled", True) \
                .eq("denomination", denomination) \
                .eq("series", series) \
                .execute()
            
            if result.data and len(result.data) > 0:
                for row in result.data:
                    multipliers[row["bucket"]] = float(row["multiplier"])
                logger.debug("Found series-specific multipliers", denomination=denomination, series=series, count=len(multipliers))
                return multipliers
        
        # Try denomination-only
        if denomination:
            result = supabase.table("grade_multipliers") \
                .select("bucket, multiplier") \
                .eq("version", version) \
                .eq("enabled", True) \
                .eq("denomination", denomination) \
                .is_("series", "null") \
                .execute()
            
            if result.data and len(result.data) > 0:
                for row in result.data:
                    multipliers[row["bucket"]] = float(row["multiplier"])
                logger.debug("Found denomination-specific multipliers", denomination=denomination, count=len(multipliers))
                return multipliers
        
        # Fallback to generic (denomination=NULL, series=NULL)
        result = supabase.table("grade_multipliers") \
            .select("bucket, multiplier") \
            .eq("version", version) \
            .eq("enabled", True) \
            .is_("denomination", "null") \
            .is_("series", "null") \
            .execute()
        
        if result.data:
            for row in result.data:
                multipliers[row["bucket"]] = float(row["multiplier"])
        
        logger.debug("Using generic multipliers", count=len(multipliers))
        return multipliers
    except Exception as e:
        logger.error("Failed to get grade multipliers", version=version, denomination=denomination, series=series, error=str(e))
        return {}

