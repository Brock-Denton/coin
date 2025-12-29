-- ============================================================================
-- CREATE STORAGE BUCKET AND POLICIES
-- ============================================================================
-- Creates the coin-media storage bucket for image uploads with appropriate policies.

-- Create bucket (idempotent)
INSERT INTO storage.buckets (id, name, public)
VALUES ('coin-media', 'coin-media', true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public = EXCLUDED.public;

-- Drop existing policies if they exist (to allow re-running)
DROP POLICY IF EXISTS "Public can read coin-media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload coin-media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can update coin-media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can delete coin-media" ON storage.objects;

-- Allow public read
CREATE POLICY "Public can read coin-media"
ON storage.objects FOR SELECT
USING (bucket_id = 'coin-media');

-- Allow anonymous upload (for development - no auth required)
CREATE POLICY "Anyone can upload coin-media"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'coin-media');

-- Allow anonymous update (for development)
CREATE POLICY "Anyone can update coin-media"
ON storage.objects FOR UPDATE
USING (bucket_id = 'coin-media');

-- Allow anonymous delete (for development)
CREATE POLICY "Anyone can delete coin-media"
ON storage.objects FOR DELETE
USING (bucket_id = 'coin-media');

