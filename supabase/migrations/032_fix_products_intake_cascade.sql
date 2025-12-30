-- ============================================================================
-- FIX PRODUCTS INTAKE CASCADE
-- ============================================================================
-- Fix foreign key constraint on products.intake_id to allow intake deletion
-- by setting intake_id to NULL when intake is deleted (preserves products)

-- Drop existing foreign key constraint
-- PostgreSQL auto-generates constraint names like products_intake_id_fkey
ALTER TABLE public.products
DROP CONSTRAINT IF EXISTS products_intake_id_fkey;

-- Recreate with ON DELETE SET NULL to preserve products when intake is deleted
ALTER TABLE public.products
ADD CONSTRAINT products_intake_id_fkey
FOREIGN KEY (intake_id) REFERENCES public.coin_intakes(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.products.intake_id IS 'Reference to coin_intakes. Set to NULL when intake is deleted to preserve the product.';

