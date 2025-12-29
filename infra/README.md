# Infrastructure Setup

**Note**: The canonical `docker-compose.yml` is now at the repository root. This directory's compose file is deprecated.

## Using Docker Compose

Run all commands from the **repository root**:

```powershell
# Build the worker container
docker-compose build

# Start the worker (detached)
docker-compose up -d

# View logs (follow mode)
docker-compose logs -f worker

# Stop the worker
docker-compose stop

# Stop and remove containers (keeps volumes)
docker-compose down

# Stop and remove containers + volumes (clean reset)
docker-compose down -v
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

All commands should be run from the **repository root** directory.

### Build

```powershell
docker-compose build
```

### Start

```powershell
# Start in background
docker-compose up -d

# Start and view logs
docker-compose up
```

### Logs

```powershell
# View logs
docker-compose logs worker

# Follow logs (live)
docker-compose logs -f worker

# Last 100 lines
docker-compose logs --tail=100 worker
```

### Stop

```powershell
# Stop (keeps containers)
docker-compose stop

# Stop and remove (keeps volumes)
docker-compose down

# Stop, remove, and delete volumes (clean reset)
docker-compose down -v
```

### Restart

```powershell
docker-compose restart worker
```

### Shell Access

```powershell
docker-compose exec worker /bin/sh
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

- The canonical `docker-compose.yml` is at the repository root
- All paths in the compose file are relative to the repository root
- Volumes persist data across container restarts (`worker_cache`, `worker_logs`)
- Use `down -v` to completely reset (deletes volumes)

