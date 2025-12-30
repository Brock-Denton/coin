-- ============================================================================
-- GRADING SERVICES AND POLICIES TABLES
-- ============================================================================
-- Adds tables for grading services (PCGS, NGC, ANACS) and shipping policies.
-- Extends coin_media table with additional columns for grading workflow.
-- Seeds Internal Grader source for grading jobs.

-- ============================================================================
-- GRADING SERVICES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS grading_services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL,
  website TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  base_fee_cents INTEGER NOT NULL DEFAULT 0,
  per_coin_fee_cents INTEGER NOT NULL DEFAULT 0,
  max_declared_value_cents INTEGER,
  turnaround_days INTEGER,
  requires_membership BOOLEAN NOT NULL DEFAULT false,
  membership_fee_cents INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- GRADING SHIP POLICIES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS grading_ship_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL,
  outbound_shipping_cents INTEGER NOT NULL DEFAULT 0,
  return_shipping_cents INTEGER NOT NULL DEFAULT 0,
  insurance_rate_bps INTEGER NOT NULL DEFAULT 0, -- basis points (100 = 1%)
  handling_cents INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- EXTEND COIN_MEDIA TABLE
-- ============================================================================
-- Add columns for grading workflow (capture type, storage bucket, hash)

-- Update media_type check constraint to include 'edge'
ALTER TABLE coin_media DROP CONSTRAINT IF EXISTS coin_media_media_type_check;
ALTER TABLE coin_media ADD CONSTRAINT coin_media_media_type_check 
  CHECK (media_type IN ('obverse', 'reverse', 'other', 'edge'));

-- Add storage_bucket column (nullable, default 'coin-media')
ALTER TABLE coin_media 
  ADD COLUMN IF NOT EXISTS storage_bucket TEXT DEFAULT 'coin-media';

-- Add capture_type column (default 'phone', check in ('phone', 'scanner'))
ALTER TABLE coin_media 
  ADD COLUMN IF NOT EXISTS capture_type TEXT DEFAULT 'phone';
ALTER TABLE coin_media DROP CONSTRAINT IF EXISTS coin_media_capture_type_check;
ALTER TABLE coin_media ADD CONSTRAINT coin_media_capture_type_check 
  CHECK (capture_type IN ('phone', 'scanner'));

-- Add sha256 column (nullable, for image hash/deduplication)
ALTER TABLE coin_media 
  ADD COLUMN IF NOT EXISTS sha256 TEXT;

-- Add unique constraint on (intake_id, media_type) to prevent duplicates per intake
CREATE UNIQUE INDEX IF NOT EXISTS idx_coin_media_intake_media_type 
  ON coin_media(intake_id, media_type);

-- ============================================================================
-- UPDATE SOURCES TABLE FOR INTERNAL GRADER
-- ============================================================================
-- Update adapter_type check constraint to include 'internal_grader'
ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_adapter_type_check;
ALTER TABLE sources ADD CONSTRAINT sources_adapter_type_check 
  CHECK (adapter_type IN ('ebay_api', 'manual', 'selenium', 'internal_grader'));

-- Seed Internal Grader source
INSERT INTO sources (name, adapter_type, enabled, reputation_weight, tier, config)
VALUES (
  'Internal Grader',
  'internal_grader',
  true,
  1.0,
  1,
  '{}'::jsonb
) ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- SEED DEFAULT GRADING SERVICES
-- ============================================================================
-- PCGS
INSERT INTO grading_services (name, website, enabled, base_fee_cents, per_coin_fee_cents, max_declared_value_cents, turnaround_days, requires_membership, membership_fee_cents, notes)
VALUES (
  'PCGS',
  'https://www.pcgs.com',
  true,
  1000, -- $10.00 base fee
  6500, -- $65.00 per coin (Standard service)
  1000000, -- $10,000 max declared value
  60, -- 60 days turnaround
  false,
  NULL,
  'Professional Coin Grading Service - Standard tier pricing'
) ON CONFLICT (name) DO NOTHING;

-- NGC
INSERT INTO grading_services (name, website, enabled, base_fee_cents, per_coin_fee_cents, max_declared_value_cents, turnaround_days, requires_membership, membership_fee_cents, notes)
VALUES (
  'NGC',
  'https://www.ngccoin.com',
  true,
  1000, -- $10.00 base fee
  6000, -- $60.00 per coin (Standard service)
  1000000, -- $10,000 max declared value
  60, -- 60 days turnaround
  false,
  NULL,
  'Numismatic Guaranty Company - Standard tier pricing'
) ON CONFLICT (name) DO NOTHING;

-- ANACS
INSERT INTO grading_services (name, website, enabled, base_fee_cents, per_coin_fee_cents, max_declared_value_cents, turnaround_days, requires_membership, membership_fee_cents, notes)
VALUES (
  'ANACS',
  'https://www.anacs.com',
  true,
  500, -- $5.00 base fee
  4500, -- $45.00 per coin (Standard service)
  1000000, -- $10,000 max declared value
  30, -- 30 days turnaround
  false,
  NULL,
  'American Numismatic Association Certification Service - Standard tier pricing'
) ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- SEED DEFAULT SHIP POLICY
-- ============================================================================
INSERT INTO grading_ship_policies (name, outbound_shipping_cents, return_shipping_cents, insurance_rate_bps, handling_cents)
VALUES (
  'Standard USPS Insured',
  1500, -- $15.00 outbound shipping
  1500, -- $15.00 return shipping
  100, -- 1% insurance rate (100 basis points)
  500 -- $5.00 handling
) ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================================================
-- Add updated_at trigger for grading_services
CREATE TRIGGER set_updated_at_grading_services
BEFORE UPDATE ON grading_services
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Add updated_at trigger for grading_ship_policies
CREATE TRIGGER set_updated_at_grading_ship_policies
BEFORE UPDATE ON grading_ship_policies
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE grading_services IS 'Grading service providers (PCGS, NGC, ANACS) with pricing and turnaround information.';
COMMENT ON TABLE grading_ship_policies IS 'Shipping policies for sending coins to grading services.';
COMMENT ON COLUMN coin_media.storage_bucket IS 'Storage bucket name (default: coin-media).';
COMMENT ON COLUMN coin_media.capture_type IS 'Image capture method: phone or scanner.';
COMMENT ON COLUMN coin_media.sha256 IS 'SHA-256 hash of image file for deduplication.';

