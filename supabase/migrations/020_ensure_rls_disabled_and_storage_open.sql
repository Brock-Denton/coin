-- ============================================================================
-- ENSURE RLS IS DISABLED AND STORAGE ALLOWS ANONYMOUS ACCESS
-- ============================================================================
-- This migration ensures RLS is disabled on all tables and storage allows
-- anonymous uploads for development/testing. Run this after 003 and 019.

-- Disable RLS on all tables (idempotent - safe to run multiple times)
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

-- Also disable on manual_search_results if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'manual_search_results') THEN
    EXECUTE 'ALTER TABLE manual_search_results DISABLE ROW LEVEL SECURITY';
  END IF;
END $$;

-- Ensure storage bucket exists and is public
INSERT INTO storage.buckets (id, name, public)
VALUES ('coin-media', 'coin-media', true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public = EXCLUDED.public;

-- Drop existing storage policies if they exist
DROP POLICY IF EXISTS "Public can read coin-media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload coin-media" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload coin-media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can update coin-media" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update coin-media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can delete coin-media" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete coin-media" ON storage.objects;

-- Create permissive storage policies (allow anonymous access for development)
CREATE POLICY "Public can read coin-media"
ON storage.objects FOR SELECT
USING (bucket_id = 'coin-media');

CREATE POLICY "Anyone can upload coin-media"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'coin-media');

CREATE POLICY "Anyone can update coin-media"
ON storage.objects FOR UPDATE
USING (bucket_id = 'coin-media');

CREATE POLICY "Anyone can delete coin-media"
ON storage.objects FOR DELETE
USING (bucket_id = 'coin-media');

