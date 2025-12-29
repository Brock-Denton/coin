# Infrastructure Setup

This directory contains Docker Compose configuration for running the worker service.

## Prerequisites

- Docker Desktop for Windows
- Supabase project with migrations applied
- Worker environment variables configured

## Quick Start

From the repository root:

```powershell
# Build the worker container
docker-compose -f infra/docker-compose.yml build

# Start the worker (detached)
docker-compose -f infra/docker-compose.yml up -d

# View logs (follow mode)
docker-compose -f infra/docker-compose.yml logs -f worker

# Stop the worker
docker-compose -f infra/docker-compose.yml stop

# Stop and remove containers (keeps volumes)
docker-compose -f infra/docker-compose.yml down

# Stop and remove containers + volumes (clean reset)
docker-compose -f infra/docker-compose.yml down -v
```

## Services

### Worker

The Python worker service that processes scrape jobs from Supabase.

**Volumes:**
- `worker_cache`: SQLite cache database (persists across restarts)
- `worker_logs`: Log files (optional)

**Environment:**
- Loaded from `services/worker/.env`
- Required: `SUPABASE_URL`, `SUPABASE_KEY`, `WORKER_ID`

## Windows Commands Reference

All commands should be run from the repository root directory.

### Build

```powershell
docker-compose -f infra/docker-compose.yml build
```

### Start

```powershell
# Start in background
docker-compose -f infra/docker-compose.yml up -d

# Start and view logs
docker-compose -f infra/docker-compose.yml up
```

### Logs

```powershell
# View logs
docker-compose -f infra/docker-compose.yml logs worker

# Follow logs (live)
docker-compose -f infra/docker-compose.yml logs -f worker

# Last 100 lines
docker-compose -f infra/docker-compose.yml logs --tail=100 worker
```

### Stop

```powershell
# Stop (keeps containers)
docker-compose -f infra/docker-compose.yml stop

# Stop and remove (keeps volumes)
docker-compose -f infra/docker-compose.yml down

# Stop, remove, and delete volumes (clean reset)
docker-compose -f infra/docker-compose.yml down -v
```

### Restart

```powershell
docker-compose -f infra/docker-compose.yml restart worker
```

### Shell Access

```powershell
docker-compose -f infra/docker-compose.yml exec worker /bin/sh
```

## Troubleshooting

### Worker Not Starting

1. Check environment variables are set in `services/worker/.env`
2. Verify Supabase connection
3. Check logs: `docker-compose -f infra/docker-compose.yml logs worker`

### Cache Issues

Cache is stored in the `worker_cache` volume. To clear cache:

```powershell
docker-compose -f infra/docker-compose.yml down -v
docker-compose -f infra/docker-compose.yml up -d
```

### Port Conflicts

If you need to expose ports, add to `docker-compose.yml`:

```yaml
ports:
  - "8000:8000"
```

## Notes

- All paths in `docker-compose.yml` are relative to the repository root
- Volumes persist data across container restarts
- Use `down -v` to completely reset (deletes volumes)

