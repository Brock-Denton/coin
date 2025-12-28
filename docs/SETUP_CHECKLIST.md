# Setup Checklist

Use this checklist to ensure everything is set up correctly.

## Initial Setup

### Supabase

- [ ] Create Supabase project
- [ ] Run migration (`supabase/migrations/001_init.sql`)
- [ ] Create `coin-media` storage bucket (public read, authenticated write)
- [ ] Create admin user account
- [ ] Set admin user role to 'admin' in `profiles` table
- [ ] Configure eBay source in `sources` table (add API credentials to config JSONB)
- [ ] Test connection from Supabase dashboard

### Web App

- [ ] Navigate to `apps/web`
- [ ] Copy `env.example` to `.env.local`
- [ ] Add `NEXT_PUBLIC_SUPABASE_URL`
- [ ] Add `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] Run `npm install`
- [ ] Run `npm run dev`
- [ ] Verify app loads at http://localhost:3000
- [ ] Test admin login at http://localhost:3000/admin/login

### Worker

- [ ] Navigate to `services/worker`
- [ ] Copy `env.example` to `.env`
- [ ] Add `SUPABASE_URL`
- [ ] Add `SUPABASE_KEY` (use service role key)
- [ ] Add eBay API credentials (or configure in sources table)
- [ ] Install Docker Desktop (Windows)
- [ ] Build and run with `docker-compose up -d` from `infra/` directory
- [ ] Check logs: `docker-compose logs -f worker`
- [ ] Verify worker is polling for jobs

## eBay API Setup

- [ ] Create eBay Developer account
- [ ] Create new application
- [ ] Get App ID (Client ID)
- [ ] Get Cert ID (Client Secret)
- [ ] Get Dev ID (optional)
- [ ] Configure in worker `.env` or in `sources` table config JSONB
- [ ] Test API access (can use eBay API explorer)

## Testing Workflow

### Create Intake

- [ ] Log into admin panel
- [ ] Navigate to Intakes
- [ ] Create new intake
- [ ] Upload obverse photo
- [ ] Upload reverse photo
- [ ] Fill in attribution fields (year, mintmark, denomination, etc.)
- [ ] Save attribution

### Run Pricing

- [ ] Click "Run Pricing" button on intake detail page
- [ ] Verify job created in `scrape_jobs` table (status='pending')
- [ ] Check worker logs to see job being processed
- [ ] Verify `price_points` being inserted
- [ ] Check `valuations` table for computed valuation
- [ ] Verify valuation appears on intake detail page

### Create Product

- [ ] From intake detail page, create product
- [ ] Set title, description, price
- [ ] Set status to 'published'
- [ ] Verify product appears on home page
- [ ] Verify product appears in browse page
- [ ] Click through to product detail page
- [ ] Verify images, attribution, and pricing evidence panel display

### Public Site

- [ ] Visit home page (without login)
- [ ] Browse products
- [ ] Use filters on browse page
- [ ] View product detail page
- [ ] Toggle evidence panel to see pricing methodology
- [ ] Verify admin link not accessible without login

## Deployment

### Vercel

- [ ] Push code to GitHub
- [ ] Connect repository to Vercel
- [ ] Set environment variables in Vercel
- [ ] Configure domain: `coins.gov.technology`
- [ ] Deploy and verify site is live
- [ ] Test admin login on production
- [ ] Test full workflow on production

### Worker (Production)

- [ ] Set up production server (Windows with Docker Desktop recommended)
- [ ] Copy `.env` with production credentials
- [ ] Run worker with `docker-compose up -d`
- [ ] Set up log monitoring
- [ ] Test job processing with production Supabase
- [ ] Set up auto-restart (Docker restart policy)

## Security Checklist

- [ ] Never committed `.env` files
- [ ] Using service role key only for worker (never in web app)
- [ ] Using anon key for web app (respects RLS)
- [ ] RLS policies are enabled on all tables
- [ ] Admin routes are protected by middleware
- [ ] Storage bucket policies restrict uploads to authenticated users
- [ ] API keys are stored securely (environment variables, not code)

## Monitoring

- [ ] Set up error tracking (optional: Sentry, LogRocket, etc.)
- [ ] Monitor worker logs regularly
- [ ] Check Supabase dashboard for errors
- [ ] Monitor job success/failure rates
- [ ] Track valuation confidence scores
- [ ] Monitor API rate limits (eBay, etc.)

## Troubleshooting

Common issues and solutions:

### Worker not processing jobs

- Check worker is running: `docker ps`
- Check logs: `docker-compose logs worker`
- Verify environment variables
- Check Supabase connection

### Pricing jobs failing

- Verify eBay API credentials
- Check job logs in `scrape_job_logs` table
- Verify attribution data is complete
- Check if source is enabled

### Images not uploading

- Verify storage bucket exists
- Check bucket policies
- Verify file size limits
- Check browser console for errors

### Admin login not working

- Verify user exists in Supabase Auth
- Check profile role is 'admin' or 'staff'
- Check middleware configuration
- Review browser console for errors

## Next Steps

After basic setup is complete:

1. Configure additional sources (if needed)
2. Set up email notifications (optional)
3. Configure Stripe for payments (if needed)
4. Set up analytics (optional)
5. Optimize images and performance
6. Set up backups and disaster recovery
7. Document customizations and workflows


