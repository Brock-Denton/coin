"""Image utility functions for downloading and processing coin images."""
import io
import requests
from typing import Optional, Tuple
from PIL import Image
import numpy as np
import structlog

logger = structlog.get_logger()


def download_image_from_url(url: str) -> Optional[Image.Image]:
    """Download an image from a URL and return a PIL Image.
    
    Args:
        url: Image URL
        
    Returns:
        PIL Image or None if download fails
    """
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        img = Image.open(io.BytesIO(response.content))
        return img
    except Exception as e:
        logger.error("Failed to download image from URL", url=url, error=str(e))
        return None


def download_image_from_bytes(data: bytes) -> Optional[Image.Image]:
    """Load an image from bytes and return a PIL Image.
    
    Args:
        data: Image bytes
        
    Returns:
        PIL Image or None if load fails
    """
    try:
        img = Image.open(io.BytesIO(data))
        return img
    except Exception as e:
        logger.error("Failed to load image from bytes", error=str(e))
        return None


def check_image_quality(img: Image.Image) -> dict:
    """Check basic image quality metrics.
    
    Args:
        img: PIL Image
        
    Returns:
        Dictionary with quality metrics: resolution, aspect_ratio, is_focused, has_glare, coverage_score
    """
    width, height = img.size
    total_pixels = width * height
    
    # Convert to grayscale for analysis
    gray = img.convert('L')
    gray_array = np.array(gray)
    
    # Basic quality checks
    metrics = {
        'resolution': total_pixels,
        'width': width,
        'height': height,
        'aspect_ratio': width / height if height > 0 else 0,
        'is_focused': True,  # Placeholder - would use edge detection
        'has_glare': False,  # Placeholder - would use brightness/contrast analysis
        'coverage_score': 1.0,  # Placeholder - would check if coin fills frame
        'is_sufficient_quality': total_pixels >= 500000  # At least ~700x700 pixels
    }
    
    # Simple focus check using variance of Laplacian (edge detection)
    # Higher variance = sharper image
    try:
        import cv2
        laplacian_var = cv2.Laplacian(gray_array, cv2.CV_64F).var()
        metrics['focus_variance'] = float(laplacian_var)
        metrics['is_focused'] = laplacian_var > 100  # Threshold for "focused"
    except ImportError:
        logger.warning("OpenCV not available, using placeholder focus check")
    
    # Simple glare detection (check for very bright areas)
    try:
        bright_pixels = np.sum(gray_array > 240)  # Very bright pixels
        bright_ratio = bright_pixels / total_pixels
        metrics['has_glare'] = bright_ratio > 0.1  # More than 10% very bright pixels
        metrics['glare_ratio'] = float(bright_ratio)
    except Exception as e:
        logger.warning("Glare detection failed", error=str(e))
    
    return metrics


def analyze_surface_features(img: Image.Image) -> dict:
    """Analyze surface preservation features.
    
    Args:
        img: PIL Image
        
    Returns:
        Dictionary with surface features: edge_density, texture_score, scratch_score, luster_score, wear_indicator
    """
    # Convert to grayscale
    gray = img.convert('L')
    gray_array = np.array(gray)
    
    features = {
        'edge_density': 0.5,  # Placeholder - would use edge detection
        'texture_score': 0.5,  # Placeholder - would analyze texture
        'scratch_score': 0.0,  # Placeholder - would detect linear scratches
        'luster_score': 0.5,  # Placeholder - would analyze reflectivity
        'wear_indicator': 0.5  # Placeholder - would analyze high points
    }
    
    # Simple edge density using gradient magnitude (numpy-only approach)
    try:
        # Compute gradients using numpy
        gy = np.diff(gray_array.astype(float), axis=0)
        gx = np.diff(gray_array.astype(float), axis=1)
        # Pad to same size
        gy = np.pad(gy, ((0, 1), (0, 0)), mode='edge')
        gx = np.pad(gx, ((0, 0), (0, 1)), mode='edge')
        gradient_magnitude = np.sqrt(gx**2 + gy**2)
        features['edge_density'] = float(np.mean(gradient_magnitude) / 255.0)
    except Exception as e:
        logger.warning("Edge density calculation failed", error=str(e))
    
    # Simple scratch detection (would need more sophisticated approach)
    # For now, placeholder
    
    return features


def detect_details_risk(img: Image.Image) -> dict:
    """Detect details risk indicators (cleaning, corrosion, PVC, etc.).
    
    Args:
        img: PIL Image
        
    Returns:
        Dictionary with risk probabilities: cleaned, scratches, corrosion, damage, pvc, environmental, questionable_color
    """
    # Placeholder implementation
    # Full implementation would use color analysis, texture analysis, etc.
    
    risks = {
        'cleaned': 0.1,  # Placeholder
        'scratches': 0.05,  # Placeholder
        'corrosion': 0.02,  # Placeholder
        'damage': 0.03,  # Placeholder
        'pvc': 0.0,  # Placeholder
        'environmental': 0.05,  # Placeholder
        'questionable_color': 0.05  # Placeholder
    }
    
    # Simple color analysis (check for unusual colors that might indicate cleaning)
    try:
        rgb_array = np.array(img)
        # Check for very uniform colors (might indicate cleaning)
        color_variance = np.var(rgb_array.reshape(-1, 3), axis=0)
        avg_variance = np.mean(color_variance)
        if avg_variance < 100:  # Very low variance might indicate cleaning
            risks['cleaned'] = 0.3
    except Exception as e:
        logger.warning("Color analysis failed", error=str(e))
    
    return risks

