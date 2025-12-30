"""Main grader service loop."""
import time
import threading
import sys
import logging
import structlog
from datetime import datetime
from src.config import settings
from src.db import (
    claim_next_job,
    update_job_status,
    update_job_heartbeat,
    log_job_event,
    get_coin_images,
    get_attribution,
    get_valuation
)
from src.models.baseline_v1 import BaselineGradeEstimator
from src.recommendation import RecommendationEngine

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

# Also configure standard logging to stderr for Docker
logging.basicConfig(
    format="%(message)s",
    stream=sys.stderr,
    level=logging.INFO,
)

logger = structlog.get_logger()


def _heartbeat_loop(job_id: str, stop_event: threading.Event):
    """Background thread to update job heartbeat.
    
    Args:
        job_id: Job ID
        stop_event: Event to stop the loop
    """
    heartbeat_interval = 30  # seconds
    while not stop_event.is_set():
        try:
            update_job_heartbeat(job_id)
        except Exception as e:
            logger.error("Failed to update job heartbeat", job_id=job_id, error=str(e))
        
        stop_event.wait(heartbeat_interval)


def process_job(job: dict):
    """Process a single grading job.
    
    Args:
        job: Job dictionary from database
    """
    job_id = job['id']
    intake_id = job['intake_id']
    
    start_time = datetime.now()
    logger.info("Processing grading job", job_id=job_id, intake_id=intake_id, grader_id=settings.grader_id)
    
    # Start heartbeat thread FIRST (before any early returns)
    heartbeat_stop = threading.Event()
    heartbeat_thread = threading.Thread(
        target=_heartbeat_loop,
        args=(job_id, heartbeat_stop),
        daemon=True
    )
    heartbeat_thread.start()
    
    try:
        # Get coin images
        log_job_event(job_id, 'info', 'Fetching coin images')
        images = get_coin_images(intake_id)
        
        if not images:
            logger.warning("No coin images found", job_id=job_id, intake_id=intake_id)
            log_job_event(job_id, 'warning', 'No coin images found for grading')
            update_job_status(job_id, 'failed', 'No coin images found')
            return
        
        logger.info("Found coin images", job_id=job_id, image_count=len(images))
        
        # Get attribution for context
        attribution = get_attribution(intake_id)
        
        # Run grade estimation model
        log_job_event(job_id, 'info', 'Running grade estimation model')
        estimator = BaselineGradeEstimator()
        grade_estimate = estimator.estimate(images, attribution=attribution)
        
        if not grade_estimate:
            logger.warning("Grade estimation failed", job_id=job_id)
            log_job_event(job_id, 'error', 'Grade estimation failed')
            update_job_status(job_id, 'failed', 'Grade estimation failed')
            return
        
        # Store grade estimate
        from src.db import upsert_grade_estimate
        upsert_grade_estimate(intake_id, grade_estimate, model_version='baseline_v1')
        logger.info("Grade estimate stored", job_id=job_id, confidence=grade_estimate.get('confidence'))
        
        # Get valuation for ROI calculations
        valuation = get_valuation(intake_id)
        
        # Compute recommendations
        log_job_event(job_id, 'info', 'Computing grading recommendations')
        recommendation_engine = RecommendationEngine()
        recommendations = recommendation_engine.compute_recommendations(
            intake_id=intake_id,
            grade_estimate=grade_estimate,
            valuation=valuation,
            attribution=attribution
        )
        
        # Store recommendations
        from src.db import upsert_grading_recommendation, get_default_ship_policy
        default_policy = get_default_ship_policy()
        ship_policy_id = default_policy['id'] if default_policy else None
        
        for rec in recommendations:
            upsert_grading_recommendation(
                intake_id=intake_id,
                service_id=rec['service_id'],
                recommendation_data=rec,
                ship_policy_id=ship_policy_id
            )
        
        logger.info("Recommendations stored", job_id=job_id, recommendation_count=len(recommendations))
        
        # Mark job as succeeded
        duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)
        update_job_status(job_id, 'succeeded', None)
        logger.info("Grading job succeeded", 
                   job_id=job_id, 
                   intake_id=intake_id,
                   duration_ms=duration_ms,
                   grader_id=settings.grader_id)
        
    except Exception as e:
        error_msg = str(e)
        duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)
        logger.error("Grading job failed", 
                    job_id=job_id, 
                    intake_id=intake_id,
                    error=error_msg, 
                    duration_ms=duration_ms,
                    grader_id=settings.grader_id,
                    exc_info=True)
        log_job_event(job_id, 'error', f'Job failed: {error_msg}')
        update_job_status(job_id, 'failed', error_msg)
    
    finally:
        # Always stop heartbeat thread, even on early returns or exceptions
        heartbeat_stop.set()
        heartbeat_thread.join(timeout=2)
        if heartbeat_thread.is_alive():
            logger.warning("Heartbeat thread did not stop within timeout", job_id=job_id)


def run_grader():
    """Main grader loop with atomic job claiming."""
    logger.info("Grader started", grader_id=settings.grader_id)
    
    try:
        while True:
            # Atomically claim the next available grading job
            job = claim_next_job(settings.grader_id)
            
            if job:
                # Process the claimed job
                process_job(job)
                # Small delay after processing
                time.sleep(1)
            else:
                # No jobs available, wait before next poll
                time.sleep(settings.poll_interval_seconds)
                
    except KeyboardInterrupt:
        logger.info("Grader stopped by user", grader_id=settings.grader_id)
    finally:
        logger.info("Grader stopped", grader_id=settings.grader_id)


if __name__ == "__main__":
    run_grader()

