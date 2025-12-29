-- Fix RLS Policy Infinite Recursion
-- This migration fixes the infinite recursion issue where policies query the profiles table
-- which triggers the same policy, causing infinite recursion.
--
-- Solution: Use a SECURITY DEFINER function that bypasses RLS when checking user roles.

-- ============================================================================
-- SECURITY DEFINER FUNCTION FOR ROLE CHECKS
-- ============================================================================
-- This function bypasses RLS to check user roles, preventing infinite recursion
-- Note: Functions are created in the public schema, not auth schema
CREATE OR REPLACE FUNCTION public.user_role()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  RETURN (SELECT role FROM profiles WHERE id = auth.uid());
END;
$$;

-- Helper function to check if user is admin or staff
CREATE OR REPLACE FUNCTION public.is_admin_or_staff()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  RETURN public.user_role() IN ('admin', 'staff');
END;
$$;

-- Helper function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  RETURN public.user_role() = 'admin';
END;
$$;

-- ============================================================================
-- DROP AND RECREATE POLICIES USING THE NEW FUNCTIONS
-- ============================================================================

-- PROFILES POLICIES
DROP POLICY IF EXISTS "Staff and admins can view all profiles" ON profiles;
CREATE POLICY "Staff and admins can view all profiles" ON profiles
  FOR SELECT USING (public.is_admin_or_staff());

-- PRODUCTS POLICIES
DROP POLICY IF EXISTS "Staff and admins can view all products" ON products;
CREATE POLICY "Staff and admins can view all products" ON products
  FOR SELECT USING (public.is_admin_or_staff());

DROP POLICY IF EXISTS "Staff and admins can manage products" ON products;
CREATE POLICY "Staff and admins can manage products" ON products
  FOR ALL USING (public.is_admin_or_staff());

-- PRODUCT IMAGES POLICIES
DROP POLICY IF EXISTS "Staff and admins can manage product images" ON product_images;
CREATE POLICY "Staff and admins can manage product images" ON product_images
  FOR ALL USING (public.is_admin_or_staff());

-- COIN INTAKES, MEDIA, ATTRIBUTIONS POLICIES
DROP POLICY IF EXISTS "Staff and admins can manage intakes" ON coin_intakes;
CREATE POLICY "Staff and admins can manage intakes" ON coin_intakes
  FOR ALL USING (public.is_admin_or_staff());

DROP POLICY IF EXISTS "Staff and admins can manage coin media" ON coin_media;
CREATE POLICY "Staff and admins can manage coin media" ON coin_media
  FOR ALL USING (public.is_admin_or_staff());

DROP POLICY IF EXISTS "Staff and admins can manage attributions" ON attributions;
CREATE POLICY "Staff and admins can manage attributions" ON attributions
  FOR ALL USING (public.is_admin_or_staff());

-- SOURCES POLICIES
DROP POLICY IF EXISTS "Staff and admins can view sources" ON sources;
CREATE POLICY "Staff and admins can view sources" ON sources
  FOR SELECT USING (public.is_admin_or_staff());

DROP POLICY IF EXISTS "Admins can manage sources" ON sources;
CREATE POLICY "Admins can manage sources" ON sources
  FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Staff and admins can view source rules" ON source_rules;
CREATE POLICY "Staff and admins can view source rules" ON source_rules
  FOR SELECT USING (public.is_admin_or_staff());

DROP POLICY IF EXISTS "Admins can manage source rules" ON source_rules;
CREATE POLICY "Admins can manage source rules" ON source_rules
  FOR ALL USING (public.is_admin());

-- SCRAPE JOBS POLICIES
DROP POLICY IF EXISTS "Staff and admins can manage scrape jobs" ON scrape_jobs;
CREATE POLICY "Staff and admins can manage scrape jobs" ON scrape_jobs
  FOR ALL USING (public.is_admin_or_staff());

DROP POLICY IF EXISTS "Staff and admins can view scrape job logs" ON scrape_job_logs;
CREATE POLICY "Staff and admins can view scrape job logs" ON scrape_job_logs
  FOR SELECT USING (public.is_admin_or_staff());

-- PRICE POINTS POLICIES
DROP POLICY IF EXISTS "Staff and admins can manage price points" ON price_points;
CREATE POLICY "Staff and admins can manage price points" ON price_points
  FOR ALL USING (public.is_admin_or_staff());

-- VALUATIONS POLICIES
DROP POLICY IF EXISTS "Staff and admins can manage valuations" ON valuations;
CREATE POLICY "Staff and admins can manage valuations" ON valuations
  FOR ALL USING (public.is_admin_or_staff());

-- ORDERS POLICIES
DROP POLICY IF EXISTS "Staff and admins can manage orders" ON orders;
CREATE POLICY "Staff and admins can manage orders" ON orders
  FOR ALL USING (public.is_admin_or_staff());

DROP POLICY IF EXISTS "Staff and admins can manage order items" ON order_items;
CREATE POLICY "Staff and admins can manage order items" ON order_items
  FOR ALL USING (public.is_admin_or_staff());

-- AUDIT LOGS POLICIES
DROP POLICY IF EXISTS "Staff and admins can view audit logs" ON audit_logs;
CREATE POLICY "Staff and admins can view audit logs" ON audit_logs
  FOR SELECT USING (public.is_admin_or_staff());

