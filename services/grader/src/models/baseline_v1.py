"""Baseline grade estimation model v1.

Implements basic image analysis for grade estimation:
- Image quality checks (focus, glare, resolution)
- Surface preservation features (edge density, texture, wear)
- Details risk heuristics (cleaning, corrosion, etc.)
- Grade bucket mapping (AG, G, VG, F, VF, XF, AU, MS)
"""
from typing import List, Dict, Optional
import structlog
from src.db import download_image, get_image_url
from src.image_utils import (
    download_image_from_bytes,
    download_image_from_url,
    check_image_quality,
    analyze_surface_features,
    detect_details_risk
)

logger = structlog.get_logger()


class BaselineGradeEstimator:
    """Baseline grade estimation model."""
    
    def __init__(self):
        """Initialize the estimator."""
        self.model_version = "baseline_v1"
    
    def estimate(self, images: List[Dict], attribution: Optional[Dict] = None) -> Optional[Dict]:
        """Estimate grade distribution for coin images.
        
        Args:
            images: List of image dictionaries from coin_media table
            attribution: Optional attribution data for context
            
        Returns:
            Grade estimate dictionary or None if estimation fails
        """
        logger.info("Running grade estimation", image_count=len(images), model_version=self.model_version)
        
        if not images:
            logger.warning("No images provided for estimation")
            return None
        
        # Filter to obverse and reverse (primary images)
        primary_images = [img for img in images if img.get('media_type') in ['obverse', 'reverse']]
        if not primary_images:
            primary_images = images[:2]  # Fallback to first two images
        
        # Download and analyze images
        image_analyses = []
        quality_status = 'good'
        all_details_risks = {
            'cleaned': 0.0,
            'scratches': 0.0,
            'corrosion': 0.0,
            'damage': 0.0,
            'pvc': 0.0,
            'environmental': 0.0,
            'questionable_color': 0.0
        }
        
        for img_data in primary_images[:2]:  # Analyze up to 2 images
            storage_path = img_data.get('storage_path')
            if not storage_path:
                continue
            
            # Download image
            img_bytes = download_image(storage_path)
            if not img_bytes:
                logger.warning("Failed to download image", storage_path=storage_path)
                continue
            
            # Load image
            img = download_image_from_bytes(img_bytes)
            if not img:
                logger.warning("Failed to load image", storage_path=storage_path)
                continue
            
            # Analyze image
            quality = check_image_quality(img)
            features = analyze_surface_features(img)
            risks = detect_details_risk(img)
            
            image_analyses.append({
                'quality': quality,
                'features': features,
                'risks': risks
            })
            
            # Aggregate details risks (take maximum)
            for key in all_details_risks:
                all_details_risks[key] = max(all_details_risks[key], risks.get(key, 0.0))
            
            # Check quality status
            if not quality.get('is_sufficient_quality', True):
                quality_status = 'low_resolution'
            elif not quality.get('is_focused', True):
                quality_status = 'blurry'
            elif quality.get('has_glare', False):
                quality_status = 'glare'
        
        if not image_analyses:
            logger.warning("No images could be analyzed")
            return None
        
        # Aggregate features across images
        avg_edge_density = sum(ana['features']['edge_density'] for ana in image_analyses) / len(image_analyses)
        avg_wear = sum(ana['features']['wear_indicator'] for ana in image_analyses) / len(image_analyses)
        avg_luster = sum(ana['features']['luster_score'] for ana in image_analyses) / len(image_analyses)
        
        # Map features to grade distribution
        grade_distribution = self._map_features_to_grades(
            edge_density=avg_edge_density,
            wear=avg_wear,
            luster=avg_luster,
            details_risks=all_details_risks
        )
        
        # Determine most likely bucket
        grade_bucket = max(grade_distribution.items(), key=lambda x: x[1])[0]
        
        # Calculate confidence based on image quality
        confidence = 0.7 if quality_status == 'good' else 0.5
        
        # Build notes
        notes_parts = []
        if quality_status != 'good':
            notes_parts.append(f"Quality status: {quality_status}")
        if max(all_details_risks.values()) > 0.3:
            high_risks = [k for k, v in all_details_risks.items() if v > 0.3]
            notes_parts.append(f"High details risk detected: {', '.join(high_risks)}")
        
        notes = "; ".join(notes_parts) if notes_parts else "Baseline estimate based on image analysis"
        
        return {
            'model_version': self.model_version,
            'grade_bucket': grade_bucket,
            'grade_distribution': grade_distribution,
            'details_risk': all_details_risks,
            'confidence': confidence,
            'notes': notes
        }
    
    def _map_features_to_grades(
        self,
        edge_density: float,
        wear: float,
        luster: float,
        details_risks: Dict[str, float]
    ) -> Dict[str, float]:
        """Map surface features to grade distribution.
        
        Args:
            edge_density: Edge density score (0-1)
            wear: Wear indicator (0-1, higher = more wear)
            luster: Luster score (0-1)
            details_risks: Dictionary of risk probabilities
            
        Returns:
            Grade distribution dictionary
        """
        # Simplified mapping logic
        # In a full implementation, this would use a trained model
        
        # Start with default distribution
        distribution = {
            'AG': 0.0,
            'G': 0.0,
            'VG': 0.0,
            'F': 0.0,
            'VF': 0.0,
            'XF': 0.0,
            'AU': 0.0,
            'MS': 0.0
        }
        
        # High details risk pushes toward lower grades
        max_risk = max(details_risks.values())
        if max_risk > 0.5:
            # High risk of details issue - focus on circulated grades
            distribution['AG'] = 0.1
            distribution['G'] = 0.15
            distribution['VG'] = 0.2
            distribution['F'] = 0.2
            distribution['VF'] = 0.15
            distribution['XF'] = 0.1
            distribution['AU'] = 0.05
            distribution['MS'] = 0.05
        elif wear > 0.7:
            # Heavy wear - circulated grades
            distribution['AG'] = 0.05
            distribution['G'] = 0.1
            distribution['VG'] = 0.15
            distribution['F'] = 0.2
            distribution['VF'] = 0.2
            distribution['XF'] = 0.15
            distribution['AU'] = 0.1
            distribution['MS'] = 0.05
        elif wear > 0.4:
            # Moderate wear - XF/AU range
            distribution['VF'] = 0.15
            distribution['XF'] = 0.25
            distribution['AU'] = 0.35
            distribution['MS'] = 0.25
        elif luster > 0.6 and edge_density > 0.5:
            # Good luster and detail - Mint State
            distribution['XF'] = 0.1
            distribution['AU'] = 0.2
            distribution['MS'] = 0.7
        else:
            # Default - AU/MS range
            distribution['XF'] = 0.1
            distribution['AU'] = 0.35
            distribution['MS'] = 0.55
        
        # Normalize to ensure sum = 1.0
        total = sum(distribution.values())
        if total > 0:
            distribution = {k: v / total for k, v in distribution.items()}
        
        return distribution

