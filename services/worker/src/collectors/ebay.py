"""eBay API collector using Buy Browse API."""
import base64
import time
from datetime import datetime, timezone
from typing import List, Dict, Optional
import requests
import structlog
from src.collectors.base import BaseCollector
from src.config import settings

logger = structlog.get_logger()

class EbayRateLimitError(Exception):
    """Raised when eBay throttles our calls (rate limit)."""
    pass


class EbayCollector(BaseCollector):
    """Collector for eBay listings using Buy Browse API with OAuth."""
    
    def __init__(self, app_id: str, cert_id: str = None, dev_id: str = None, sandbox: bool = False, source_id: str = None, rate_limit_per_minute: int = 60):
        """Initialize eBay collector.
        
        Args:
            app_id: eBay App ID (required)
            cert_id: eBay Cert ID (required for OAuth)
            dev_id: eBay Dev ID (optional, not used in Browse API)
            sandbox: Use sandbox environment (not currently supported)
            source_id: Source ID for tracking and circuit breaker
            rate_limit_per_minute: Rate limit (default 60)
        """
        super().__init__(source_id=source_id, rate_limit_per_minute=rate_limit_per_minute)
        self.app_id = app_id
        self.cert_id = cert_id
        self.dev_id = dev_id  # Not used but kept for compatibility
        self.sandbox = sandbox
        self.max_results = 200  # Browse API limit
        
        # In-memory token cache
        self._token_cache = {
            'access_token': None,
            'expires_at': 0
        }
        
    def _get_app_token(self) -> str:
        """Get OAuth access token using client credentials grant.
        
        Returns:
            Access token string
            
        Raises:
            Exception: If authentication fails
        """
        # Check cached token
        if self._token_cache['access_token'] and time.time() < self._token_cache['expires_at']:
            return self._token_cache['access_token']
        
        if not self.app_id or not self.cert_id:
            raise Exception("eBay App ID and Cert ID are required for OAuth")
        
        # Prepare Basic Auth header
        credentials = f"{self.app_id}:{self.cert_id}"
        encoded_credentials = base64.b64encode(credentials.encode('utf-8')).decode('utf-8')
        
        # Request token
        url = "https://api.ebay.com/identity/v1/oauth2/token"
        headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": f"Basic {encoded_credentials}"
        }
        data = {
            "grant_type": "client_credentials",
            "scope": settings.ebay_oauth_scope
        }
        
        try:
            response = requests.post(url, headers=headers, data=data, timeout=10)
            response.raise_for_status()
            
            token_data = response.json()
            access_token = token_data.get('access_token')
            expires_in = token_data.get('expires_in', 7200)  # Default 2 hours
            
            if not access_token:
                raise Exception("No access_token in OAuth response")
            
            # Cache token with 60s buffer before expiry
            self._token_cache['access_token'] = access_token
            self._token_cache['expires_at'] = time.time() + expires_in - 60
            
            logger.debug("Obtained eBay OAuth token", expires_in=expires_in)
            return access_token
            
        except requests.exceptions.HTTPError as e:
            if e.response.status_code in (401, 403):
                raise Exception(
                    "Browse API auth failed — check EBAY_APP_ID/EBAY_CERT_ID and OAuth scope"
                ) from e
            raise Exception(f"Failed to get OAuth token: {str(e)}") from e
        except Exception as e:
            raise Exception(f"Failed to get OAuth token: {str(e)}") from e
    
    def _search_browse(self, query: str) -> List[Dict]:
        """Search eBay using Buy Browse API.
        
        Args:
            query: Search query string
            
        Returns:
            List of item summary dictionaries
            
        Raises:
            Exception: If API call fails
        """
        token = self._get_app_token()
        
        url = "https://api.ebay.com/buy/browse/v1/item_summary/search"
        headers = {
            "Authorization": f"Bearer {token}",
            "X-EBAY-C-MARKETPLACE-ID": settings.ebay_marketplace_id
        }
        params = {
            "q": query,
            "limit": self.max_results
        }
        
        try:
            response = requests.get(url, headers=headers, params=params, timeout=30)
            
            # Handle auth errors
            if response.status_code in (401, 403):
                raise Exception(
                    "Browse API auth failed — check EBAY_APP_ID/EBAY_CERT_ID and OAuth scope"
                )
            
            response.raise_for_status()
            data = response.json()
            
            # Extract item summaries
            items = data.get('itemSummaries', [])
            if not isinstance(items, list):
                items = []
            
            logger.info("Received eBay listings from Browse API", count=len(items), query=query)
            return items
            
        except requests.exceptions.HTTPError as e:
            if e.response.status_code in (401, 403):
                raise Exception(
                    "Browse API auth failed — check EBAY_APP_ID/EBAY_CERT_ID and OAuth scope"
                ) from e
            raise Exception(f"Browse API request failed: {str(e)}") from e
        except Exception as e:
            raise Exception(f"Browse API request failed: {str(e)}") from e
    
    def _build_query(self, query_params: dict) -> str:
        """Build eBay search query from attribution fields.
        
        Args:
            query_params: Dictionary with year, mintmark, denomination, title, etc.
            
        Returns:
            Query string for eBay API
        """
        parts = []
        
        # Add denomination if present
        denomination_map = {
            'penny': '1 cent',
            'nickel': '5 cent',
            'dime': '10 cent',
            'quarter': '25 cent',
            'half_dollar': 'half dollar',
            'dollar': 'dollar'
        }
        
        if query_params.get('denomination'):
            denom = query_params['denomination']
            if denom in denomination_map:
                parts.append(denomination_map[denom])
        
        # Add year
        if query_params.get('year'):
            parts.append(str(query_params['year']))
        
        # Add mintmark
        if query_params.get('mintmark'):
            parts.append(query_params['mintmark'])
        
        # Add series
        if query_params.get('series'):
            parts.append(query_params['series'])
        
        # Add title/keywords if provided
        if query_params.get('title'):
            # Extract key terms from title
            title = query_params['title']
            # Remove common stop words
            stop_words = {'coin', 'us', 'united', 'states', 'american'}
            words = [w for w in title.lower().split() if w not in stop_words and len(w) > 2]
            parts.extend(words[:3])  # Limit to 3 additional keywords
        
        # Add keywords_include if provided (from attribution)
        keywords_include = query_params.get('keywords_include', [])
        if keywords_include and isinstance(keywords_include, list):
            # Add up to 3 include keywords to query
            include_words = [k for k in keywords_include[:3] if k and isinstance(k, str) and len(k.strip()) > 0]
            parts.extend(include_words)
        
        # Add "US coin" to ensure we get US coins
        if 'US' not in ' '.join(parts).upper():
            parts.insert(0, 'US coin')
        
        return ' '.join(parts)
    
    def _filter_junk_listings(self, items: List[Dict], exclude_keywords: List[str]) -> List[Dict]:
        """Filter out junk listings based on keywords.
        
        Args:
            items: List of eBay item dictionaries
            exclude_keywords: List of keywords to exclude
            
        Returns:
            Filtered list of items
        """
        if not exclude_keywords:
            return items
        
        # Ensure exclude keywords are normalized (trim, lowercase)
        exclude_normalized = [str(k).strip().lower() for k in exclude_keywords if k]
        if not exclude_normalized:
            return items
        
        filtered = []
        
        for item in items:
            # Get text fields to check (primarily title)
            title = item.get('title', '').lower()
            
            # Check if any exclude keyword appears in text fields
            should_exclude = any(keyword in title for keyword in exclude_normalized)
            
            if not should_exclude:
                filtered.append(item)
            else:
                matched_keywords = [k for k in exclude_normalized if k in title]
                logger.debug("Filtered out listing", 
                           title=item.get('title'),
                           matched_keywords=matched_keywords)
        
        return filtered
    
    def _collect_impl(self, query_params: dict, exclude_keywords: List[str]) -> List[Dict]:
        """Collect listings from eBay using Buy Browse API.
        
        Args:
            query_params: Dictionary with query parameters
            exclude_keywords: List of keywords to exclude (from source_rules)
            
        Returns:
            List of price point dictionaries
        """
        if not self.app_id or not self.cert_id:
            logger.error("eBay App ID or Cert ID not configured")
            return []
        
        query = self._build_query(query_params)
        logger.info("Collecting eBay listings", query=query)
        
        try:
            # Search using Browse API
            items = self._search_browse(query)
            
            # Filter junk listings
            if exclude_keywords:
                items = self._filter_junk_listings(items, exclude_keywords)
                logger.info("After filtering", count=len(items))
            
            # Convert to price points
            price_points = []
            now_iso = datetime.now(timezone.utc).isoformat()
            
            for item in items:
                try:
                    # Extract price
                    price_obj = item.get('price', {})
                    price_value = price_obj.get('value')
                    currency = price_obj.get('currency', 'USD')
                    
                    if not price_value:
                        continue
                    
                    # Convert to cents
                    price_cents = int(round(float(price_value) * 100))
                    
                    # Extract other fields
                    title = item.get('title', '')
                    item_id = item.get('itemId', '')
                    item_web_url = item.get('itemWebUrl', '')
                    
                    # Generate dedupe key using external_id
                    dedupe_key = f"ext_{item_id}" if item_id else None
                    
                    # Build price point dict
                    price_point = {
                        "intake_id": query_params.get('intake_id'),
                        "source_id": self.source_id,
                        "job_id": query_params.get('job_id'),
                        "dedupe_key": dedupe_key,
                        "price_cents": price_cents,
                        "price_type": "ask",
                        "raw_payload": item,  # Store full eBay response
                        "listing_url": item_web_url,
                        "listing_title": title,
                        "listing_date": now_iso,
                        "observed_at": now_iso,
                        "match_strength": 1.0,  # Default match strength for Browse API results
                        "external_id": item_id,
                        "filtered_out": False
                    }
                    
                    price_points.append(price_point)
                    
                except Exception as e:
                    logger.warning("Failed to process eBay item", item=item.get('itemId'), error=str(e))
                    continue
            
            logger.info("Collected price points", count=len(price_points))
            return price_points
            
        except Exception as e:
            # Bubble up errors (don't silently succeed with 0 price points)
            logger.error("Error collecting eBay listings", error=str(e), error_type=type(e).__name__)
            raise
