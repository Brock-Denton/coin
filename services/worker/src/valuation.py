"""Valuation engine for computing prices from price points."""
import statistics
from typing import List, Dict, Optional
import structlog

logger = structlog.get_logger()


class ValuationEngine:
    """Engine for computing valuations from price points."""
    
    def __init__(self, sources: List[Dict] = None):
        """Initialize valuation engine.
        
        Args:
            sources: List of source dictionaries with reputation_weight
        """
        self.sources = {s['id']: s for s in (sources or [])}
    
    def _filter_outliers(self, prices: List[int], method: str = 'iqr') -> List[int]:
        """Filter outliers from price list.
        
        Args:
            prices: List of prices in cents
            method: Method to use ('iqr' or 'zscore')
            
        Returns:
            Filtered list of prices
        """
        if len(prices) < 3:
            return prices
        
        if method == 'iqr':
            # Use IQR method
            sorted_prices = sorted(prices)
            q1_index = len(sorted_prices) // 4
            q3_index = (3 * len(sorted_prices)) // 4
            q1 = sorted_prices[q1_index]
            q3 = sorted_prices[q3_index]
            iqr = q3 - q1
            
            lower_bound = q1 - 1.5 * iqr
            upper_bound = q3 + 1.5 * iqr
            
            filtered = [p for p in prices if lower_bound <= p <= upper_bound]
            logger.debug("Filtered outliers", original_count=len(prices), filtered_count=len(filtered))
            return filtered
        
        return prices
    
    def _compute_percentiles(self, prices: List[int]) -> Dict[str, Optional[int]]:
        """Compute percentiles from price list.
        
        Args:
            prices: List of prices in cents
            
        Returns:
            Dictionary with p10, median, p90, mean
        """
        if not prices:
            return {
                'p10': None,
                'median': None,
                'p90': None,
                'mean': None
            }
        
        sorted_prices = sorted(prices)
        n = len(sorted_prices)
        
        # Percentile indices (0-indexed)
        p10_idx = int(0.10 * (n - 1))
        median_idx = int(0.50 * (n - 1))
        p90_idx = int(0.90 * (n - 1))
        
        return {
            'p10': sorted_prices[p10_idx],
            'median': sorted_prices[median_idx],
            'p90': sorted_prices[p90_idx],
            'mean': int(statistics.mean(sorted_prices))
        }
    
    def _compute_confidence_score(
        self,
        price_points: List[Dict],
        percentiles: Dict[str, Optional[int]],
        comp_count: int
    ) -> int:
        """Compute confidence score (1-10) based on various factors.
        
        Args:
            price_points: List of price point dictionaries
            percentiles: Computed percentiles
            comp_count: Number of comps used
            
        Returns:
            Confidence score from 1-10
        """
        score = 0
        max_score = 10
        
        # Factor 1: Number of comps (0-3 points)
        if comp_count >= 20:
            score += 3
        elif comp_count >= 10:
            score += 2
        elif comp_count >= 5:
            score += 1
        
        # Factor 2: Source reputation (0-2 points)
        source_reputations = []
        for pp in price_points:
            source_id = pp.get('source_id')
            if source_id and source_id in self.sources:
                source_reputations.append(float(self.sources[source_id].get('reputation_weight', 1.0)))
        
        if source_reputations:
            avg_reputation = sum(source_reputations) / len(source_reputations)
            score += int(avg_reputation * 2)
        
        # Factor 3: Sold vs Ask ratio (0-2 points)
        sold_count = sum(1 for pp in price_points if pp.get('price_type') == 'sold')
        ask_count = sum(1 for pp in price_points if pp.get('price_type') == 'ask')
        total_count = sold_count + ask_count
        
        if total_count > 0:
            sold_ratio = sold_count / total_count
            if sold_ratio >= 0.8:
                score += 2
            elif sold_ratio >= 0.5:
                score += 1
            else:
                # Cap confidence if mostly ask prices
                score = min(score, 7)
        
        # Factor 4: Price spread tightness (0-3 points)
        if percentiles['median'] and percentiles['p10'] and percentiles['p90']:
            spread_ratio = (percentiles['p90'] - percentiles['p10']) / percentiles['median']
            if spread_ratio < 0.2:  # Very tight spread (<20%)
                score += 3
            elif spread_ratio < 0.4:  # Tight spread (<40%)
                score += 2
            elif spread_ratio < 0.6:  # Moderate spread (<60%)
                score += 1
        
        # Ensure score is between 1-10
        score = max(1, min(10, score))
        
        return score
    
    def _generate_explanation(
        self,
        comp_count: int,
        sold_count: int,
        ask_count: int,
        comp_sources_count: int,
        confidence_score: int,
        percentiles: Dict[str, Optional[int]]
    ) -> str:
        """Generate human-readable explanation of valuation.
        
        Args:
            comp_count: Number of comps
            sold_count: Number of sold comps
            ask_count: Number of ask comps
            comp_sources_count: Number of unique sources
            confidence_score: Computed confidence score
            percentiles: Computed percentiles
            
        Returns:
            Explanation string
        """
        parts = []
        
        parts.append(f"Valuation based on {comp_count} comparable listings")
        if comp_sources_count > 1:
            parts.append(f"from {comp_sources_count} sources")
        
        if sold_count > 0:
            parts.append(f"({sold_count} sold, {ask_count} asking)")
        
        if percentiles['median']:
            parts.append(f"\nMedian: ${percentiles['median']/100:.2f}")
            if percentiles['p10'] and percentiles['p90']:
                parts.append(f"Range (10th-90th percentile): ${percentiles['p10']/100:.2f} - ${percentiles['p90']/100:.2f}")
        
        parts.append(f"\nConfidence Score: {confidence_score}/10")
        
        if confidence_score >= 8:
            parts.append("(High confidence - strong comp data)")
        elif confidence_score >= 5:
            parts.append("(Moderate confidence - reasonable comp data)")
        else:
            parts.append("(Low confidence - limited or mixed comp data)")
        
        return " ".join(parts)
    
    def compute_valuation(self, price_points: List[Dict]) -> Dict:
        """Compute valuation from price points.
        
        Args:
            price_points: List of price point dictionaries (must not be filtered_out=True)
            
        Returns:
            Valuation dictionary
        """
        # Filter out marked as filtered
        valid_points = [pp for pp in price_points if not pp.get('filtered_out', False)]
        
        if not valid_points:
            logger.warning("No valid price points for valuation")
            return {
                'price_cents_p10': None,
                'price_cents_median': None,
                'price_cents_p90': None,
                'price_cents_mean': None,
                'confidence_score': 1,
                'explanation': 'No valid comparable listings found.',
                'comp_count': 0,
                'comp_sources_count': 0,
                'sold_count': 0,
                'ask_count': 0
            }
        
        # Extract prices
        prices = [pp['price_cents'] for pp in valid_points if pp.get('price_cents')]
        
        # Filter outliers
        filtered_prices = self._filter_outliers(prices)
        
        # Compute percentiles
        percentiles = self._compute_percentiles(filtered_prices)
        
        # Count stats
        comp_count = len(filtered_prices)
        sold_count = sum(1 for pp in valid_points if pp.get('price_type') == 'sold')
        ask_count = sum(1 for pp in valid_points if pp.get('price_type') == 'ask')
        
        # Get unique source count
        unique_sources = set(pp.get('source_id') for pp in valid_points if pp.get('source_id'))
        comp_sources_count = len(unique_sources)
        
        # Compute confidence score
        confidence_score = self._compute_confidence_score(valid_points, percentiles, comp_count)
        
        # Generate explanation
        explanation = self._generate_explanation(
            comp_count, sold_count, ask_count, comp_sources_count,
            confidence_score, percentiles
        )
        
        return {
            'price_cents_p10': percentiles['p10'],
            'price_cents_median': percentiles['median'],
            'price_cents_p90': percentiles['p90'],
            'price_cents_mean': percentiles['mean'],
            'confidence_score': confidence_score,
            'explanation': explanation,
            'comp_count': comp_count,
            'comp_sources_count': comp_sources_count,
            'sold_count': sold_count,
            'ask_count': ask_count,
            'metadata': {
                'original_comp_count': len(prices),
                'filtered_comp_count': comp_count
            }
        }



