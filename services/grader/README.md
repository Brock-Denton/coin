# Grader Service

Python service that processes grading jobs for coin image analysis and ROI recommendations.

## Overview

The grader service polls for grading jobs (`job_type='grading'`) from the `scrape_jobs` table, analyzes coin images to estimate grade distributions, and computes ROI recommendations for professional grading services.

## Features

- **Grade Estimation**: Analyzes coin images using a baseline rule-based model to estimate grade distributions
- **ROI Calculations**: Computes expected values and costs to recommend whether to submit for grading or sell raw
- **Certified Comps Override**: Uses actual certified comps when available (>=10 total, >=3 per bucket)
- **Multiplier Fallback**: Falls back to series-aware multipliers when insufficient certified comps

## Setup

1. Copy `.env.example` to `.env`:
   ```bash
   cp env.example .env
   ```

2. Configure environment variables in `.env`:
   ```
   SUPABASE_URL=your_supabase_url
   SUPABASE_KEY=your_supabase_service_role_key
   GRADER_ID=grader-1
   POLL_INTERVAL_SECONDS=10
   JOB_LOCK_TIMEOUT_SECONDS=300
   ```

3. Build and run with Docker:
   ```bash
   docker-compose up grader
   ```

## Architecture

- Uses Supabase job pattern with `job_type='grading'` to differentiate from pricing jobs
- Polls `claim_next_pending_job` with `p_job_type='grading'` to claim jobs atomically
- Processes images from `coin_media` table
- Stores results in `grade_estimates` and `grading_recommendations` tables

## Development

Run locally (after installing dependencies):
```bash
python main.py
```

## Model Versions

- **baseline_v1**: Rule-based model with image quality checks, surface features, details risk detection, and grade bucket mapping

Future model versions can be added by implementing new estimator classes and updating the model_version in the database.

## Workflow

1. User uploads coin images and fills attribution
2. User clicks "Run AI Pre Grade" on intake detail page
3. `enqueue_grading_job` RPC creates a grading job
4. Grader service claims the job
5. Grader analyzes images and estimates grade distribution
6. Grader computes recommendations for each grading service
7. Results stored in database and displayed on intake detail page

## Smoke Testing

To verify the grader service can process images:

1. **Verify coin_media schema**: Ensure `coin_media` rows have the `kind` column set to 'obverse', 'reverse', or 'edge'. The `media_type` should be 'photo' for images.

2. **Check grading job sees images**:
   - Create a grading job via `enqueue_grading_job(intake_id)` RPC
   - Check grader logs for "Found coin images" message with image count
   - If no images found, verify:
     - `coin_media` rows exist for the intake_id
     - Rows have `kind IN ('obverse', 'reverse', 'edge')` (or `media_type` for legacy data)
     - Grader service has proper database access

3. **Verify job claiming**: The grader should only claim jobs where `job_type='grading'`. The worker service claims jobs where `job_type='pricing'`.

