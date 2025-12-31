-- ============================================================================
-- CLEAR EBAY CONFIG FOR ENV FALLBACK
-- ============================================================================
-- Clear placeholder eBay credentials from sources.config so the worker
-- will use credentials from .env file instead (which takes precedence)

-- Remove app_id, cert_id, and dev_id from config JSONB for eBay sources
-- Removing these keys causes the code to fall back to .env (config.get() returns None)
UPDATE sources 
SET config = config - 'app_id' - 'cert_id' - 'dev_id'
WHERE adapter_type = 'ebay_api'
  AND (
    -- Only update if config has placeholder values, empty strings, or null
    config->>'app_id' = 'your-ebay-app-id' 
    OR config->>'app_id' IS NULL 
    OR config->>'app_id' = ''
    OR config->>'app_id' LIKE '%placeholder%'
    OR config->>'app_id' LIKE '%example%'
  );

COMMENT ON COLUMN sources.config IS 'JSONB configuration. For eBay sources, if app_id/cert_id/dev_id are empty, the worker will use EBAY_APP_ID/EBAY_CERT_ID/EBAY_DEV_ID from .env file.';
