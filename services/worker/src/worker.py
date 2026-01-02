"""Main worker loop."""
import time
import logging
import sys
import threading
from datetime import datetime, timezone
import structlog
from src.config import settings
from src.db import (
    claim_next_job, update_job_status, mark_job_retryable, log_job_event,
    insert_price_points, get_source, get_source_rules, get_attribution,
    upsert_valuation, update_job_heartbeat, reclaim_stuck_jobs, supabase,
    upsert_worker_heartbeat, check_source_available, pause_source, get_source_pause_until,
    mark_job_retryable_in
)
from src.collectors.ebay import EbayCollector, EbayRateLimitError
from src.valuation import ValuationEngine

# Configure Python logging to output to stderr (Docker captures this)
logging.basicConfig(
    format="%(message)s",
    stream=sys.stderr,
    level=logging.INFO,
)

# Configure structured logging
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.JSONRenderer()
    ],
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    wrapper_class=structlog.stdlib.BoundLogger,
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger()


def get_collector(source: dict):
    """Get collector instance for a source.
    
    Args:
        source: Source dictionary from database
        
    Returns:
        Collector instance or None
    """
    adapter_type = source.get('adapter_type')
    config = source.get('config', {}) or {}
    
    if adapter_type == 'ebay_api':
        # Get eBay credentials from config or environment
        app_id = config.get('app_id') or settings.ebay_app_id
        cert_id = config.get('cert_id') or settings.ebay_cert_id
        dev_id = config.get('dev_id') or settings.ebay_dev_id
        sandbox = config.get('sandbox', False) or settings.ebay_sandbox
        rate_limit = source.get('rate_limit_per_minute', 60)
        
        if not app_id:
            logger.error("eBay App ID not found", source_id=source['id'])
            return None
        
        # Check for placeholder credentials
        placeholder_patterns = ['your-ebay-app-id', 'your-ebay-cert-id', 'your-ebay-dev-id', 'placeholder', 'example']
        app_id_lower = app_id.lower()
        if any(pattern in app_id_lower for pattern in placeholder_patterns):
            logger.error("eBay App ID appears to be a placeholder value", 
                        source_id=source['id'], 
                        app_id=app_id[:20] + '...' if len(app_id) > 20 else app_id)
            raise Exception(f"eBay App ID is set to a placeholder value ('{app_id}'). Please update the source configuration with your real eBay API credentials.")
        
        return EbayCollector(
            app_id=app_id, 
            cert_id=cert_id, 
            dev_id=dev_id, 
            sandbox=sandbox,
            source_id=source['id'],
            rate_limit_per_minute=rate_limit
        )
    
    elif adapter_type == 'manual':
        logger.warning("Manual collector not implemented", source_id=source['id'])
        return None
    
    elif adapter_type == 'selenium':
        logger.warning("Selenium collector not implemented (disabled by default)", source_id=source['id'])
        return None
    
    else:
        logger.error("Unknown adapter type", adapter_type=adapter_type, source_id=source['id'])
        return None


def process_job(job: dict):
    """Process a single scrape job.
    
    Args:
        job: Job dictionary from database
    """
    job_id = job['id']
    job_type = job.get('job_type', 'pricing')  # Default to 'pricing' for backwards compatibility
    
    # Skip grading jobs - they should be processed by the grader service
    if job_type == 'grading':
        logger.warning("Skipping grading job - should be processed by grader service", 
                      job_id=job_id, job_type=job_type)
        return
    
    intake_id = job['intake_id']
    source_id = job['source_id']
    query_params = job.get('query_params', {})
    
    start_time = datetime.now()
    logger.info("Processing job", job_id=job_id, intake_id=intake_id, source_id=source_id, worker_id=settings.worker_id, job_type=job_type)
    
    # Start heartbeat thread FIRST (before any early returns)
    heartbeat_stop = threading.Event()
    heartbeat_thread = threading.Thread(
        target=_heartbeat_loop,
        args=(job_id, heartbeat_stop),
        daemon=True
    )
    heartbeat_thread.start()
    
    try:
        # Get source configuration
        source = get_source(source_id)
        if not source:
            raise Exception(f"Source not found: {source_id}")
        
        if not source.get('enabled'):
            logger.warning("Source is disabled", source_id=source_id)
            update_job_status(job_id, 'failed', 'Source is disabled')
            return
        
        # Get attribution (always fetch to get keywords)
        attribution = get_attribution(intake_id)
        
        # Get source rules (exclude keywords, etc.)
        rules = get_source_rules(source_id)
        source_exclude_keywords = [
            r['rule_value'] for r in rules
            if r['rule_type'] == 'exclude_keywords' and r['active']
        ]
        # Normalize source-level exclude keywords (trim, lowercase)
        source_exclude_keywords = [k.strip().lower() for k in source_exclude_keywords if k and k.strip()]
        
        # Get intake-level keywords from attribution
        intake_keywords_exclude = attribution.get('keywords_exclude', []) if attribution else []
        intake_keywords_include = attribution.get('keywords_include', []) if attribution else []
        
        # Ensure keywords are arrays and normalized (already normalized in DB, but verify)
        if not isinstance(intake_keywords_exclude, list):
            intake_keywords_exclude = []
        if not isinstance(intake_keywords_include, list):
            intake_keywords_include = []
        
        # Normalize intake keywords (trim, lowercase) - should already be normalized but ensure
        intake_keywords_exclude = [str(k).strip().lower() for k in intake_keywords_exclude if k]
        intake_keywords_include = [str(k).strip().lower() for k in intake_keywords_include if k]
        
        # Merge intake-level and source-level exclude keywords
        all_exclude_keywords = list(set(source_exclude_keywords + intake_keywords_exclude))
        
        # Build query_params if not already provided (from enqueue_jobs RPC)
        if not query_params or 'title' not in query_params:
            if attribution:
                query_params = {
                    'year': attribution.get('year'),
                    'mintmark': attribution.get('mintmark'),
                    'denomination': attribution.get('denomination'),
                    'series': attribution.get('series'),
                    'title': attribution.get('title'),
                    'intake_id': intake_id,
                    'source_id': source_id,
                    'job_id': job_id,
                    'keywords_include': intake_keywords_include,
                    'keywords_exclude': intake_keywords_exclude
                }
        else:
            # Merge keywords from query_params with attribution (query_params takes precedence if provided by RPC)
            if 'keywords_include' not in query_params and intake_keywords_include:
                query_params['keywords_include'] = intake_keywords_include
            if 'keywords_exclude' not in query_params and intake_keywords_exclude:
                query_params['keywords_exclude'] = intake_keywords_exclude
        
        # Get collector
        collector = get_collector(source)
        if not collector:
            raise Exception(f"Failed to get collector for source: {source_id}")
        
        # Collect price points (pass merged exclude keywords)
        log_job_event(job_id, 'info', 'Starting collection', {
            'source': source['name'],
            'exclude_keywords_count': len(all_exclude_keywords)
        })
        
        try:
            price_points = collector.collect(query_params, exclude_keywords=all_exclude_keywords)
        except Exception as collect_error:
            # If this looks like an eBay auth issue, disable the source so we stop hammering it.
            msg = str(collect_error)
            if source.get("adapter_type") == "ebay_api" and (
                "Authentication failed" in msg or "Invalid Application" in msg or "AppID" in msg
            ):
                logger.error("eBay API authentication failed", error=msg)
                try:
                    supabase.table("sources").update({"enabled": False}).eq("id", source_id).execute()
                except Exception:
                    pass
                raise Exception(
                    "eBay API authentication failed: "
                    f"{msg}. Please check your eBay App ID in the source configuration."
                )
            raise

        # If we got nothing AND the source is paused, this should not be "succeeded".
        if not price_points:
            if not check_source_available(source_id):
                paused_until = get_source_pause_until(source_id)  # ISO string or None
                delay = 300
                msg = "Source unavailable (paused or disabled)"
                if paused_until:
                    try:
                        pu = datetime.fromisoformat(paused_until.replace('Z', '+00:00'))
                        now = datetime.now(timezone.utc)
                        delay = max(30, int((pu - now).total_seconds()))
                        msg = f"Source paused until {paused_until}"
                    except Exception:
                        pass
                logger.warning("Source unavailable, scheduling retry", source_id=source_id, paused_until=paused_until, delay_seconds=delay)
                mark_job_retryable_in(job_id, delay_seconds=delay, error_message=msg)
                return
        
        if not price_points:
            logger.warning("No price points collected", job_id=job_id)
            log_job_event(job_id, 'warning', 'No price points collected')
            update_job_status(job_id, 'succeeded', None)
            return
        
        # Insert price points
        log_job_event(job_id, 'info', f'Collected {len(price_points)} price points')
        insert_price_points(price_points)
        
        # Compute valuation
        log_job_event(job_id, 'info', 'Computing valuation')
        
        # Get all price points for this intake (from all sources/jobs)
        all_price_points_result = supabase.table("price_points") \
            .select("*") \
            .eq("intake_id", intake_id) \
            .eq("filtered_out", False) \
            .execute()
        
        all_price_points = all_price_points_result.data if all_price_points_result.data else []
        
        # Get sources for reputation weighting
        source_ids = list(set(pp.get('source_id') for pp in all_price_points if pp.get('source_id')))
        sources = []
        for sid in source_ids:
            s = get_source(sid)
            if s:
                sources.append(s)
        
        # Get attribution for condition flag penalties
        attribution = get_attribution(intake_id)
        
        # Compute valuation
        engine = ValuationEngine(sources=sources)
        valuation = engine.compute_valuation(all_price_points, attribution=attribution)
        
        # Upsert valuation
        upsert_valuation(intake_id, valuation)
        logger.info("Valuation upserted",
                   job_id=job_id,
                   intake_id=intake_id,
                   confidence_score=valuation['confidence_score'],
                   comp_count=valuation['comp_count'])
        
        log_job_event(job_id, 'info', 'Valuation computed', {
            'confidence_score': valuation['confidence_score'],
            'comp_count': valuation['comp_count']
        })
        
        # Mark job as succeeded
        duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)
        update_job_status(job_id, 'succeeded', None)
        logger.info("Job succeeded", 
                   job_id=job_id, 
                   intake_id=intake_id, 
                   source_id=source_id,
                   duration_ms=duration_ms,
                   worker_id=settings.worker_id)
        
    except EbayRateLimitError as e:
        # Pause the source for a while, then retry the job later.
        pause_source(source_id, seconds=3600, reason=str(e))  # 1 hour backoff
        logger.warning("Rate limited by eBay, pausing source and retrying later", source_id=source_id)
        mark_job_retryable_in(job_id, delay_seconds=3600, error_message=str(e))
        return
    except Exception as e:
        error_msg = str(e)
        logger.error("Job failed", job_id=job_id, error=error_msg)

        # Mark job as retryable for transient errors
        retryable = (
            "timeout" in error_msg.lower()
            or "connection" in error_msg.lower()
            or "temporary" in error_msg.lower()
            or "rate limit" in error_msg.lower()
            or "429" in error_msg
        )

        status = "retryable" if retryable else "failed"
        log_job_event(job_id, "error", f"Job {status}", {"error": error_msg})
        update_job_status(job_id, status, error_msg)
    
    finally:
        # Always stop heartbeat thread, even on early returns or exceptions
        heartbeat_stop.set()
        heartbeat_thread.join(timeout=2)
        if heartbeat_thread.is_alive():
            logger.warning("Heartbeat thread did not stop within timeout", job_id=job_id)


def _heartbeat_loop(job_id: str, stop_event: threading.Event):
    """Background thread to update job heartbeat.
    
    Args:
        job_id: Job ID to update heartbeat for
        stop_event: Event to signal thread to stop
    """
    heartbeat_interval = 20  # Update heartbeat every 20 seconds
    while not stop_event.is_set():
        try:
            update_job_heartbeat(job_id)
        except Exception as e:
            logger.error("Failed to update heartbeat", job_id=job_id, error=str(e))
        
        # Wait for interval or stop signal
        stop_event.wait(heartbeat_interval)


def _worker_heartbeat_loop(stop_event: threading.Event):
    """Independent background thread to update worker heartbeat (not tied to jobs).
    
    Runs every 30 seconds regardless of job activity.
    
    Args:
        stop_event: Event to signal thread to stop
    """
    heartbeat_interval = 30  # Update worker heartbeat every 30 seconds
    while not stop_event.is_set():
        try:
            # Get optional metadata (can be extended with version, hostname, etc.)
            meta = {
                'worker_id': settings.worker_id
            }
            upsert_worker_heartbeat(settings.worker_id, meta)
        except Exception as e:
            logger.error("Failed to upsert worker heartbeat", worker_id=settings.worker_id, error=str(e))
        
        # Wait for interval or stop signal
        stop_event.wait(heartbeat_interval)


def run_worker():
    """Main worker loop with atomic job claiming."""
    logger.info("Worker started", worker_id=settings.worker_id)
    
    # Start independent worker heartbeat thread (runs regardless of jobs)
    worker_heartbeat_stop = threading.Event()
    worker_heartbeat_thread = threading.Thread(
        target=_worker_heartbeat_loop,
        args=(worker_heartbeat_stop,),
        daemon=True
    )
    worker_heartbeat_thread.start()
    logger.info("Worker heartbeat thread started", worker_id=settings.worker_id)
    
    # Track last reclaim check time
    last_reclaim_check = datetime.now()
    reclaim_check_interval = 60  # Check for stuck jobs every 60 seconds
    
    try:
        while True:
            try:
                # Periodically check for stuck jobs
                now = datetime.now()
                if (now - last_reclaim_check).total_seconds() >= reclaim_check_interval:
                    reclaimed = reclaim_stuck_jobs()
                    if reclaimed > 0:
                        logger.info("Reclaimed stuck jobs", count=reclaimed, worker_id=settings.worker_id)
                    last_reclaim_check = now
                
                # Atomically claim the next available job
                job = claim_next_job(settings.worker_id)
                
                if job:
                    # Process the claimed job
                    process_job(job)
                    # Small delay after processing
                    time.sleep(1)
                else:
                    # No jobs available, wait before next poll
                    time.sleep(settings.poll_interval_seconds)
                
            except KeyboardInterrupt:
                logger.info("Worker stopped by user", worker_id=settings.worker_id)
                break
            except Exception as e:
                logger.error("Worker error", error=str(e), worker_id=settings.worker_id, exc_info=True)
                time.sleep(settings.poll_interval_seconds)
    finally:
        # Stop worker heartbeat thread on shutdown
        worker_heartbeat_stop.set()
        worker_heartbeat_thread.join(timeout=5)
        logger.info("Worker heartbeat thread stopped", worker_id=settings.worker_id)


if __name__ == "__main__":
    run_worker()


