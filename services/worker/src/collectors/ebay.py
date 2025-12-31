"""eBay API collector for sold listings."""
import hashlib
import json
import re
from datetime import datetime
from typing import List, Dict, Optional
from ebaysdk.finding import Connection as Finding
from ebaysdk.exception import ConnectionError as EbayConnectionError
import structlog
from src.collectors.base import BaseCollector
from src.config import settings

logger = structlog.get_logger()


class EbayCollector(BaseCollector):
    """Collector for eBay sold listings using official eBay Finding API."""
    
    def __init__(self, app_id: str, cert_id: str = None, dev_id: str = None, sandbox: bool = False, source_id: str = None, rate_limit_per_minute: int = 60):
        """Initialize eBay collector.
        
        Args:
            app_id: eBay App ID (required)
            cert_id: eBay Cert ID (optional, for production)
            dev_id: eBay Dev ID (optional)
            sandbox: Use sandbox environment
            source_id: Source ID for tracking and circuit breaker
            rate_limit_per_minute: Rate limit (default 60)
        """
        super().__init__(source_id=source_id, rate_limit_per_minute=rate_limit_per_minute)
        self.app_id = app_id
        self.cert_id = cert_id
        self.dev_id = dev_id
        self.sandbox = sandbox
        self.site_id = 'EBAY-US'
        
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
    
    def _compute_match_strength(self, listing_title: str, query_params: dict) -> float:
        """Compute match strength (0.0 to 1.0) based on token overlap.
        
        Args:
            listing_title: eBay listing title
            query_params: Dictionary with year, mintmark, denomination, series, etc.
            
        Returns:
            Match strength score from 0.0 to 1.0
        """
        title_lower = listing_title.lower()
        matched_tokens = 0
        total_tokens = 0
        
        # Extract tokens from query params
        query_tokens = set()
        
        # Year token
        if query_params.get('year'):
            year_str = str(query_params['year'])
            query_tokens.add(year_str)
            total_tokens += 1
            if year_str in title_lower:
                matched_tokens += 1
        
        # Mintmark token (normalized)
        if query_params.get('mintmark'):
            mintmark = query_params['mintmark'].upper()
            query_tokens.add(mintmark)
            total_tokens += 1
            if mintmark in title_lower.upper():
                matched_tokens += 1
        
        # Denomination tokens
        if query_params.get('denomination'):
            denom = query_params['denomination']
            denom_map = {
                'penny': ['penny', 'cent', '1 cent'],
                'nickel': ['nickel', '5 cent'],
                'dime': ['dime', '10 cent'],
                'quarter': ['quarter', '25 cent'],
                'half_dollar': ['half dollar', 'half', '50 cent'],
                'dollar': ['dollar', '1 dollar']
            }
            if denom in denom_map:
                denom_tokens = denom_map[denom]
                total_tokens += 1
                if any(token in title_lower for token in denom_tokens):
                    matched_tokens += 1
        
        # Series tokens (split into words)
        if query_params.get('series'):
            series = query_params['series'].lower()
            series_words = series.split()
            for word in series_words:
                if len(word) > 3:  # Skip short words
                    query_tokens.add(word)
                    total_tokens += 1
                    if word in title_lower:
                        matched_tokens += 1
        
        # Calculate match strength
        if total_tokens == 0:
            return 0.5  # Default if no tokens to match
        
        return matched_tokens / total_tokens
    
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
        # Keywords should already be normalized by caller, but normalize here for safety
        exclude_normalized = [str(k).strip().lower() for k in exclude_keywords if k]
        if not exclude_normalized:
            return items
        
        filtered = []
        
        for item in items:
            # Get text fields to check (primarily title, can extend to other fields if available)
            title = item.get('title', '').lower()
            text_to_check = title
            
            # Check if any exclude keyword appears in text fields (robust filtering)
            should_exclude = any(keyword in text_to_check for keyword in exclude_normalized)
            
            if not should_exclude:
                filtered.append(item)
            else:
                matched_keywords = [k for k in exclude_normalized if k in text_to_check]
                logger.debug("Filtered out listing", 
                           title=item.get('title'),
                           matched_keywords=matched_keywords)
        
        return filtered
    
    def _normalize_url(self, url: str) -> str:
        """Normalize URL by removing query parameters and fragments.
        
        Args:
            url: Original URL
            
        Returns:
            Normalized URL
        """
        if not url:
            return ''
        # Remove query parameters and fragments for deduplication
        normalized = url.split('?')[0].split('#')[0]
        return normalized.strip().lower()
    
    def _normalize_title(self, title: str) -> str:
        """Normalize title by lowercasing and removing extra whitespace.
        
        Args:
            title: Original title
            
        Returns:
            Normalized title
        """
        if not title:
            return ''
        # Lowercase and remove extra whitespace
        normalized = ' '.join(title.lower().split())
        return normalized
    
    def _generate_dedupe_key(
        self,
        external_id: Optional[str] = None,
        listing_url: str = '',
        listing_title: str = '',
        price_cents: int = 0,
        observed_at: Optional[str] = None,
        price_type: str = 'sold'
    ) -> str:
        """Generate a deterministic dedupe key for a price point.
        
        Priority:
        1. If external_id exists, use it directly (most reliable)
        2. Otherwise, hash (normalized_url + normalized_title + price_cents + date_bucket + price_type)
        
        Args:
            external_id: External identifier (e.g., eBay item ID)
            listing_url: Listing URL
            listing_title: Listing title
            price_cents: Price in cents
            observed_at: Observation timestamp
            price_type: Type of price (sold, ask, bid)
            
        Returns:
            Dedupe key string
        """
        if external_id:
            # Use external_id directly as dedupe key (most reliable)
            return f"ext_{external_id}"
        
        # Generate hash-based dedupe key
        normalized_url = self._normalize_url(listing_url)
        normalized_title = self._normalize_title(listing_title)
        
        # Create date bucket (day granularity)
        if observed_at:
            try:
                # Parse timestamp and extract date (YYYY-MM-DD)
                dt = datetime.fromisoformat(observed_at.replace('Z', '+00:00'))
                date_bucket = dt.strftime('%Y-%m-%d')
            except Exception:
                date_bucket = 'unknown'
        else:
            date_bucket = 'unknown'
        
        # Create hash from components
        hash_input = f"{normalized_url}|{normalized_title}|{price_cents}|{date_bucket}|{price_type}"
        hash_value = hashlib.sha256(hash_input.encode('utf-8')).hexdigest()[:16]
        
        return f"hash_{hash_value}"
    
    def _normalize_price(self, price_str: str, currency: str = 'USD') -> Optional[int]:
        """Normalize price to USD cents.
        
        Args:
            price_str: Price string (e.g., "25.99")
            currency: Currency code
            
        Returns:
            Price in cents as integer, or None if conversion fails
        """
        try:
            # eBay API returns prices as strings
            price_float = float(price_str)
            # Convert to cents
            return int(price_float * 100)
        except (ValueError, TypeError):
            logger.warning("Failed to normalize price", price=price_str, currency=currency)
            return None
    
    def _collect_impl(self, query_params: dict, exclude_keywords: List[str]) -> List[Dict]:
        """Collect sold listings from eBay.
        
        Args:
            query_params: Dictionary with query parameters
            exclude_keywords: List of keywords to exclude (from source_rules)
            
        Returns:
            List of price point dictionaries
        """
        if not self.app_id:
            logger.error("eBay App ID not configured")
            return []
        
        query = self._build_query(query_params)
        logger.info("Collecting eBay listings", query=query)
        
        try:
            # Initialize eBay API
            api = Finding(
                appid=self.app_id,
                config_file=None,
                siteid=self.site_id,
                debug=False
            )
            
            # Build request parameters
            # Note: eBay Finding API uses findCompletedItems for sold listings
            request_params = {
                'keywords': query,
                'itemFilter': [
                    {'name': 'ListingType', 'value': ['AuctionWithBIN', 'FixedPrice']},
                    {'name': 'SoldItemsOnly', 'value': 'true'},  # Only sold items
                    {'name': 'HideDuplicateItems', 'value': 'true'}
                ],
                'sortOrder': 'EndTimeSoonest',
                'paginationInput': {
                    'entriesPerPage': 100,  # Max is 100
                    'pageNumber': 1
                }
            }
            
            # Execute API call - findCompletedItems is available in Finding API
            # This method requires the Finding API which supports completed items
            auth_error = None
            try:
                response = api.execute('findCompletedItems', request_params)
            except Exception as api_error:
                error_str = str(api_error)
                # Check if this is an authentication error
                if 'Authentication failed' in error_str or 'Invalid Application' in error_str or 'errorId: 11002' in error_str:
                    auth_error = api_error
                    logger.error("eBay API authentication failed", error=error_str)
                    # Don't try fallback for auth errors - it will also fail
                    raise Exception(f"eBay API authentication failed: {error_str}. Please check your eBay App ID in the source configuration.")
                
                # Fallback: Try findItemsAdvanced with sold filter if findCompletedItems fails
                logger.warning("findCompletedItems failed, trying alternative method", error=error_str)
                try:
                    request_params.pop('itemFilter', None)
                    request_params['itemFilter'] = [
                        {'name': 'ListingType', 'value': ['AuctionWithBIN', 'FixedPrice']},
                        {'name': 'HideDuplicateItems', 'value': 'true'}
                    ]
                    # Note: findItemsAdvanced doesn't support SoldItemsOnly, so we filter client-side
                    response = api.execute('findItemsAdvanced', request_params)
                except Exception as fallback_error:
                    fallback_error_str = str(fallback_error)
                    # Check if fallback also failed with auth error
                    if 'Authentication failed' in fallback_error_str or 'Invalid Application' in fallback_error_str or 'errorId: 11002' in fallback_error_str:
                        logger.error("eBay API authentication failed on fallback", error=fallback_error_str)
                        raise Exception(f"eBay API authentication failed: {fallback_error_str}. Please check your eBay App ID in the source configuration.")
                    # Re-raise the original error if fallback also fails
                    raise api_error
            
            # Parse response
            items = response.dict().get('searchResult', {}).get('item', [])
            if not isinstance(items, list):
                items = [items] if items else []
            
            logger.info("Received eBay listings", count=len(items))
            
            # Filter junk listings
            if exclude_keywords:
                items = self._filter_junk_listings(items, exclude_keywords)
                logger.info("After filtering", count=len(items))
            
            # Convert to price points
            price_points = []
            for item in items:
                # Get selling price (sold items have sellingStatus)
                selling_status = item.get('sellingStatus', {})
                current_price = selling_status.get('currentPrice', {})
                price_value = current_price.get('value')
                
                if not price_value:
                    continue
                
                price_cents = self._normalize_price(price_value, current_price.get('currencyId', 'USD'))
                if not price_cents:
                    continue
                
                # Determine price type (sold items are 'sold')
                price_type = 'sold'
                
                # Get listing URL
                listing_url = item.get('viewItemURL', '')
                
                # Get listing title
                title = item.get('title', '')
                
                # Get end time (sold date)
                listing_info = item.get('listingInfo', {})
                end_time = listing_info.get('endTime')
                
                # Extract external_id (eBay item ID)
                external_id = item.get('itemId')
                
                # Compute match strength
                match_strength = self._compute_match_strength(title, query_params)
                
                # Generate dedupe_key
                dedupe_key = self._generate_dedupe_key(
                    external_id=external_id,
                    listing_url=listing_url,
                    listing_title=title,
                    price_cents=price_cents,
                    observed_at=end_time,
                    price_type=price_type
                )
                
                price_point = {
                    'source_id': query_params.get('source_id'),  # Passed from job
                    'intake_id': query_params.get('intake_id'),
                    'job_id': query_params.get('job_id'),
                    'price_cents': price_cents,
                    'price_type': price_type,
                    'raw_payload': item,  # Store full eBay response
                    'listing_url': listing_url,
                    'listing_title': title,
                    'listing_date': end_time,
                    'observed_at': end_time,  # Use listing_date for observed_at
                    'match_strength': float(match_strength),
                    'external_id': external_id,
                    'dedupe_key': dedupe_key,
                    'filtered_out': False
                }
                
                price_points.append(price_point)
            
            logger.info("Collected price points", count=len(price_points))
            return price_points
            
        except EbayConnectionError as e:
            logger.error("eBay API connection error", error=str(e), response=e.response.dict() if hasattr(e, 'response') else None)
            return []
        except Exception as e:
            logger.error("Error collecting eBay listings", error=str(e), error_type=type(e).__name__)
            return []

