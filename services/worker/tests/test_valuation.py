"""Unit tests for ValuationEngine."""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from src.valuation import ValuationEngine


def test_valuation_engine_import():
    """Test that ValuationEngine can be imported and instantiated."""
    engine = ValuationEngine(sources=[])
    assert engine is not None
    print("✓ ValuationEngine imports and instantiates successfully")


def test_valuation_engine_basic():
    """Test basic valuation computation."""
    engine = ValuationEngine(sources=[])
    
    # Test with empty price points
    result = engine.compute_valuation([])
    assert result['comp_count'] == 0
    assert result['confidence_score'] == 1
    print("✓ Empty price points handled correctly")


if __name__ == "__main__":
    test_valuation_engine_import()
    test_valuation_engine_basic()
    print("\nAll basic tests passed!")


