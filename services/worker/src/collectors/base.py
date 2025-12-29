"""Enhanced base collector with caching, rate limiting, and circuit breaker."""
import time
import sqlite3
import json
from abc import ABC, abstractmethod
from typing import List, Dict, Optional
from datetime import datetime, timedelta
from pathlib import Path
import structlog
from src.config import settings
from src.db import check_source_available, update_source_stats, get_source

logger = structlog.get_logger()


class RateLimiter:
    """Token bucket rate limiter."""
    
    def __init__(self, rate_per_minute: int):
        """Initialize rate limiter.
        
        Args:
            rate_per_minute: Maximum number of requests per minute
        """
        self.rate_per_minute = rate_per_minute
        self.tokens = rate_per_minute
        self.last_refill = time.time()
        self.min_interval = 60.0 / rate_per_minute  # Minimum seconds between requests
    
    def acquire(self) -> bool:
        """Acquire a token. Returns True if successful, False if rate limited.
        
        Returns:
            True if token acquired, False if rate limited
        """
        now = time.time()
        elapsed = now - self.last_refill
        
        # Refill tokens based on elapsed time
        if elapsed >= 60.0:
            self.tokens = self.rate_per_minute
            self.last_refill = now
        else:
            # Add tokens proportional to elapsed time
            tokens_to_add = (elapsed / 60.0) * self.rate_per_minute
            self.tokens = min(self.rate_per_minute, self.tokens + tokens_to_add)
            self.last_refill = now
        
        if self.tokens >= 1.0:
            self.tokens -= 1.0
            return True
        
        return False
    
    def wait_if_needed(self):
        """Wait if necessary to respect rate limit."""
        if not self.acquire():
            # Calculate wait time
            wait_time = self.min_interval - (time.time() - self.last_refill)
            if wait_time > 0:
                time.sleep(wait_time)
                self.acquire()  # Try again after waiting


class Cache:
    """Simple SQLite-based cache."""
    
    def __init__(self, cache_path: str = "/app/cache/cache.db"):
        """Initialize cache.
        
        Args:
            cache_path: Path to SQLite cache database
        """
        self.cache_path = Path(cache_path)
        self.cache_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()
    
    def _init_db(self):
        """Initialize cache database."""
        conn = sqlite3.connect(str(self.cache_path))
        conn.execute("""
            CREATE TABLE IF NOT EXISTS cache (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                expires_at REAL NOT NULL
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_cache_expires_at ON cache(expires_at)")
        conn.commit()
        conn.close()
    
    def get(self, key: str) -> Optional[Dict]:
        """Get cached value.
        
        Args:
            key: Cache key
            
        Returns:
            Cached value or None if not found/expired
        """
        if not settings.cache_enabled:
            return None
        
        try:
            conn = sqlite3.connect(str(self.cache_path))
            cursor = conn.execute(
                "SELECT value FROM cache WHERE key = ? AND expires_at > ?",
                (key, time.time())
            )
            row = cursor.fetchone()
            conn.close()
            
            if row:
                return json.loads(row[0])
            return None
        except Exception as e:
            logger.error("Cache get error", key=key, error=str(e))
            return None
    
    def set(self, key: str, value: Dict, ttl_seconds: int = None):
        """Set cached value.
        
        Args:
            key: Cache key
            value: Value to cache
            ttl_seconds: Time to live in seconds (defaults to settings.cache_ttl_seconds)
        """
        if not settings.cache_enabled:
            return
        
        ttl = ttl_seconds or settings.cache_ttl_seconds
        expires_at = time.time() + ttl
        
        try:
            conn = sqlite3.connect(str(self.cache_path))
            conn.execute(
                "INSERT OR REPLACE INTO cache (key, value, expires_at) VALUES (?, ?, ?)",
                (key, json.dumps(value), expires_at)
            )
            conn.commit()
            conn.close()
        except Exception as e:
            logger.error("Cache set error", key=key, error=str(e))
    
    def clear_expired(self):
        """Clear expired cache entries."""
        try:
            conn = sqlite3.connect(str(self.cache_path))
            conn.execute("DELETE FROM cache WHERE expires_at <= ?", (time.time(),))
            conn.commit()
            conn.close()
        except Exception as e:
            logger.error("Cache clear expired error", error=str(e))


class BaseCollector(ABC):
    """Enhanced base collector with caching, rate limiting, and circuit breaker."""
    
    def __init__(self, source_id: Optional[str] = None, rate_limit_per_minute: int = 60):
        """Initialize base collector.
        
        Args:
            source_id: Source ID for tracking
            rate_limit_per_minute: Rate limit for this collector
        """
        self.source_id = source_id
        self.rate_limiter = RateLimiter(rate_limit_per_minute)
        self.cache = Cache()
        self.circuit_breaker_failure_threshold = 5  # Open circuit after 5 failures
        self.circuit_breaker_cooldown_seconds = 300  # 5 minutes cooldown
    
    def _get_cache_key(self, query_params: dict) -> str:
        """Generate cache key from query parameters.
        
        Args:
            query_params: Query parameters
            
        Returns:
            Cache key string
        """
        # Create a deterministic key from query params
        key_parts = [
            self.source_id or 'unknown',
            str(query_params.get('year', '')),
            str(query_params.get('mintmark', '')),
            str(query_params.get('denomination', '')),
            str(query_params.get('series', '')),
            str(query_params.get('title', ''))
        ]
        return '|'.join(key_parts)
    
    def _check_circuit_breaker(self) -> bool:
        """Check if circuit breaker allows requests.
        
        Returns:
            True if circuit is closed (allows requests), False if open (blocks requests)
        """
        if not self.source_id:
            return True  # No circuit breaker if no source_id
        
        # Check if source is available (includes circuit breaker check)
        return check_source_available(self.source_id)
    
    def _update_circuit_breaker(self, success: bool):
        """Update circuit breaker state.
        
        Args:
            success: True if operation succeeded, False if failed
        """
        if not self.source_id:
            return
        
        # Update source stats (which tracks failure streaks)
        update_source_stats(self.source_id, success)
        
        # Check if we need to pause source (circuit breaker opens)
        if not success:
            source = get_source(self.source_id)
            if source and source.get('failure_streak', 0) >= self.circuit_breaker_failure_threshold:
                # Pause source for cooldown period
                from datetime import datetime, timezone, timedelta
                from src.db import supabase
                paused_until = datetime.now(timezone.utc) + timedelta(seconds=self.circuit_breaker_cooldown_seconds)
                
                supabase.table("sources") \
                    .update({
                        'paused_until': paused_until.isoformat(),
                        'updated_at': 'now()'
                    }) \
                    .eq("id", self.source_id) \
                    .execute()
                
                logger.warning("Circuit breaker opened", 
                             source_id=self.source_id,
                             failure_streak=source.get('failure_streak', 0),
                             paused_until=paused_until.isoformat())
    
    def collect(self, query_params: dict, exclude_keywords: List[str] = None) -> List[Dict]:
        """Collect price points with caching, rate limiting, and circuit breaker.
        
        Args:
            query_params: Query parameters
            exclude_keywords: Keywords to exclude (passed to _collect_impl)
            
        Returns:
            List of price point dictionaries
        """
        # Check circuit breaker
        if not self._check_circuit_breaker():
            logger.warning("Circuit breaker open, skipping collection", source_id=self.source_id)
            return []
        
        # Check cache
        if settings.cache_enabled:
            cache_key = self._get_cache_key(query_params)
            cached_result = self.cache.get(cache_key)
            if cached_result is not None:
                logger.debug("Cache hit", source_id=self.source_id, cache_key=cache_key)
                return cached_result
        
        # Rate limiting
        self.rate_limiter.wait_if_needed()
        
        # Perform actual collection
        try:
            result = self._collect_impl(query_params, exclude_keywords or [])
            
            # Cache result
            if settings.cache_enabled:
                self.cache.set(cache_key, result)
            
            # Update circuit breaker (success)
            self._update_circuit_breaker(True)
            
            return result
        except Exception as e:
            # Update circuit breaker (failure)
            self._update_circuit_breaker(False)
            raise
    
    @abstractmethod
    def _collect_impl(self, query_params: dict, exclude_keywords: List[str]) -> List[Dict]:
        """Internal implementation of collection (to be implemented by subclasses).
        
        Args:
            query_params: Query parameters
            exclude_keywords: Keywords to exclude
            
        Returns:
            List of price point dictionaries
        """
        pass

