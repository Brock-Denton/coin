"""eBay API collector using Buy Browse API."""
import os
import base64
import time
import urllib.parse
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
    """
    Collector for eBay listings using Buy Browse API with OAuth.
    
    IMPORTANT:
      - Prefer EBAY_CLIENT_ID / EBAY_CLIENT_SECRET (OAuth)
      - Fallback to EBAY_APP_ID / EBAY_CERT_ID for backward compat
    """
    
    def __init__(self, app_id: str = None, cert_id: str = None, dev_id: str = None, sandbox: bool = False, source_id: str = None, rate_limit_per_minute: int = 60):
        """Initialize eBay collector.
        
        Args:
            app_id: eBay App ID (optional, falls back to env vars)
            cert_id: eBay Cert ID (optional, falls back to env vars)
            dev_id: eBay Dev ID (optional, not used in Browse API)
            sandbox: Use sandbox environment
            source_id: Source ID for tracking and circuit breaker
            rate_limit_per_minute: Rate limit (default 60)
        """
        super().__init__(source_id=source_id, rate_limit_per_minute=rate_limit_per_minute)
        
        # Prefer OAuth-style env names, fallback to legacy names
        self.client_id = app_id or os.getenv("EBAY_CLIENT_ID") or os.getenv("EBAY_APP_ID")
        self.client_secret = cert_id or os.getenv("EBAY_CLIENT_SECRET") or os.getenv("EBAY_CERT_ID")
        
        if not self.client_id or not self.client_secret:
            raise ValueError(
                "Missing eBay OAuth credentials. Set EBAY_CLIENT_ID and EBAY_CLIENT_SECRET "
                "(or fallback EBAY_APP_ID and EBAY_CERT_ID)."
            )
        
        self.dev_id = dev_id  # Not used but kept for compatibility
        self.sandbox = sandbox
        self.max_results = 200  # Browse API limit
        
        # Set base URLs based on sandbox
        if sandbox:
            self.base_url = "https://api.sandbox.ebay.com"
            self.token_url = "https://api.sandbox.ebay.com/identity/v1/oauth2/token"
        else:
            self.base_url = "https://api.ebay.com"
            self.token_url = "https://api.ebay.com/identity/v1/oauth2/token"
        
        # In-memory token cache
        self._token: Optional[str] = None
        self._token_expiry: float = 0.0
        
    def _get_app_token(self) -> str:
        """Get app OAuth token (client_credentials). Raises with details on failure."""
        now = time.time()
        if self._token and now < self._token_expiry - 30:
            return self._token
        
        basic = base64.b64encode(f"{self.client_id}:{self.client_secret}".encode("utf-8")).decode("utf-8")
        headers = {
            "Authorization": f"Basic {basic}",
            "Content-Type": "application/x-www-form-urlencoded",
        }
        data = {
            "grant_type": "client_credentials",
            # Per eBay Browse docs, api_scope is sufficient for many Browse endpoints.
            "scope": settings.ebay_oauth_scope,
        }
        
        try:
            r = requests.post(self.token_url, headers=headers, data=data, timeout=20)
            
            if r.status_code != 200:
                # This is the *real* reason your auth is failing (invalid_client, invalid_scope, etc.)
                logger.error(
                    "eBay OAuth token request failed",
                    status=r.status_code,
                    body=r.text[:1500],
                    token_url=self.token_url,
                    sandbox=self.sandbox,
                )
                raise Exception(f"eBay OAuth token request failed ({r.status_code}): {r.text[:300]}")
            
            payload = r.json()
            token = payload.get("access_token")
            expires_in = int(payload.get("expires_in", 3600))
            
            if not token:
                logger.error("eBay OAuth token response missing access_token", payload=payload)
                raise Exception("eBay OAuth token response missing access_token")
            
            self._token = token
            self._token_expiry = time.time() + expires_in
            return token
            
        except Exception as e:
            if isinstance(e, Exception) and "OAuth token" in str(e):
                raise
            raise Exception(f"Failed to get OAuth token: {str(e)}") from e
    
    def _search_browse(self, query: str) -> List[Dict]:
        """Browse API search (active listings)."""
        token = self._get_app_token()
        
        url = f"{self.base_url}/buy/browse/v1/item_summary/search"
        params = {"q": query, "limit": str(self.max_results)}
        full_url = url + "?" + urllib.parse.urlencode(params)
        
        headers = {
            "Authorization": f"Bearer {token}",
            "X-EBAY-C-MARKETPLACE-ID": settings.ebay_marketplace_id,
        }
        
        resp = requests.get(full_url, headers=headers, timeout=20)
        
        # If token expired/invalid, clear cache and retry once
        if resp.status_code == 401:
            logger.warning("eBay Browse returned 401; refreshing token and retrying once")
            self._token = None
            self._token_expiry = 0.0
            token = self._get_app_token()
            headers["Authorization"] = f"Bearer {token}"
            resp = requests.get(full_url, headers=headers, timeout=20)
        
        if resp.status_code == 429 or "RateLimiter" in resp.text:
            raise EbayRateLimitError(f"rate limit: {resp.status_code} {resp.text[:300]}")
        
        if resp.status_code >= 400:
            logger.error("eBay Browse search failed", status=resp.status_code, body=resp.text[:1500])
            return []
        
        data = resp.json()
        return data.get("itemSummaries", []) or []
    
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
        if not self.client_id or not self.client_secret:
            logger.error("eBay OAuth credentials not configured")
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
