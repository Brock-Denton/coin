# Architecture Overview

## System Architecture

```
┌─────────────────┐         ┌──────────────┐         ┌─────────────┐
│   Web App       │────────▶│   Supabase   │◀────────│   Worker    │
│   (Next.js)     │         │  (Postgres)  │         │   (Python)  │
│   Vercel        │         │              │         │   Docker    │
└─────────────────┘         └──────────────┘         └─────────────┘
       │                            │
       │                            │
       ▼                            ▼
  coins.gov.technology          Storage Bucket
                                (coin-media)
```

## Data Flow

### Intake Workflow

1. **Create Intake**: Admin creates new intake record
2. **Upload Photos**: Photos uploaded to Supabase Storage
3. **Attribution**: Admin fills in coin details (year, mintmark, denomination, etc.)
4. **Run Pricing**: Admin clicks "Run Pricing" → Creates `scrape_jobs` records
5. **Worker Processing**: Worker polls jobs, executes collectors, creates `price_points`
6. **Valuation**: Worker computes valuation from price points → Creates `valuations` record
7. **Create Product**: Admin creates product from intake → Publishes to storefront

### Pricing Collection Flow

1. Admin triggers pricing job via UI
2. `scrape_jobs` row inserted with `status='pending'`
3. Worker polls for pending jobs
4. Worker locks job (`status='running'`, sets `locked_by`)
5. Worker gets source config and attribution data
6. Worker executes collector (e.g., eBay API)
7. Worker inserts `price_points` records
8. Worker computes valuation from all price points for intake
9. Worker updates job `status='completed'`

## Components

### Web App (`apps/web`)

**Framework**: Next.js 14+ App Router

**Key Features**:
- Server-side rendering for SEO
- Client-side interactivity with React
- Supabase Auth for authentication
- Middleware for route protection

**Routes**:
- `/` - Home page (public)
- `/browse` - Product listing (public)
- `/product/[id]` - Product detail (public)
- `/admin` - Admin dashboard (protected)
- `/admin/intakes` - Intake management (protected)
- `/admin/sources` - Source management (protected)
- `/admin/orders` - Order management (protected)

### Worker Service (`services/worker`)

**Language**: Python 3.11+

**Architecture**:
- Continuous polling loop
- Job locking mechanism (prevents duplicate processing)
- Collector pattern (pluggable collectors)
- Valuation engine (statistical analysis)

**Collectors**:
- `EbayCollector` - eBay Finding API
- `ManualCollector` - Placeholder for manual entry
- `SeleniumCollector` - Placeholder (disabled by default)

**Valuation Engine**:
- Percentile calculation (p10, median, p90)
- Outlier filtering (IQR method)
- Confidence scoring (1-10 scale)
- Multi-source reputation weighting

### Database (`supabase`)

**PostgreSQL** with Supabase features:
- Row Level Security (RLS)
- Real-time subscriptions
- Storage buckets
- Auth integration

**Key Tables**:
- `profiles` - User roles
- `coin_intakes` - Intake workflow
- `attributions` - Coin identification
- `sources` - Pricing sources
- `scrape_jobs` - Job queue
- `price_points` - Individual comps
- `valuations` - Computed pricing
- `products` - Storefront products
- `orders` - Customer orders

## Security

### Authentication

- Supabase Auth handles user authentication
- JWT tokens for session management
- Middleware validates tokens on protected routes

### Authorization

- Row Level Security (RLS) policies enforce data access
- Roles: `admin`, `staff`, `viewer`
- Public can only read published products

### API Security

- Worker uses service role key (bypasses RLS)
- Web app uses anon key (respects RLS)
- Never expose service role key to client

## Scalability

### Horizontal Scaling

- **Web App**: Vercel handles auto-scaling
- **Worker**: Run multiple worker instances with unique `WORKER_ID`
- **Database**: Supabase handles connection pooling

### Performance

- **Caching**: Supabase Storage CDN for images
- **Database**: Indexes on frequently queried columns
- **Worker**: Job locking prevents duplicate work

## Monitoring

### Logs

- **Web App**: Vercel function logs
- **Worker**: Docker logs, Supabase `scrape_job_logs` table
- **Database**: Supabase dashboard logs

### Metrics

- Job success/failure rates
- Valuation confidence scores
- API rate limit usage
- Storage usage

## Future Enhancements

1. **Real-time Updates**: Supabase real-time subscriptions for job status
2. **Webhooks**: Trigger pricing jobs via webhooks instead of polling
3. **Caching**: Redis cache for frequently accessed data
4. **Analytics**: Product views, search queries, conversion tracking
5. **Notifications**: Email/SMS for job completion, new orders
6. **Multi-currency**: Support for non-USD pricing
7. **Image Processing**: Auto-crop, resize, watermark images
8. **Machine Learning**: Price prediction models


