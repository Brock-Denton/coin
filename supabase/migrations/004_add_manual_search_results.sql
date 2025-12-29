-- ============================================================================
-- MANUAL SEARCH RESULTS
-- Stores manually entered search results from the search queries workflow
-- ============================================================================
CREATE TABLE manual_search_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  intake_id UUID NOT NULL REFERENCES coin_intakes(id) ON DELETE CASCADE,
  source_name TEXT NOT NULL, -- e.g., 'PCGS CoinFacts', 'Heritage Auctions'
  search_query TEXT NOT NULL, -- The search query that was used
  found BOOLEAN NOT NULL DEFAULT false, -- Whether results were found
  result_url TEXT, -- URL to the found listing/page (if found)
  price_cents INTEGER, -- Price in cents (if found and price available)
  notes TEXT, -- Optional notes about the search result
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) -- Who created this manual search result
);

-- Indexes for manual_search_results
CREATE INDEX idx_manual_search_results_intake_id ON manual_search_results(intake_id);
CREATE INDEX idx_manual_search_results_found ON manual_search_results(found);
CREATE INDEX idx_manual_search_results_created_at ON manual_search_results(created_at);

-- Enable RLS (will be disabled temporarily like other tables)
ALTER TABLE manual_search_results ENABLE ROW LEVEL SECURITY;

-- RLS Policies for manual_search_results (staff/admin only for now)
-- Note: These will work once auth is enabled, but RLS is disabled in migration 003
CREATE POLICY "Staff and admins can view manual search results" ON manual_search_results
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

CREATE POLICY "Staff and admins can insert manual search results" ON manual_search_results
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

CREATE POLICY "Staff and admins can update manual search results" ON manual_search_results
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

CREATE POLICY "Staff and admins can delete manual search results" ON manual_search_results
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

-- Trigger to update updated_at
CREATE TRIGGER update_manual_search_results_updated_at BEFORE UPDATE ON manual_search_results
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- Also disable RLS temporarily for development (like other tables)
-- ============================================================================
ALTER TABLE manual_search_results DISABLE ROW LEVEL SECURITY;

