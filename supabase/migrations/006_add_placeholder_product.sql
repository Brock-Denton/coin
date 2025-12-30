-- ============================================================================
-- PLACEHOLDER PRODUCT
-- Add a "Coming Soon" placeholder product that only shows when there are no real products
-- ============================================================================

-- Insert placeholder product (will only be visible when no other products exist)
-- Using a special SKU to identify it as placeholder
INSERT INTO products (sku, title, description, price_cents, status, published_at)
VALUES (
  'PLACEHOLDER-COMING-SOON',
  'Coming Soon',
  'We are currently preparing our coin inventory. Check back soon for authentic US coins with transparent, data-driven pricing.',
  0, -- Free/placeholder price
  'published',
  NOW()
)
ON CONFLICT (sku) DO NOTHING;

-- Note: This placeholder will be filtered out in application code when real products exist


