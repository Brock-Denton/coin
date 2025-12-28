# Worker Service

Python 3.11+ worker service for automated pricing collection from various sources.

## Features

- **eBay Collector**: Official eBay Finding API for sold listings
- **Valuation Engine**: Percentile-based pricing with confidence scoring
- **Job Queue**: Polls Supabase `scrape_jobs` table
- **Source Management**: Configurable sources with reputation weighting
- **Filtering**: Keyword-based filtering for junk listings

## Prerequisites

- Python 3.11 or higher
- Docker Desktop (for Windows)
- Supabase project with migrations applied
- eBay API credentials (for eBay collector)

## Setup (Windows Docker Desktop)

### 1. Install Docker Desktop

1. Download from [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/)
2. Install and start Docker Desktop
3. Ensure WSL 2 backend is enabled

### 2. Get eBay API Credentials

1. Go to [developer.ebay.com](https://developer.ebay.com)
2. Create a developer account
3. Create a new application
4. Get your credentials:
   - App ID (Client ID)
   - Cert ID (Client Secret)
   - Dev ID (optional)

### 3. Configure Environment

1. Copy `env.example` to `.env`:

```powershell
cd services/worker
Copy-Item env.example .env
```

2. Edit `.env` with your values:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key
WORKER_ID=worker-1
POLL_INTERVAL_SECONDS=5
JOB_LOCK_TIMEOUT_SECONDS=300

# eBay API (can also be configured in sources table)
EBAY_APP_ID=your-ebay-app-id
EBAY_CERT_ID=your-ebay-cert-id
EBAY_DEV_ID=your-ebay-dev-id
EBAY_SANDBOX=false
```

**Important**: Use the **service role key** (not anon key) for `SUPABASE_KEY` so the worker can bypass RLS.

### 4. Build and Run

From the `infra` directory:

```powershell
cd ..\infra
docker-compose up -d --build
```

Or from the worker directory:

```powershell
cd services\worker
docker build -t coin-worker .
docker run --env-file .env coin-worker
```

### 5. View Logs

```powershell
docker-compose logs -f worker
```

Or:

```powershell
docker logs -f coin_worker
```

## Local Development (Without Docker)

### 1. Install Dependencies

```powershell
cd services\worker
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### 2. Run Worker

```powershell
python main.py
```

## Architecture

### Job Flow

1. Worker polls `scrape_jobs` for pending jobs
2. Locks job (sets status to 'running', records worker_id)
3. Gets source configuration and attribution data
4. Executes collector (e.g., eBay API)
5. Inserts price points
6. Computes valuation from all price points for the intake
7. Updates job status to 'completed'

### Collectors

#### eBay Collector

- Uses official eBay Finding API
- Queries sold listings only
- Filters junk listings via keywords (replica, copy, plated, etc.)
- Normalizes prices to USD cents
- Stores raw API response for audit

**Query Construction**:
- Builds query from attribution fields (year, mintmark, denomination, title)
- Adds "US coin" prefix
- Limits keywords to avoid over-filtering

### Valuation Engine

Computes pricing from price points:

1. **Filters outliers** using IQR method
2. **Computes percentiles**: p10, median (p50), p90, mean
3. **Calculates confidence score** (1-10) based on:
   - Number of comps (0-3 points)
   - Source reputation weights (0-2 points)
   - Sold vs Ask ratio (0-2 points, caps at 7 if mostly ask)
   - Price spread tightness (0-3 points)
4. **Generates explanation** text

## Configuration

### Source Configuration

Sources are managed in Supabase `sources` table. Example:

```sql
UPDATE sources
SET 
  enabled = true,
  reputation_weight = 1.0,
  config = '{"app_id": "your-app-id", "sandbox": false}'::jsonb
WHERE name = 'eBay Sold Listings';
```

### Source Rules

Filtering rules are in `source_rules` table:

```sql
-- Add exclude keyword
INSERT INTO source_rules (source_id, rule_type, rule_value, priority, active)
VALUES (
  (SELECT id FROM sources WHERE name = 'eBay Sold Listings'),
  'exclude_keywords',
  'replica',
  1,
  true
);
```

## Monitoring

### Job Status

Check job status in Supabase:

```sql
SELECT 
  id,
  status,
  source_id,
  started_at,
  completed_at,
  error_message
FROM scrape_jobs
ORDER BY created_at DESC
LIMIT 10;
```

### Job Logs

```sql
SELECT 
  log_level,
  message,
  metadata,
  created_at
FROM scrape_job_logs
WHERE job_id = 'job-id-here'
ORDER BY created_at;
```

### Price Points

```sql
SELECT 
  COUNT(*) as count,
  AVG(price_cents) as avg_price,
  MIN(price_cents) as min_price,
  MAX(price_cents) as max_price
FROM price_points
WHERE intake_id = 'intake-id-here'
  AND filtered_out = false;
```

## Troubleshooting

### Worker Not Processing Jobs

1. Check worker is running: `docker ps`
2. Check logs: `docker-compose logs worker`
3. Verify environment variables are set correctly
4. Check Supabase connection (test with `supabase.table('sources').select('*').execute()`)

### eBay API Errors

1. Verify API credentials are correct
2. Check API rate limits (default: 60 calls/minute)
3. Review eBay API status: [developer.ebay.com/status](https://developer.ebay.com/status)
4. Check if sandbox mode is enabled when it shouldn't be

### No Price Points Collected

1. Check job logs for errors
2. Verify attribution data is complete (year, denomination, etc.)
3. Test query manually in eBay API explorer
4. Check if source is enabled
5. Review exclude keywords (may be filtering too aggressively)

### Valuation Confidence Too Low

1. Ensure sufficient comps (aim for 10+)
2. Use sold listings (not ask prices)
3. Multiple sources improve confidence
4. Check source reputation weights

## Development

### Adding a New Collector

1. Create new file in `src/collectors/` (e.g., `manual.py`)
2. Inherit from `BaseCollector`
3. Implement `collect(query_params: dict) -> list` method
4. Update `get_collector()` in `src/worker.py`
5. Add source with `adapter_type` in Supabase

### Testing

```powershell
# Run with debug logging
python main.py

# Test specific collector
python -c "from src.collectors.ebay import EbayCollector; c = EbayCollector('test'); print(c._build_query({'year': 1921, 'denomination': 'dollar'}))"
```

## Production Considerations

1. **Scaling**: Run multiple worker instances with unique `WORKER_ID`
2. **Monitoring**: Set up log aggregation (e.g., Datadog, CloudWatch)
3. **Error Handling**: Implement retry logic for transient failures
4. **Rate Limiting**: Respect API rate limits, implement backoff
5. **Security**: Never commit `.env` file, use secrets management
6. **Backup**: Regular database backups for price_points and valuations


