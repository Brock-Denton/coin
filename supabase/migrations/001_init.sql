-- Coin Inventory + Pricing System - Initial Migration
-- Supabase migration for coins.gov.technology

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- PROFILES (extends auth.users)
-- ============================================================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'staff', 'viewer')),
  email TEXT,
  full_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- COIN INTAKES (workflow: intake -> attribution -> pricing -> product)
-- ============================================================================
CREATE TABLE coin_intakes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  intake_number TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'attributed', 'priced', 'productized', 'archived')),
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- COIN MEDIA (photos stored in Supabase Storage)
-- ============================================================================
CREATE TABLE coin_media (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  intake_id UUID NOT NULL REFERENCES coin_intakes(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL CHECK (media_type IN ('obverse', 'reverse', 'other')),
  storage_path TEXT NOT NULL,
  file_name TEXT,
  file_size BIGINT,
  mime_type TEXT,
  width INTEGER,
  height INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- ATTRIBUTIONS (US coin identification fields)
-- ============================================================================
CREATE TABLE attributions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  intake_id UUID UNIQUE NOT NULL REFERENCES coin_intakes(id) ON DELETE CASCADE,
  denomination TEXT, -- e.g., 'penny', 'nickel', 'dime', 'quarter', 'half_dollar', 'dollar'
  year INTEGER,
  mintmark TEXT, -- e.g., 'P', 'D', 'S', 'W', 'CC', 'O', 'C'
  series TEXT, -- e.g., 'Morgan Dollar', 'Peace Dollar', 'Washington Quarter'
  variety TEXT,
  grade TEXT, -- e.g., 'VF', 'XF', 'AU', 'MS60', 'MS65'
  title TEXT, -- searchable title/keywords for comp queries
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- SOURCES (pricing data sources)
-- ============================================================================
CREATE TABLE sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL,
  adapter_type TEXT NOT NULL CHECK (adapter_type IN ('ebay_api', 'manual', 'selenium')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  reputation_weight DECIMAL(3,2) NOT NULL DEFAULT 1.0 CHECK (reputation_weight >= 0 AND reputation_weight <= 1.0),
  tier INTEGER NOT NULL DEFAULT 1 CHECK (tier >= 1 AND tier <= 10),
  api_key TEXT, -- encrypted/encrypted at rest
  api_secret TEXT,
  base_url TEXT,
  rate_limit_per_minute INTEGER DEFAULT 60,
  config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- SOURCE RULES (filtering, allowed paths, rate limits per source)
-- ============================================================================
CREATE TABLE source_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('exclude_keywords', 'require_keywords', 'allowed_path', 'rate_limit_override')),
  rule_value TEXT NOT NULL,
  priority INTEGER DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- SCRAPE JOBS (job queue for pricing collection)
-- ============================================================================
CREATE TABLE scrape_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  intake_id UUID NOT NULL REFERENCES coin_intakes(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES sources(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  query_params JSONB NOT NULL, -- stores query construction details
  locked_at TIMESTAMPTZ,
  locked_by TEXT, -- worker instance ID
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- SCRAPE JOB LOGS (detailed execution logs)
-- ============================================================================
CREATE TABLE scrape_job_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES scrape_jobs(id) ON DELETE CASCADE,
  log_level TEXT NOT NULL CHECK (log_level IN ('debug', 'info', 'warning', 'error')),
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PRICE POINTS (individual comps/observations)
-- ============================================================================
CREATE TABLE price_points (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  intake_id UUID NOT NULL REFERENCES coin_intakes(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES sources(id),
  job_id UUID REFERENCES scrape_jobs(id),
  price_cents INTEGER NOT NULL, -- normalized to USD cents
  price_type TEXT NOT NULL CHECK (price_type IN ('sold', 'ask', 'bid')),
  raw_payload JSONB, -- original API response or scraped data
  listing_url TEXT,
  listing_title TEXT,
  listing_date TIMESTAMPTZ,
  confidence_multiplier DECIMAL(3,2) DEFAULT 1.0 CHECK (confidence_multiplier >= 0 AND confidence_multiplier <= 1.0),
  filtered_out BOOLEAN NOT NULL DEFAULT false, -- true if marked as junk/filtered
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- VALUATIONS (computed pricing results)
-- ============================================================================
CREATE TABLE valuations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  intake_id UUID UNIQUE NOT NULL REFERENCES coin_intakes(id) ON DELETE CASCADE,
  price_cents_p10 INTEGER, -- 10th percentile
  price_cents_median INTEGER, -- median (50th percentile)
  price_cents_p90 INTEGER, -- 90th percentile
  price_cents_mean INTEGER,
  confidence_score INTEGER NOT NULL CHECK (confidence_score >= 1 AND confidence_score <= 10),
  explanation TEXT, -- human-readable explanation of confidence and methodology
  comp_count INTEGER NOT NULL DEFAULT 0,
  comp_sources_count INTEGER NOT NULL DEFAULT 0,
  sold_count INTEGER NOT NULL DEFAULT 0,
  ask_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PRODUCTS (storefront/public products)
-- ============================================================================
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  intake_id UUID UNIQUE REFERENCES coin_intakes(id),
  sku TEXT UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  price_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'sold', 'archived')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PRODUCT IMAGES (linked to products, references coin_media)
-- ============================================================================
CREATE TABLE product_images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  media_id UUID REFERENCES coin_media(id),
  image_url TEXT NOT NULL, -- Supabase Storage public URL
  display_order INTEGER DEFAULT 0,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- ORDERS (Stripe-ready)
-- ============================================================================
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number TEXT UNIQUE NOT NULL,
  customer_email TEXT NOT NULL,
  customer_name TEXT,
  stripe_payment_intent_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded')),
  total_cents INTEGER NOT NULL,
  shipping_cents INTEGER DEFAULT 0,
  tax_cents INTEGER DEFAULT 0,
  shipping_address JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  price_cents INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- AUDIT LOGS
-- ============================================================================
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
  user_id UUID REFERENCES profiles(id),
  old_data JSONB,
  new_data JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_coin_intakes_status ON coin_intakes(status);
CREATE INDEX idx_coin_intakes_created_by ON coin_intakes(created_by);
CREATE INDEX idx_coin_media_intake_id ON coin_media(intake_id);
CREATE INDEX idx_attributions_intake_id ON attributions(intake_id);
CREATE INDEX idx_attributions_year ON attributions(year);
CREATE INDEX idx_sources_enabled ON sources(enabled);
CREATE INDEX idx_source_rules_source_id ON source_rules(source_id);
CREATE INDEX idx_scrape_jobs_status ON scrape_jobs(status);
CREATE INDEX idx_scrape_jobs_intake_id ON scrape_jobs(intake_id);
CREATE INDEX idx_scrape_jobs_locked_at ON scrape_jobs(locked_at);
CREATE INDEX idx_scrape_job_logs_job_id ON scrape_job_logs(job_id);
CREATE INDEX idx_price_points_intake_id ON price_points(intake_id);
CREATE INDEX idx_price_points_source_id ON price_points(source_id);
CREATE INDEX idx_price_points_filtered_out ON price_points(filtered_out);
CREATE INDEX idx_valuations_intake_id ON valuations(intake_id);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_intake_id ON products(intake_id);
CREATE INDEX idx_product_images_product_id ON product_images(product_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_audit_logs_table_record ON audit_logs(table_name, record_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE coin_intakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE coin_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE attributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_job_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE valuations ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PROFILES POLICIES
-- ============================================================================
CREATE POLICY "Users can view their own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Staff and admins can view all profiles" ON profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

-- ============================================================================
-- PRODUCTS POLICIES (public read for published, staff/admin write)
-- ============================================================================
CREATE POLICY "Public can view published products" ON products
  FOR SELECT USING (status = 'published');

CREATE POLICY "Staff and admins can view all products" ON products
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

CREATE POLICY "Staff and admins can manage products" ON products
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

-- ============================================================================
-- PRODUCT IMAGES POLICIES (public read for published products)
-- ============================================================================
CREATE POLICY "Public can view images of published products" ON product_images
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM products WHERE id = product_images.product_id AND status = 'published')
  );

CREATE POLICY "Staff and admins can manage product images" ON product_images
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

-- ============================================================================
-- COIN INTAKES, MEDIA, ATTRIBUTIONS POLICIES (staff/admin only)
-- ============================================================================
CREATE POLICY "Staff and admins can manage intakes" ON coin_intakes
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

CREATE POLICY "Staff and admins can manage coin media" ON coin_media
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

CREATE POLICY "Staff and admins can manage attributions" ON attributions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

-- ============================================================================
-- SOURCES POLICIES (admin only for management, staff can read)
-- ============================================================================
CREATE POLICY "Staff and admins can view sources" ON sources
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

CREATE POLICY "Admins can manage sources" ON sources
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Staff and admins can view source rules" ON source_rules
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

CREATE POLICY "Admins can manage source rules" ON source_rules
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================================
-- SCRAPE JOBS POLICIES (staff/admin only)
-- ============================================================================
CREATE POLICY "Staff and admins can manage scrape jobs" ON scrape_jobs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

CREATE POLICY "Staff and admins can view scrape job logs" ON scrape_job_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

-- ============================================================================
-- PRICE POINTS POLICIES (staff/admin only)
-- ============================================================================
CREATE POLICY "Staff and admins can manage price points" ON price_points
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

-- ============================================================================
-- VALUATIONS POLICIES (staff/admin only)
-- ============================================================================
CREATE POLICY "Staff and admins can manage valuations" ON valuations
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

-- ============================================================================
-- ORDERS POLICIES (staff/admin only)
-- ============================================================================
CREATE POLICY "Staff and admins can manage orders" ON orders
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

CREATE POLICY "Staff and admins can manage order items" ON order_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

-- ============================================================================
-- AUDIT LOGS POLICIES (staff/admin read only)
-- ============================================================================
CREATE POLICY "Staff and admins can view audit logs" ON audit_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Function to automatically create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (NEW.id, NEW.email, 'viewer');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_coin_intakes_updated_at BEFORE UPDATE ON coin_intakes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_attributions_updated_at BEFORE UPDATE ON attributions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_sources_updated_at BEFORE UPDATE ON sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_scrape_jobs_updated_at BEFORE UPDATE ON scrape_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_valuations_updated_at BEFORE UPDATE ON valuations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- SEED DATA
-- ============================================================================

-- Insert default eBay source (enabled, requires API keys in config)
INSERT INTO sources (name, adapter_type, enabled, reputation_weight, tier, config)
VALUES (
  'eBay Sold Listings',
  'ebay_api',
  true,
  1.0,
  1,
  '{"app_id": "", "cert_id": "", "dev_id": "", "sandbox": false}'::jsonb
) ON CONFLICT (name) DO NOTHING;

-- Insert default exclude keywords for eBay (filter junk listings)
INSERT INTO source_rules (source_id, rule_type, rule_value, priority, active)
SELECT id, 'exclude_keywords', rule_value, priority, true
FROM sources,
(VALUES 
  ('replica'), ('copy'), ('plated'), ('lot'), ('cleaned'), ('damaged'),
  ('damage'), ('scratched'), ('fake'), ('reproduction'), ('duplicate')
) AS keywords(rule_value)
CROSS JOIN (SELECT 1 as priority) as p
WHERE name = 'eBay Sold Listings'
ON CONFLICT DO NOTHING;




