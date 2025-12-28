import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Nav } from '@/components/nav'

export default async function HomePage() {
  const supabase = await createClient()
  
  // Get latest published products
  let products = []
  try {
    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        product_images(image_url, is_primary)
      `)
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(12)
    
    if (error) {
      console.error('Error fetching products:', error)
    } else {
      products = data || []
    }
  } catch (error) {
    console.error('Error in HomePage:', error)
  }

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-4">US Coin Inventory & Pricing</h1>
          <p className="text-lg text-muted-foreground">
            Authenticated US coins with transparent, data-driven pricing
          </p>
        </div>

        <div className="mb-8">
          <Link href="/browse">
            <Button size="lg">Browse All Coins</Button>
          </Link>
        </div>

        <div>
          <h2 className="text-2xl font-semibold mb-4">Latest Additions</h2>
          {products && products.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {products.map((product: any) => {
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
              })}
            </div>
          ) : (
            <p className="text-muted-foreground">No products available yet.</p>
          )}
        </div>
      </main>
    </div>
  )
}
