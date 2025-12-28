// Database types (matching Supabase schema)

export interface Profile {
  id: string
  role: 'admin' | 'staff' | 'viewer'
  email: string | null
  full_name: string | null
  created_at: string
  updated_at: string
}

export interface CoinIntake {
  id: string
  intake_number: string
  status: 'pending' | 'attributed' | 'priced' | 'productized' | 'archived'
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface Attribution {
  id: string
  intake_id: string
  denomination: string | null
  year: number | null
  mintmark: string | null
  series: string | null
  variety: string | null
  grade: string | null
  title: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Product {
  id: string
  intake_id: string | null
  sku: string | null
  title: string
  description: string | null
  price_cents: number
  status: 'draft' | 'published' | 'sold' | 'archived'
  published_at: string | null
  created_at: string
  updated_at: string
}

export interface ProductImage {
  id: string
  product_id: string
  media_id: string | null
  image_url: string
  display_order: number
  is_primary: boolean
  created_at: string
}

export interface Valuation {
  id: string
  intake_id: string
  price_cents_p10: number | null
  price_cents_median: number | null
  price_cents_p90: number | null
  price_cents_mean: number | null
  confidence_score: number
  explanation: string | null
  comp_count: number
  comp_sources_count: number
  sold_count: number
  ask_count: number
  metadata: Record<string, any> | null
  computed_at: string
  created_at: string
  updated_at: string
}

export interface Source {
  id: string
  name: string
  adapter_type: 'ebay_api' | 'manual' | 'selenium'
  enabled: boolean
  reputation_weight: number
  tier: number
  api_key: string | null
  api_secret: string | null
  base_url: string | null
  rate_limit_per_minute: number
  config: Record<string, any> | null
  created_at: string
  updated_at: string
}

export interface PricePoint {
  id: string
  intake_id: string
  source_id: string
  job_id: string | null
  price_cents: number
  price_type: 'sold' | 'ask' | 'bid'
  raw_payload: Record<string, any> | null
  listing_url: string | null
  listing_title: string | null
  listing_date: string | null
  confidence_multiplier: number
  filtered_out: boolean
  created_at: string
}


