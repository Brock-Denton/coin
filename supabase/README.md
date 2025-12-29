# Supabase Setup Guide

## Initial Setup

### 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Create a new project
3. Note your project URL and anon key

### 2. Run Migration

1. Go to SQL Editor in Supabase dashboard
2. Copy the contents of `migrations/001_init.sql`
3. Execute the SQL
4. Verify all tables were created

Alternatively, use Supabase CLI:

```bash
supabase link --project-ref your-project-ref
supabase db push
```

### 3. Create Storage Bucket

1. Go to Storage in Supabase dashboard
2. Create a new bucket named `coin-media`
3. Set it to **Public** (for read access)
4. Set policies:
   - **SELECT**: Public (anyone can read)
   - **INSERT**: Authenticated (only authenticated users can upload)
   - **UPDATE**: Authenticated
   - **DELETE**: Authenticated

Or via SQL:

```sql
-- Create bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('coin-media', 'coin-media', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read
CREATE POLICY "Public can read coin-media"
ON storage.objects FOR SELECT
USING (bucket_id = 'coin-media');

-- Allow authenticated upload
CREATE POLICY "Authenticated can upload coin-media"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'coin-media' AND auth.role() = 'authenticated');

-- Allow authenticated update/delete
CREATE POLICY "Authenticated can manage own coin-media"
ON storage.objects FOR ALL
USING (bucket_id = 'coin-media' AND auth.role() = 'authenticated');
```

### 4. Configure Authentication

1. Go to Authentication > Settings
2. Enable Email auth
3. Configure email templates if needed
4. (Optional) Configure OAuth providers

### 5. Create Admin User

1. Go to Authentication > Users
2. Create a new user (email/password)
3. Note the user ID

4. Update user role to admin:

```sql
UPDATE profiles
SET role = 'admin'
WHERE id = 'user-id-here';
```

## Environment Variables

Add these to your applications:

**Web App:**
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

**Worker:**
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key  # Use service role key for worker
```

## Schema Overview

### Core Tables

- `profiles` - User profiles with roles (admin/staff/viewer)
- `coin_intakes` - Intake workflow tracking
- `coin_media` - Photo storage references
- `attributions` - US coin identification fields
- `sources` - Pricing data sources
- `source_rules` - Filtering rules per source
- `scrape_jobs` - Job queue for pricing collection
- `scrape_job_logs` - Detailed execution logs
- `price_points` - Individual comps/observations
- `valuations` - Computed pricing results
- `products` - Storefront products
- `product_images` - Product image references
- `orders` - Customer orders (Stripe-ready)
- `order_items` - Order line items
- `audit_logs` - Audit trail

### Row Level Security (RLS)

- **Public**: Can read published products/images only
- **Staff/Admin**: Can read/write operational tables
- **Admin**: Can manage sources/rules

## Seeding Initial Data

The migration includes seed data for:
- Default eBay source configuration
- Default exclude keywords for eBay (replica, copy, plated, etc.)

## Backup & Restore

### Backup

```bash
supabase db dump --file backup.sql
```

### Restore

```bash
supabase db reset
psql -h your-db-host -U postgres -d postgres < backup.sql
```

## Troubleshooting

### RLS Policy Issues

If you're having trouble with RLS, temporarily disable it to test:

```sql
ALTER TABLE table_name DISABLE ROW LEVEL SECURITY;
```

**Remember to re-enable it after testing!**

### Storage Upload Issues

Ensure:
1. Bucket exists and is public
2. Policies allow authenticated upload
3. File size limits are configured (default: 50MB)

### Migration Errors

If migration fails:
1. Check for existing tables (may need to drop first)
2. Verify extensions are enabled (`uuid-ossp`, `pgcrypto`)
3. Check Supabase logs for detailed error messages



