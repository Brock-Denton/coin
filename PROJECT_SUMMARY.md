# Project Summary

## Overview

Production-grade monorepo for a US coin inventory and pricing system deployed at **coins.gov.technology**.

## What's Included

### ✅ Complete Monorepo Structure

```
coin_worker/
├── apps/web/              # Next.js 14+ web application
├── services/worker/       # Python 3.11+ worker service
├── supabase/             # Database migrations
├── infra/                # Docker Compose, Cloudflare configs
└── docs/                 # Comprehensive documentation
```

### ✅ Database Schema (Supabase)

- **Complete SQL migration** with 15+ tables
- **Row Level Security (RLS)** policies for all tables
- **Seed data** for eBay source and default filters
- **Audit logging** and triggers

Tables include:
- `profiles` (user roles: admin/staff/viewer)
- `coin_intakes` (intake workflow)
- `coin_media` (photo storage)
- `attributions` (coin identification fields)
- `sources` + `source_rules` (pricing sources with filtering)
- `scrape_jobs` + `scrape_job_logs` (job queue)
- `price_points` (individual comps)
- `valuations` (computed pricing with confidence scores)
- `products` + `product_images` (storefront)
- `orders` + `order_items` (Stripe-ready)
- `audit_logs`

### ✅ Web Application (Next.js)

**Public Pages:**
- Home page with latest products
- Browse page with filters (denomination, year, price)
- Product detail page with evidence panel

**Admin Pages:**
- Login (Supabase Auth)
- Intakes list and detail:
  - Photo upload (obverse/reverse)
  - Attribution editing
  - "Run Pricing" button
  - View comps and valuations
- Sources management
- Orders page (scaffold)

**Tech Stack:**
- Next.js 14+ App Router
- TypeScript
- Tailwind CSS
- shadcn/ui components
- Supabase for auth and database

### ✅ Worker Service (Python)

**Features:**
- Continuous job polling from Supabase
- Job locking mechanism
- eBay collector (official Finding API)
- Valuation engine (percentile-based with confidence scoring)
- Structured logging

**Valuation Engine:**
- Percentile calculation (p10, median, p90)
- Outlier filtering (IQR method)
- Confidence scoring (1-10) based on:
  - Number of comps
  - Source reputation weights
  - Sold vs Ask ratio
  - Price spread tightness

### ✅ Docker Setup

- `docker-compose.yml` for worker service
- Optional Selenium container (commented out)
- Windows-first README with Docker Desktop instructions

### ✅ Documentation

- **README.md** - Main project overview
- **supabase/README.md** - Database setup guide
- **services/worker/README.md** - Worker setup and usage
- **apps/web/README.md** - Web app documentation
- **docs/vercel-deploy.md** - Vercel deployment guide
- **docs/ARCHITECTURE.md** - System architecture overview
- **docs/SETUP_CHECKLIST.md** - Step-by-step setup checklist

### ✅ Configuration Files

- `.env.example` files for both web and worker
- `.gitignore` for the monorepo
- `components.json` for shadcn/ui
- `requirements.txt` for Python dependencies
- `package.json` for Next.js dependencies

## Core Principles Implemented

✅ **No paid pricing APIs** - Only free/public sources  
✅ **eBay as primary source** - Official eBay Finding API for sold listings  
✅ **Manual-first approach** - Other sources require explicit permission  
✅ **Selenium optional** - Exists as adapter type, disabled by default  
✅ **Supabase as hub** - Web triggers jobs via database, no local network dependency  

## Key Features

### Pricing System

- Automated collection from eBay sold listings
- Aggressive filtering of junk listings (replica, copy, plated, etc.)
- Multi-source support with reputation weighting
- Percentile-based valuation (p10/median/p90)
- Confidence scoring (1-10) with detailed explanations

### Admin Workflow

1. Create intake → Upload photos → Edit attribution
2. Run pricing → View comps → Review valuation
3. Create product → Publish to storefront

### Public Site

- Browse published products
- Filter by denomination, year, price
- View pricing evidence (comps, confidence scores)
- Transparent pricing methodology

## Next Steps for Deployment

1. **Set up Supabase:**
   - Create project
   - Run migration
   - Create storage bucket
   - Create admin user

2. **Configure eBay API:**
   - Get developer credentials
   - Add to worker config

3. **Deploy Web App:**
   - Push to GitHub
   - Connect to Vercel
   - Set environment variables
   - Configure domain

4. **Run Worker:**
   - Set up Windows machine with Docker Desktop
   - Configure environment variables
   - Start with docker-compose

5. **Test Workflow:**
   - Create intake
   - Run pricing
   - Create product
   - Verify on public site

## Files Created

**Total: 50+ files** including:
- 1 database migration (400+ lines)
- 10+ Python modules (worker service)
- 20+ React components and pages
- 5 documentation files
- Configuration files for all services

## Notes

- All code follows best practices
- Type-safe (TypeScript + Pydantic)
- Security-focused (RLS, middleware, environment variables)
- Production-ready structure
- Comprehensive error handling
- Extensive documentation

The system is ready for deployment and use. Follow the setup guides in the `docs/` directory to get started.


