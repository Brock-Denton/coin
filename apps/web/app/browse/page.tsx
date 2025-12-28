import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Nav } from '@/components/nav'
import Link from 'next/link'
import { Suspense } from 'react'

interface BrowsePageProps {
  searchParams: Promise<{
    denomination?: string
    year_min?: string
    year_max?: string
    price_min?: string
    price_max?: string
  }>
}

async function BrowseResults({ searchParams }: BrowsePageProps) {
  const params = await searchParams
  const supabase = await createClient()
  
  try {
    let query = supabase
      .from('products')
      .select(`
        *,
        product_images(image_url, is_primary)
      `)
      .eq('status', 'published')
    
    // Apply filters
    if (params.denomination) {
      query = query.eq('intake_id', params.denomination) // This would need a join to attributions in real implementation
    }
    
    if (params.price_min) {
      const priceMin = parseInt(params.price_min)
      if (!isNaN(priceMin)) {
        query = query.gte('price_cents', priceMin * 100)
      }
    }
    
    if (params.price_max) {
      const priceMax = parseInt(params.price_max)
      if (!isNaN(priceMax)) {
        query = query.lte('price_cents', priceMax * 100)
      }
    }
    
    const { data: products, error } = await query.order('created_at', { ascending: false })
    
    if (error) {
      console.error('Error fetching products:', error)
      return (
        <p className="text-muted-foreground col-span-full">Error loading products. Please try again later.</p>
      )
    }
    
    const productList = products || []
  
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {productList && productList.length > 0 ? (
        productList.map((product: any) => {
          const primaryImage = product.product_images?.find((img: any) => img.is_primary) || product.product_images?.[0]
          return (
            <Card key={product.id} className="overflow-hidden">
              {primaryImage && (
                <div className="aspect-square relative bg-muted">
                  <img
                    src={primaryImage.image_url}
                    alt={product.title}
                    className="object-cover w-full h-full"
                  />
                </div>
              )}
              <CardHeader>
                <CardTitle>{product.title}</CardTitle>
                <CardDescription>
                  ${(product.price_cents / 100).toFixed(2)}
                </CardDescription>
              </CardHeader>
              <CardFooter>
                <Link href={`/product/${product.id}`} className="w-full">
                  <Button className="w-full">View Details</Button>
                </Link>
              </CardFooter>
            </Card>
          )
        })
        ) : (
          <p className="text-muted-foreground col-span-full">No products match your filters.</p>
        )}
      </div>
    )
  } catch (error) {
    console.error('Error in BrowseResults:', error)
    return (
      <p className="text-muted-foreground col-span-full">Error loading products. Please try again later.</p>
    )
  }
}

export default async function BrowsePage(props: BrowsePageProps) {
  return (
    <div className="min-h-screen">
      <Nav />
      <main className="container mx-auto px-4 py-8">
        <h1 className="text-4xl font-bold mb-8">Browse Coins</h1>
        
        <div className="mb-8">
          <form className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label htmlFor="denomination">Denomination</Label>
              <Select name="denomination" defaultValue="">
                <SelectTrigger id="denomination">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All</SelectItem>
                  <SelectItem value="penny">Penny</SelectItem>
                  <SelectItem value="nickel">Nickel</SelectItem>
                  <SelectItem value="dime">Dime</SelectItem>
                  <SelectItem value="quarter">Quarter</SelectItem>
                  <SelectItem value="half_dollar">Half Dollar</SelectItem>
                  <SelectItem value="dollar">Dollar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="year_min">Year Min</Label>
              <Input id="year_min" name="year_min" type="number" placeholder="1800" />
            </div>
            
            <div>
              <Label htmlFor="year_max">Year Max</Label>
              <Input id="year_max" name="year_max" type="number" placeholder="2024" />
            </div>
            
            <div>
              <Label htmlFor="price_min">Price Min ($)</Label>
              <Input id="price_min" name="price_min" type="number" placeholder="0" />
            </div>
            
            <div>
              <Label htmlFor="price_max">Price Max ($)</Label>
              <Input id="price_max" name="price_max" type="number" placeholder="10000" />
            </div>
            
            <div className="md:col-span-4">
              <Button type="submit">Apply Filters</Button>
            </div>
          </form>
        </div>
        
        <Suspense fallback={<div>Loading...</div>}>
          <BrowseResults {...props} />
        </Suspense>
      </main>
    </div>
  )
}

