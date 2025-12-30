"""Smoke test script for worker functionality."""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from src.config import settings
from src.db import supabase, claim_next_job, update_job_status
from src.worker import process_job
import uuid

def create_test_intake():
    """Create a test intake and attribution."""
    # Create intake
    intake_result = supabase.table("coin_intakes") \
        .insert({
            "intake_number": f"SMOKE-TEST-{uuid.uuid4().hex[:8]}",
            "status": "pending"
        }) \
        .execute()
    
    intake_id = intake_result.data[0]['id']
    
    # Create attribution
    supabase.table("attributions") \
        .insert({
            "intake_id": intake_id,
            "year": 1921,
            "denomination": "dollar",
            "mintmark": "S",
            "series": "Morgan Dollar",
            "title": "1921 S Morgan Dollar"
        }) \
        .execute()
    
    return intake_id


def create_test_job(intake_id):
    """Create a test job."""
    # Get first enabled source
    source_result = supabase.table("sources") \
        .select("id") \
        .eq("enabled", True) \
        .limit(1) \
        .execute()
    
    if not source_result.data:
        raise Exception("No enabled sources found")
    
    source_id = source_result.data[0]['id']
    
    # Create job
    job_result = supabase.table("scrape_jobs") \
        .insert({
            "intake_id": intake_id,
            "source_id": source_id,
            "query_params": {},
            "status": "pending"
        }) \
        .execute()
    
    return job_result.data[0]


def cleanup_test_data(intake_id):
    """Clean up test data."""
    try:
        # Delete job (if exists)
        supabase.table("scrape_jobs") \
            .delete() \
            .eq("intake_id", intake_id) \
            .execute()
        
        # Delete valuation (if exists)
        supabase.table("valuations") \
            .delete() \
            .eq("intake_id", intake_id) \
            .execute()
        
        # Delete price points (if exists)
        supabase.table("price_points") \
            .delete() \
            .eq("intake_id", intake_id) \
            .execute()
        
        # Delete attribution
        supabase.table("attributions") \
            .delete() \
            .eq("intake_id", intake_id) \
            .execute()
        
        # Delete intake
        supabase.table("coin_intakes") \
            .delete() \
            .eq("id", intake_id) \
            .execute()
        
        print(f"✓ Cleaned up test data for intake {intake_id}")
    except Exception as e:
        print(f"⚠ Warning: Failed to cleanup test data: {e}")


def run_smoke_test():
    """Run smoke test."""
    print("Starting smoke test...")
    
    intake_id = None
    try:
        # Create test data
        print("Creating test intake and attribution...")
        intake_id = create_test_intake()
        print(f"✓ Created test intake: {intake_id}")
        
        # Create test job
        print("Creating test job...")
        job = create_test_job(intake_id)
        job_id = job['id']
        print(f"✓ Created test job: {job_id}")
        
        # Process job
        print("Processing job...")
        process_job(job)
        print("✓ Job processed")
        
        # Verify results
        print("Verifying results...")
        
        # Check job status
        job_result = supabase.table("scrape_jobs") \
            .select("status") \
            .eq("id", job_id) \
            .single() \
            .execute()
        
        job_status = job_result.data['status']
        assert job_status in ['succeeded', 'failed'], f"Expected succeeded or failed, got {job_status}"
        print(f"✓ Job status: {job_status}")
        
        # Check price points
        price_points_result = supabase.table("price_points") \
            .select("id") \
            .eq("intake_id", intake_id) \
            .execute()
        
        price_point_count = len(price_points_result.data) if price_points_result.data else 0
        print(f"✓ Price points created: {price_point_count}")
        
        # Check valuation (if job succeeded)
        if job_status == 'succeeded':
            valuation_result = supabase.table("valuations") \
                .select("id, confidence_score, comp_count") \
                .eq("intake_id", intake_id) \
                .execute()
            
            if valuation_result.data:
                valuation = valuation_result.data[0]
                print(f"✓ Valuation created: confidence={valuation['confidence_score']}, comps={valuation['comp_count']}")
            else:
                print("⚠ No valuation created (may be expected if no price points)")
        
        print("\n✓ Smoke test passed!")
        return True
        
    except Exception as e:
        print(f"\n✗ Smoke test failed: {e}")
        import traceback
        traceback.print_exc()
        return False
        
    finally:
        # Cleanup
        if intake_id:
            cleanup_test_data(intake_id)


if __name__ == "__main__":
    success = run_smoke_test()
    sys.exit(0 if success else 1)


