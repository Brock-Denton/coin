# Web Application

Next.js 14+ App Router application for the coin inventory and pricing system.

## Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Deployment**: Vercel

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Variables

Copy `env.example` to `.env.local`:

```bash
cp env.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Run Development Server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000)

## Project Structure

```
app/
  ├── (routes)/              # Public routes
  │   ├── page.tsx          # Home page
  │   ├── browse/           # Browse products
  │   └── product/[id]/     # Product detail
  ├── admin/                # Admin routes (protected)
  │   ├── layout.tsx        # Admin layout with auth
  │   ├── login/            # Login page
  │   ├── intakes/          # Intake management
  │   ├── sources/          # Source management
  │   └── orders/           # Order management
  ├── layout.tsx            # Root layout
  └── globals.css           # Global styles

components/
  ├── ui/                   # shadcn/ui components
  ├── nav.tsx               # Navigation component
  ├── intake-detail.tsx     # Intake detail form
  └── evidence-panel.tsx    # Pricing evidence display

lib/
  ├── supabase/             # Supabase clients
  │   ├── client.ts         # Browser client
  │   ├── server.ts         # Server client
  │   └── middleware.ts     # Middleware helper
  └── utils.ts              # Utility functions
```

## Features

### Public Pages

- **Home**: Latest products showcase
- **Browse**: Filterable product listing (denomination, year, price)
- **Product**: Product detail with images, attribution, pricing, evidence panel

### Admin Pages

- **Login**: Supabase Auth login
- **Intakes**: List and manage coin intakes
- **Intake Detail**: 
  - Upload obverse/reverse photos
  - Edit attribution fields
  - Run pricing jobs
  - View comps and valuations
  - Create product from intake
- **Sources**: Enable/disable sources, set reputation weights
- **Orders**: View customer orders (scaffold)

## Authentication

Uses Supabase Auth with middleware protection:

- `/admin/*` routes require authentication
- Only `admin` or `staff` roles can access
- Redirects to `/admin/login` if not authenticated

## Storage

Photos are stored in Supabase Storage:

- Bucket: `coin-media`
- Public read access
- Authenticated upload only

## Deployment

See [`docs/vercel-deploy.md`](../../docs/vercel-deploy.md) for Vercel deployment instructions.

## Development

### Adding New Pages

1. Create file in `app/` directory
2. Export default React component
3. Add link in navigation if needed

### Adding New Components

1. Create file in `components/` directory
2. Import from `@/components/component-name`

### Using Supabase

**Client-side** (use in 'use client' components):
```typescript
import { createClient } from '@/lib/supabase/client'
const supabase = createClient()
```

**Server-side** (use in Server Components):
```typescript
import { createClient } from '@/lib/supabase/server'
const supabase = await createClient()
```

### Styling

- Use Tailwind CSS classes
- Use shadcn/ui components from `components/ui/`
- Follow existing patterns for consistency

## Troubleshooting

### Build Errors

1. Check TypeScript errors: `npm run build`
2. Verify all imports are correct
3. Check environment variables are set

### Supabase Connection Issues

1. Verify `.env.local` has correct values
2. Check Supabase project is active
3. Review RLS policies (may block requests)

### Image Upload Not Working

1. Verify Supabase Storage bucket exists
2. Check bucket policies allow authenticated upload
3. Verify file size limits
4. Check browser console for errors

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
