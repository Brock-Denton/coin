# Vercel Deployment Guide

Deploy the Next.js web app to Vercel at `coins.gov.technology`.

## Prerequisites

- Vercel account
- GitHub repository with code
- Supabase project set up
- Domain: `coins.gov.technology`

## Steps

### 1. Connect Repository

1. Go to [vercel.com](https://vercel.com)
2. Click "Add New Project"
3. Import your GitHub repository
4. Select the repository

### 2. Configure Project

**Root Directory**: Set to `apps/web`

**Framework Preset**: Next.js (auto-detected)

**Build Command**: `npm run build` (default)

**Output Directory**: `.next` (default)

**Install Command**: `npm install` (default)

### 3. Environment Variables

Add these environment variables in Vercel dashboard:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

**Important**: 
- Use `NEXT_PUBLIC_` prefix for client-side variables
- Use the **anon key** (not service role key) for the web app

### 4. Configure Domain

1. Go to Project Settings > Domains
2. Add `coins.gov.technology`
3. Follow DNS configuration instructions:
   - Add A record pointing to Vercel's IP
   - Or add CNAME record pointing to `cname.vercel-dns.com`
4. Wait for DNS propagation (may take a few minutes)

### 5. Deploy

1. Click "Deploy"
2. Wait for build to complete
3. Visit your domain to verify

## Post-Deployment

### 1. Verify Supabase Connection

1. Visit `https://coins.gov.technology`
2. Check browser console for errors
3. Try browsing products (should work if RLS policies are correct)

### 2. Configure Admin Access

1. Visit `https://coins.gov.technology/admin/login`
2. Sign in with your admin user
3. Verify admin panel loads

### 3. Set Up Redirects (Optional)

If you want to redirect `www.coins.gov.technology` to `coins.gov.technology`, add to `apps/web/next.config.ts`:

```typescript
async redirects() {
  return [
    {
      source: '/:path*',
      has: [
        {
          type: 'host',
          value: 'www.coins.gov.technology',
        },
      ],
      destination: 'https://coins.gov.technology/:path*',
      permanent: true,
    },
  ];
},
```

## Environment Variables Reference

### Required

- `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anon/public key

### Optional

- `NODE_ENV`: Set to `production` (auto-set by Vercel)
- `VERCEL_URL`: Current deployment URL (auto-set by Vercel)

## Troubleshooting

### Build Fails

1. Check build logs in Vercel dashboard
2. Verify `apps/web` contains valid Next.js app
3. Ensure `package.json` has correct scripts
4. Check for TypeScript errors locally first

### 404 on Pages

1. Verify routes exist in `app/` directory
2. Check middleware configuration
3. Review Vercel build logs for route generation

### Supabase Connection Errors

1. Verify environment variables are set correctly
2. Check Supabase project is active
3. Review RLS policies (may block requests)
4. Test connection from Supabase dashboard

### Admin Panel Not Loading

1. Verify user is authenticated
2. Check profile role is 'admin' or 'staff'
3. Review middleware.ts for correct redirect logic
4. Check browser console for errors

## Continuous Deployment

Vercel automatically deploys on:
- Push to main/master branch
- Pull request creation (preview deployments)
- Manual deployment trigger

### Preview Deployments

Every PR gets a preview URL:
- `your-project-abc123.vercel.app`
- Useful for testing before merging

### Production Branch

Default is `main` or `master`. Configure in:
- Project Settings > Git
- Production Branch: `main`

## Monitoring

### Vercel Analytics

1. Go to Project Settings > Analytics
2. Enable Vercel Analytics (optional, paid feature)
3. View performance metrics

### Logs

1. Go to Deployments tab
2. Click on a deployment
3. View "Functions" tab for serverless function logs
4. View "Build Logs" for build output

## Security

### Environment Variables

- Never commit `.env` files
- Use Vercel's environment variable management
- Rotate keys regularly
- Use different keys for preview vs production if needed

### Headers

Add security headers in `apps/web/next.config.ts`:

```typescript
async headers() {
  return [
    {
      source: '/:path*',
      headers: [
        {
          key: 'X-Frame-Options',
          value: 'DENY',
        },
        {
          key: 'X-Content-Type-Options',
          value: 'nosniff',
        },
        {
          key: 'Referrer-Policy',
          value: 'strict-origin-when-cross-origin',
        },
      ],
    },
  ];
},
```

## Performance

### Optimize Images

1. Use Next.js Image component (already implemented)
2. Configure Supabase Storage CDN
3. Consider Vercel Image Optimization (automatic)

### Caching

- Static pages are automatically cached
- API routes use Vercel's edge caching
- Consider ISR for product pages if needed

### Database Connection Pooling

- Supabase handles connection pooling automatically
- Monitor connection usage in Supabase dashboard
- Consider connection pooler for high traffic

## Backup & Rollback

### Rollback

1. Go to Deployments tab
2. Find previous deployment
3. Click "..." menu
4. Select "Promote to Production"

### Backup

- Code is in GitHub (backup there)
- Database is in Supabase (backup via Supabase dashboard)
- Environment variables: Export from Vercel (Settings > Environment Variables)




