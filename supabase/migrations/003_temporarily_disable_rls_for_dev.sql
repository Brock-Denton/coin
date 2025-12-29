-- Temporarily disable RLS on all tables for development
-- This allows inserts/updates when auth is disabled
-- TODO: Re-enable RLS and proper policies when authentication is set up

-- Disable RLS on all tables that are used in the admin interface
ALTER TABLE coin_intakes DISABLE ROW LEVEL SECURITY;
ALTER TABLE coin_media DISABLE ROW LEVEL SECURITY;
ALTER TABLE attributions DISABLE ROW LEVEL SECURITY;
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE product_images DISABLE ROW LEVEL SECURITY;
ALTER TABLE sources DISABLE ROW LEVEL SECURITY;
ALTER TABLE source_rules DISABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_jobs DISABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_job_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE price_points DISABLE ROW LEVEL SECURITY;
ALTER TABLE valuations DISABLE ROW LEVEL SECURITY;
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE order_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY;

-- Note: manual_search_results RLS is disabled in migration 004
-- Note: profiles table should keep RLS enabled for security
-- When you're ready to enable auth, you can re-enable RLS with:
-- ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;
-- Then the policies in 002_fix_rls_recursion.sql will work properly

