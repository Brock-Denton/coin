"""Configuration for the grader service."""
import os
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application settings."""
    
    # Supabase configuration
    supabase_url: str
    supabase_key: str
    
    # Grader configuration
    grader_id: str = "grader-1"
    poll_interval_seconds: int = 10
    job_lock_timeout_seconds: int = 300
    
    class Config:
        env_file = ".env"
        case_sensitive = False


# Global settings instance
settings = Settings()

