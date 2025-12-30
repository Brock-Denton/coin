"""Grading recommendation engine.

Computes ROI calculations and recommendations for each grading service.
Implements two-stage approach: certified comps override + multipliers fallback.
"""
from typing import List, Dict, Optional
import structlog
from statistics import median
from src.db import (
    get_grading_services,
    get_default_ship_policy,
    get_certified_comps,
    get_grade_multipliers
)

logger = structlog.get_logger()


class RecommendationEngine:
    """Grading recommendation engine."""
    
    def __init__(self):
        """Initialize the recommendation engine."""
        pass
    
    def compute_recommendations(
        self,
        intake_id: str,
        grade_estimate: Dict,
        valuation: Optional[Dict],
        attribution: Optional[Dict] = None
    ) -> List[Dict]:
        """Compute grading recommendations for all enabled services.
        
        Args:
            intake_id: Intake ID
            grade_estimate: Grade estimate dictionary
            valuation: Optional valuation dictionary
            attribution: Optional attribution dictionary
            
        Returns:
            List of recommendation dictionaries
        """
        logger.info("Computing recommendations", intake_id=intake_id)
        
        services = get_grading_services(enabled_only=True)
        default_policy = get_default_ship_policy()
        
        if not services:
            logger.warning("No enabled grading services found")
            return []
        
        # Get expected raw value from valuation
        expected_raw_value_cents = valuation.get('price_cents_median', 0) if valuation else 0
        
        if expected_raw_value_cents <= 0:
            logger.warning("No raw value available, cannot compute recommendations", intake_id=intake_id)
            return []
        
        recommendations = []
        
        # Extract attribution info for certified comps and multiplier lookup
        denomination = attribution.get('denomination') if attribution else None
        series = attribution.get('series') if attribution else None
        year = attribution.get('year') if attribution else None
        
        # Get certified comps (if available)
        certified_comps = get_certified_comps(intake_id, denomination=denomination, series=series)
        
        # Get multipliers (for fallback)
        multipliers = get_grade_multipliers(
            version='baseline_v1',
            denomination=denomination,
            series=series
        )
        
        # Get grade distribution from estimate
        grade_distribution = grade_estimate.get('grade_distribution', {})
        details_risk = grade_estimate.get('details_risk', {})
        
        # Check for high details risk
        max_details_risk = max(details_risk.values()) if details_risk else 0.0
        if max_details_risk > 0.5:
            # High details risk - recommend not grading
            for service in services:
                rec = {
                    'service_id': service['id'],
                    'expected_raw_value_cents': expected_raw_value_cents,
                    'expected_graded_value_cents': expected_raw_value_cents,  # No premium
                    'total_cost_cents': self._calculate_total_cost(service, default_policy, expected_raw_value_cents),
                    'expected_profit_cents': -self._calculate_total_cost(service, default_policy, expected_raw_value_cents),
                    'recommendation': 'high_details_risk',
                    'breakdown': {
                        'method_used': 'details_risk_rejection',
                        'max_details_risk': max_details_risk
                    }
                }
                recommendations.append(rec)
            return recommendations
        
        for service in services:
            # Calculate expected graded value using two-stage approach
            expected_graded_value_cents, breakdown = self._calculate_expected_graded_value(
                expected_raw_value_cents=expected_raw_value_cents,
                grade_distribution=grade_distribution,
                certified_comps=certified_comps,
                multipliers=multipliers,
                denomination=denomination,
                series=series
            )
            
            # Calculate costs
            total_cost_cents = self._calculate_total_cost(service, default_policy, expected_raw_value_cents)
            
            # Calculate expected profit
            expected_profit_cents = expected_graded_value_cents - total_cost_cents - expected_raw_value_cents
            
            # Determine recommendation
            recommendation = self._determine_recommendation(
                expected_profit_cents=expected_profit_cents,
                total_cost_cents=total_cost_cents,
                expected_raw_value_cents=expected_raw_value_cents,
                grade_estimate=grade_estimate
            )
            
            rec = {
                'service_id': service['id'],
                'expected_raw_value_cents': expected_raw_value_cents,
                'expected_graded_value_cents': expected_graded_value_cents,
                'total_cost_cents': total_cost_cents,
                'expected_profit_cents': expected_profit_cents,
                'recommendation': recommendation,
                'breakdown': breakdown
            }
            
            recommendations.append(rec)
        
        logger.info("Computed recommendations", intake_id=intake_id, count=len(recommendations))
        return recommendations
    
    def _calculate_expected_graded_value(
        self,
        expected_raw_value_cents: int,
        grade_distribution: Dict[str, float],
        certified_comps: List[Dict],
        multipliers: Dict[str, float],
        denomination: Optional[str] = None,
        series: Optional[str] = None
    ) -> tuple[int, Dict]:
        """Calculate expected graded value using certified comps or multipliers.
        
        Args:
            expected_raw_value_cents: Expected raw value in cents
            grade_distribution: Grade distribution from estimate
            certified_comps: List of certified comps
            multipliers: Multiplier dictionary
            denomination: Optional denomination
            series: Optional series
            
        Returns:
            Tuple of (expected_graded_value_cents, breakdown_dict)
        """
        breakdown = {
            'method_used': 'multipliers',  # Default
            'multiplier_version': 'baseline_v1',
            'multiplier_lookup_path': 'generic'
        }
        
        # Stage 1: Try certified comps
        if len(certified_comps) >= 10:
            # Try to use certified comps
            comp_values_by_bucket = {}
            comp_counts_by_bucket = {}
            
            for comp in certified_comps:
                price_point = comp.get('price_point', {})
                price_cents = price_point.get('price_cents', 0)
                if price_cents <= 0:
                    continue
                
                # Get grade bucket from certified comp
                grade_prefix = comp.get('grade_prefix')
                grade_numeric = comp.get('grade_numeric')
                details_flag = comp.get('details_flag', False)
                
                # Skip details coins for value calculation
                if details_flag:
                    continue
                
                # Map to grade bucket
                bucket = self._map_grade_to_bucket(grade_prefix, grade_numeric)
                if not bucket:
                    continue
                
                if bucket not in comp_values_by_bucket:
                    comp_values_by_bucket[bucket] = []
                    comp_counts_by_bucket[bucket] = 0
                
                comp_values_by_bucket[bucket].append(price_cents)
                comp_counts_by_bucket[bucket] += 1
            
            breakdown['certified_comps_total'] = len(certified_comps)
            breakdown['bucket_methods'] = {}
            breakdown['bucket_comps_counts'] = {}
            
            # Calculate expected value using comps where we have enough data
            total_weighted_value = 0.0
            total_weight = 0.0
            
            for bucket, probability in grade_distribution.items():
                if probability <= 0:
                    continue
                
                bucket_values = comp_values_by_bucket.get(bucket, [])
                comp_count = comp_counts_by_bucket.get(bucket, 0)
                
                breakdown['bucket_comps_counts'][bucket] = comp_count
                
                if comp_count >= 3:
                    # Use median of comps for this bucket
                    median_value = int(median(bucket_values))
                    total_weighted_value += median_value * probability
                    total_weight += probability
                    breakdown['bucket_methods'][bucket] = 'certified_comps'
                else:
                    # Not enough comps, fallback to nearest grade or multipliers
                    nearest_bucket = self._find_nearest_grade_with_comps(bucket, comp_counts_by_bucket)
                    if nearest_bucket and comp_counts_by_bucket[nearest_bucket] >= 3:
                        nearest_values = comp_values_by_bucket[nearest_bucket]
                        median_value = int(median(nearest_values))
                        total_weighted_value += median_value * probability
                        total_weight += probability
                        breakdown['bucket_methods'][bucket] = f'certified_comps_nearest_{nearest_bucket}'
                    else:
                        # Fallback to multipliers
                        multiplier = multipliers.get(bucket, 1.0)
                        estimated_value = int(expected_raw_value_cents * multiplier)
                        total_weighted_value += estimated_value * probability
                        total_weight += probability
                        breakdown['bucket_methods'][bucket] = 'multipliers'
            
            if total_weight > 0:
                expected_value = int(total_weighted_value / total_weight)
                breakdown['method_used'] = 'certified_comps_with_fallback'
                return expected_value, breakdown
        
        # Stage 2: Fallback to multipliers
        breakdown['method_used'] = 'multipliers'
        if denomination and series:
            breakdown['multiplier_lookup_path'] = f'{denomination}+{series}'
        elif denomination:
            breakdown['multiplier_lookup_path'] = denomination
        else:
            breakdown['multiplier_lookup_path'] = 'generic'
        
        total_weighted_value = 0.0
        total_weight = 0.0
        
        for bucket, probability in grade_distribution.items():
            if probability <= 0:
                continue
            
            multiplier = multipliers.get(bucket, 1.0)
            estimated_value = expected_raw_value_cents * multiplier
            total_weighted_value += estimated_value * probability
            total_weight += probability
        
        expected_value = int(total_weighted_value / total_weight) if total_weight > 0 else expected_raw_value_cents
        return expected_value, breakdown
    
    def _map_grade_to_bucket(self, grade_prefix: Optional[str], grade_numeric: Optional[int]) -> Optional[str]:
        """Map grade prefix and numeric to bucket.
        
        Args:
            grade_prefix: Grade prefix (MS, AU, XF, etc.)
            grade_numeric: Grade numeric (60, 65, etc.)
            
        Returns:
            Bucket string or None
        """
        if not grade_prefix:
            return None
        
        grade_prefix_upper = grade_prefix.upper()
        
        # MS with numeric becomes MS60-MS67
        if grade_prefix_upper == 'MS' and grade_numeric is not None:
            if 60 <= grade_numeric <= 67:
                return f'MS{grade_numeric}'
            else:
                return 'MS'  # Fallback to generic MS
        
        # Other prefixes map directly
        return grade_prefix_upper
    
    def _find_nearest_grade_with_comps(self, bucket: str, comp_counts: Dict[str, int]) -> Optional[str]:
        """Find nearest grade bucket that has enough comps.
        
        Args:
            bucket: Current bucket
            comp_counts: Dictionary of bucket -> comp count
            
        Returns:
            Nearest bucket with >= 3 comps, or None
        """
        # Simple implementation: check adjacent buckets
        # Full implementation could use grade ordering
        
        # Check if bucket itself has comps
        if comp_counts.get(bucket, 0) >= 3:
            return bucket
        
        # Order of buckets (lowest to highest)
        bucket_order = ['AG', 'G', 'VG', 'F', 'VF', 'XF', 'AU', 'MS', 'MS60', 'MS61', 'MS62', 'MS63', 'MS64', 'MS65', 'MS66', 'MS67']
        
        try:
            current_idx = bucket_order.index(bucket)
        except ValueError:
            return None
        
        # Check adjacent buckets
        for offset in [1, -1, 2, -2, 3, -3]:
            check_idx = current_idx + offset
            if 0 <= check_idx < len(bucket_order):
                check_bucket = bucket_order[check_idx]
                if comp_counts.get(check_bucket, 0) >= 3:
                    return check_bucket
        
        return None
    
    def _calculate_total_cost(
        self,
        service: Dict,
        ship_policy: Optional[Dict],
        declared_value_cents: int
    ) -> int:
        """Calculate total grading cost.
        
        Args:
            service: Grading service dictionary
            ship_policy: Shipping policy dictionary (optional)
            declared_value_cents: Declared value in cents
            
        Returns:
            Total cost in cents
        """
        total = 0
        
        # Base fee
        total += service.get('base_fee_cents', 0)
        
        # Per coin fee (assuming 1 coin)
        total += service.get('per_coin_fee_cents', 0)
        
        # Membership fee (one-time, but we'll include it for simplicity)
        if service.get('requires_membership', False):
            total += service.get('membership_fee_cents', 0)
        
        # Shipping costs
        if ship_policy:
            # Outbound shipping (to grader)
            total += ship_policy.get('outbound_shipping_cents', 0)
            
            # Return shipping (from grader)
            total += ship_policy.get('return_shipping_cents', 0)
            
            # Insurance cost (calculated from rate in basis points)
            insurance_rate_bps = ship_policy.get('insurance_rate_bps', 0)
            if insurance_rate_bps > 0:
                insurance_rate = insurance_rate_bps / 10000.0  # Convert basis points to decimal
                total += int(declared_value_cents * insurance_rate)
            
            # Handling fee
            total += ship_policy.get('handling_cents', 0)
        
        return total
    
    def _determine_recommendation(
        self,
        expected_profit_cents: int,
        total_cost_cents: int,
        expected_raw_value_cents: int,
        grade_estimate: Dict
    ) -> str:
        """Determine recommendation based on ROI analysis.
        
        Args:
            expected_profit_cents: Expected profit in cents
            total_cost_cents: Total cost in cents
            expected_raw_value_cents: Expected raw value in cents
            grade_estimate: Grade estimate dictionary
            
        Returns:
            Recommendation string
        """
        # Check image quality
        confidence = grade_estimate.get('confidence', 0.5)
        if confidence < 0.4:
            return 'needs_better_photos'
        
        # Check if profit is positive and meaningful
        profit_margin = (expected_profit_cents / expected_raw_value_cents) if expected_raw_value_cents > 0 else 0
        
        if expected_profit_cents > 0 and profit_margin > 0.15:  # At least 15% profit margin
            return 'submit_for_grading'
        elif expected_profit_cents > 0:
            return 'submit_for_grading'  # Still profitable, just lower margin
        else:
            return 'sell_raw'
