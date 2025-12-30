# Coin Inventory & Pricing System

Production-grade monorepo for US coin inventory and pricing system at [coins.gov.technology](https://coins.gov.technology).

## Architecture

- **Web App** (`apps/web`): Next.js 14+ App Router with TypeScript, Tailwind, and shadcn/ui
- **Worker Service** (`services/worker`): Python 3.11+ worker for automated pricing collection
- **Database** (`supabase`): Supabase with PostgreSQL, migrations, and RLS policies
- **Infrastructure** (`infra`): Docker Compose and Cloudflare Tunnel configs

## Core Principles

- **No paid pricing APIs**: All automated pricing uses free/public sources
- **Primary source**: eBay SOLD listings via official eBay API
- **Manual-first**: Other sources require explicit permission/licensing
- **Selenium optional**: Exists as adapter type but disabled by default

## Quick Start

### 1. Supabase Setup

See [`supabase/README.md`](./supabase/README.md) for detailed setup instructions.

1. Create a Supabase project
2. Run the migration: `supabase/migrations/001_init.sql`
3. Create storage bucket: `coin-media` (public read, authenticated write)

### 2. Web App Setup

See [`apps/web/README.md`](./apps/web/README.md) for details.

```bash
cd apps/web
cp env.example .env.local
# Edit .env.local with your Supabase credentials
npm install
npm run dev
```

### 3. Worker Setup

See [`services/worker/README.md`](./services/worker/README.md) for details.

```bash
cd services/worker
cp env.example .env
# Edit .env with your Supabase credentials and eBay API keys
docker-compose up -d
```

## Deployment

### Vercel (Web App)

See [`docs/vercel-deploy.md`](./docs/vercel-deploy.md) for detailed deployment instructions.

1. Connect your GitHub repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy to `coins.gov.technology`

### Worker (Docker)

The worker runs on any machine with Docker Desktop (Windows recommended).

See [`services/worker/README.md`](./services/worker/README.md) for Windows setup.

## Repository Structure

```
.
├── apps/
│   └── web/              # Next.js web application
├── services/
│   └── worker/           # Python worker service
├── supabase/
│   └── migrations/       # SQL migration files
├── infra/                # Docker Compose, Cloudflare configs
└── docs/                 # Documentation
```

## Key Features

### Web App

- **Public Pages**: Home, Browse, Product detail with pricing evidence
- **Admin Panel**: Intake management, attribution editing, pricing jobs, source management, orders

### Worker

- **eBay Collector**: Official eBay Finding API for sold listings
- **Valuation Engine**: Percentile-based pricing with confidence scores (1-10)
- **Job Queue**: Supabase-based job queue with locking

### Database

- **RLS Policies**: Public read for published products, staff/admin for operational tables
- **Comprehensive Schema**: Intakes, attributions, sources, jobs, price points, valuations, products, orders

## Environment Variables

### Web App (`apps/web/.env.local`)

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### Worker (`services/worker/.env`)

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key
WORKER_ID=worker-1
EBAY_APP_ID=your-ebay-app-id
EBAY_CERT_ID=your-ebay-cert-id
EBAY_DEV_ID=your-ebay-dev-id
```

## License

[Your License Here]




