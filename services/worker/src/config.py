"""Configuration management for the worker service."""
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Supabase
    supabase_url: str
    supabase_key: str
    
    # Worker identity
    worker_id: str = "worker-1"
    
    # Job polling
    poll_interval_seconds: int = 5
    job_lock_timeout_seconds: int = 300
    
    # eBay API (optional, can be in source config)
    ebay_app_id: Optional[str] = None
    ebay_cert_id: Optional[str] = None
    ebay_dev_id: Optional[str] = None
    ebay_sandbox: bool = False
    
    # Cache
    cache_enabled: bool = True
    cache_ttl_seconds: int = 3600
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


settings = Settings()




