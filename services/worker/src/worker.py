"""Main worker loop."""
import time
import logging
import sys
import threading
from datetime import datetime
import structlog
from src.config import settings
from src.db import (
    claim_next_job, update_job_status, mark_job_retryable, log_job_event,
    insert_price_points, get_source, get_source_rules, get_attribution,
    upsert_valuation, update_job_heartbeat, reclaim_stuck_jobs, supabase
)
from src.collectors.ebay import EbayCollector
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
    intake_id = job['intake_id']
    source_id = job['source_id']
    query_params = job.get('query_params', {})
    
    start_time = datetime.now()
    logger.info("Processing job", job_id=job_id, intake_id=intake_id, source_id=source_id, worker_id=settings.worker_id)
    
    # Start heartbeat thread
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
        
        # Get source rules (exclude keywords, etc.)
        rules = get_source_rules(source_id)
        exclude_keywords = [
            r['rule_value'] for r in rules
            if r['rule_type'] == 'exclude_keywords' and r['active']
        ]
        
        # Get attribution if needed to build query
        if not query_params or 'title' not in query_params:
            attribution = get_attribution(intake_id)
            if attribution:
                query_params = {
                    'year': attribution.get('year'),
                    'mintmark': attribution.get('mintmark'),
                    'denomination': attribution.get('denomination'),
                    'series': attribution.get('series'),
                    'title': attribution.get('title'),
                    'intake_id': intake_id,
                    'source_id': source_id,
                    'job_id': job_id
                }
        
        # Get collector
        collector = get_collector(source)
        if not collector:
            raise Exception(f"Failed to get collector for source: {source_id}")
        
        # Collect price points
        log_job_event(job_id, 'info', 'Starting collection', {'source': source['name']})
        price_points = collector.collect(query_params, exclude_keywords=exclude_keywords)
        
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
        
        # Stop heartbeat
        heartbeat_stop.set()
        heartbeat_thread.join(timeout=1)
        
        # Mark job as succeeded
        duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)
        update_job_status(job_id, 'succeeded', None)
        logger.info("Job succeeded", 
                   job_id=job_id, 
                   intake_id=intake_id, 
                   source_id=source_id,
                   duration_ms=duration_ms,
                   worker_id=settings.worker_id)
        
    except Exception as e:
        # Stop heartbeat
        heartbeat_stop.set()
        heartbeat_thread.join(timeout=1)
        
        error_msg = str(e)
        duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)
        logger.error("Job failed", 
                    job_id=job_id, 
                    intake_id=intake_id,
                    source_id=source_id,
                    error=error_msg, 
                    duration_ms=duration_ms,
                    worker_id=settings.worker_id,
                    exc_info=True)
        log_job_event(job_id, 'error', f'Job failed: {error_msg}')
        
        # Check if error is retryable (transient errors)
        retryable_errors = ['timeout', 'connection', 'rate limit', 'temporary', '503', '502', '504']
        is_retryable = any(keyword in error_msg.lower() for keyword in retryable_errors)
        
        if is_retryable:
            # Mark as retryable with exponential backoff
            mark_job_retryable(job_id, base_delay_minutes=5)
            logger.info("Job marked as retryable", job_id=job_id)
        else:
            # Mark as permanently failed
            update_job_status(job_id, 'failed', error_msg)


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


def run_worker():
    """Main worker loop with atomic job claiming."""
    logger.info("Worker started", worker_id=settings.worker_id)
    
    # Track last reclaim check time
    last_reclaim_check = datetime.now()
    reclaim_check_interval = 60  # Check for stuck jobs every 60 seconds
    
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


if __name__ == "__main__":
    run_worker()


