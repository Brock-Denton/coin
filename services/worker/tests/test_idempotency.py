"""Test idempotency of price point inserts."""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import uuid
from src.db import supabase, insert_price_points


def test_price_points_idempotency():
    """Test that inserting the same price point twice doesn't create duplicates."""
    # Create test intake
    intake_result = supabase.table("coin_intakes") \
        .insert({
            "intake_number": f"TEST-IDEMPOTENCY-{uuid.uuid4().hex[:8]}",
            "status": "pending"
        }) \
        .execute()
    
    intake_id = intake_result.data[0]['id']
    
    # Get a source
    source_result = supabase.table("sources") \
        .select("id") \
        .eq("enabled", True) \
        .limit(1) \
        .execute()
    
    if not source_result.data:
        print("⚠ No enabled sources found, skipping test")
        return True
    
    source_id = source_result.data[0]['id']
    
    # Create test price point
    dedupe_key = f"test_{uuid.uuid4().hex[:16]}"
    price_point = {
        'intake_id': intake_id,
        'source_id': source_id,
        'dedupe_key': dedupe_key,
        'price_cents': 1000,
        'price_type': 'sold',
        'listing_url': 'https://example.com/test',
        'listing_title': 'Test Listing',
        'match_strength': 0.5,
        'filtered_out': False
    }
    
    try:
        # Insert first time
        insert_price_points([price_point])
        
        # Count price points
        count1_result = supabase.table("price_points") \
            .select("id", count="exact") \
            .eq("intake_id", intake_id) \
            .eq("dedupe_key", dedupe_key) \
            .execute()
        
        count1 = count1_result.count if hasattr(count1_result, 'count') else len(count1_result.data or [])
        print(f"✓ First insert: {count1} price point(s)")
        assert count1 == 1, f"Expected 1 price point after first insert, got {count1}"
        
        # Insert same price point again (should update, not duplicate)
        insert_price_points([price_point])
        
        # Count again
        count2_result = supabase.table("price_points") \
            .select("id", count="exact") \
            .eq("intake_id", intake_id) \
            .eq("dedupe_key", dedupe_key) \
            .execute()
        
        count2 = count2_result.count if hasattr(count2_result, 'count') else len(count2_result.data or [])
        print(f"✓ Second insert: {count2} price point(s)")
        assert count2 == 1, f"Expected 1 price point after second insert (idempotent), got {count2}"
        
        # Test with improved match_strength (should update)
        price_point_improved = price_point.copy()
        price_point_improved['match_strength'] = 0.9
        price_point_improved['price_cents'] = 1100
        
        insert_price_points([price_point_improved])
        
        # Verify update
        updated_result = supabase.table("price_points") \
            .select("match_strength, price_cents") \
            .eq("intake_id", intake_id) \
            .eq("dedupe_key", dedupe_key) \
            .single() \
            .execute()
        
        updated_match_strength = float(updated_result.data['match_strength'])
        updated_price = updated_result.data['price_cents']
        print(f"✓ After improved insert: match_strength={updated_match_strength}, price={updated_price}")
        assert updated_match_strength == 0.9, f"Expected match_strength 0.9, got {updated_match_strength}"
        assert updated_price == 1100, f"Expected price 1100, got {updated_price}"
        
        print("\n✓ All idempotency tests passed!")
        return True
        
    except Exception as e:
        print(f"\n✗ Test failed: {e}")
        import traceback
        traceback.print_exc()
        return False
        
    finally:
        # Cleanup
        try:
            supabase.table("price_points") \
                .delete() \
                .eq("intake_id", intake_id) \
                .execute()
            supabase.table("coin_intakes") \
                .delete() \
                .eq("id", intake_id) \
                .execute()
        except Exception:
            pass


if __name__ == "__main__":
    success = test_price_points_idempotency()
    sys.exit(0 if success else 1)

