"""Collectors for different pricing sources."""
from abc import ABC, abstractmethod

class BaseCollector(ABC):
    """Base class for all collectors."""
    
    @abstractmethod
    def collect(self, query_params: dict) -> list:
        """Collect price points from the source.
        
        Args:
            query_params: Dictionary with query parameters (year, mintmark, title, etc.)
            
        Returns:
            List of price point dictionaries
        """
        pass



