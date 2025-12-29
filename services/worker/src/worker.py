"""Main worker loop."""
import time
import logging
import sys
import structlog
from src.config import settings
from src.db import (
    claim_next_job, update_job_status, mark_job_retryable, log_job_event,
    insert_price_points, get_source, get_source_rules, get_attribution,
    upsert_valuation, supabase
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
        
        if not app_id:
            logger.error("eBay App ID not found", source_id=source['id'])
            return None
        
        return EbayCollector(app_id=app_id, cert_id=cert_id, dev_id=dev_id, sandbox=sandbox)
    
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
    
    logger.info("Processing job", job_id=job_id, intake_id=intake_id, source_id=source_id)
    
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
        
        log_job_event(job_id, 'info', 'Valuation computed', {
            'confidence_score': valuation['confidence_score'],
            'comp_count': valuation['comp_count']
        })
        
        # Mark job as succeeded
        update_job_status(job_id, 'succeeded', None)
        logger.info("Job succeeded", job_id=job_id)
        
    except Exception as e:
        error_msg = str(e)
        logger.error("Job failed", job_id=job_id, error=error_msg, exc_info=True)
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


def run_worker():
    """Main worker loop with atomic job claiming."""
    logger.info("Worker started", worker_id=settings.worker_id)
    
    while True:
        try:
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
            logger.info("Worker stopped by user")
            break
        except Exception as e:
            logger.error("Worker error", error=str(e), exc_info=True)
            time.sleep(settings.poll_interval_seconds)


if __name__ == "__main__":
    run_worker()


