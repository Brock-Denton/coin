-- Temporarily disable RLS on coin_intakes for development
-- This allows inserts when auth is disabled
-- TODO: Re-enable RLS and proper policies when authentication is set up

-- Disable RLS on coin_intakes temporarily
ALTER TABLE coin_intakes DISABLE ROW LEVEL SECURITY;

-- Note: When you're ready to enable auth, you can re-enable RLS with:
-- ALTER TABLE coin_intakes ENABLE ROW LEVEL SECURITY;
-- Then the policies in 002_fix_rls_recursion.sql will work properly

