-- ============================================================================
-- COIN_MEDIA KIND COLUMN AND PHOTO MEDIA_TYPE
-- ============================================================================
-- Adds kind column to distinguish obverse/reverse/edge while allowing media_type='photo'
-- for all image uploads. Maintains backward compatibility with legacy rows.

-- 1. Add kind column
ALTER TABLE public.coin_media
ADD COLUMN IF NOT EXISTS kind text;

-- 2. Backfill kind from legacy media_type for existing rows
UPDATE public.coin_media
SET kind = media_type
WHERE kind IS NULL
  AND media_type IN ('obverse','reverse','edge');

-- 3. Expand media_type constraint to allow 'photo' while keeping legacy values
ALTER TABLE public.coin_media
DROP CONSTRAINT IF EXISTS coin_media_media_type_check;

ALTER TABLE public.coin_media
ADD CONSTRAINT coin_media_media_type_check
CHECK (media_type = ANY (ARRAY['photo','obverse','reverse','edge','other']));

-- 4. Add kind constraint (allow NULL for legacy 'other' rows)
ALTER TABLE public.coin_media
ADD CONSTRAINT coin_media_kind_check
CHECK (kind IS NULL OR kind = ANY (ARRAY['obverse','reverse','edge','other']));

-- 5. Replace uniqueness index to use kind instead of media_type
-- This allows 1 obverse + 1 reverse + 1 edge per intake, regardless of media_type
DROP INDEX IF EXISTS public.idx_coin_media_intake_media_type;

CREATE UNIQUE INDEX IF NOT EXISTS idx_coin_media_intake_kind_unique
ON public.coin_media (intake_id, kind)
WHERE kind IS NOT NULL;

COMMENT ON COLUMN public.coin_media.kind IS 'Image classification: obverse, reverse, edge, or other. NULL allowed for legacy rows.';
COMMENT ON COLUMN public.coin_media.media_type IS 'Media category: photo for images, or legacy values (obverse/reverse/edge/other).';

