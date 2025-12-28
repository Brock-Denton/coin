import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Nav } from '@/components/nav'
import { notFound } from 'next/navigation'
import { EvidencePanel } from '@/components/evidence-panel'

interface ProductPageProps {
  params: Promise<{ id: string }>
}

export default async function ProductPage(props: ProductPageProps) {
  const params = await props.params
  const supabase = await createClient()
  
  // Get product with images
  const { data: product } = await supabase
    .from('products')
    .select(`
      *,
      product_images(image_url, is_primary, display_order)
    `)
    .eq('id', params.id)
    .eq('status', 'published')
    .single()
  
  // Get intake, attribution, and valuation separately if intake_id exists
  let intake = null
  let attribution = null
  let valuation = null
  
  if (product?.intake_id) {
    const { data: intakeData } = await supabase
      .from('coin_intakes')
      .select('id')
      .eq('id', product.intake_id)
      .single()
    
    if (intakeData) {
      intake = intakeData
      
      const { data: attrData } = await supabase
        .from('attributions')
        .select('*')
        .eq('intake_id', intake.id)
        .single()
      
      if (attrData) attribution = attrData
      
      const { data: valData } = await supabase
        .from('valuations')
        .select('*')
        .eq('intake_id', intake.id)
        .single()
      
      if (valData) valuation = valData
    }
  }
  
  if (!product) {
    notFound()
  }
  
  const images = product.product_images?.sort((a: any, b: any) => a.display_order - b.display_order) || []
  const primaryImage = images.find((img: any) => img.is_primary) || images[0]
  
  return (
    <div className="min-h-screen">
      <Nav />
      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Images */}
          <div>
            {primaryImage && (
              <div className="aspect-square relative bg-muted rounded-lg overflow-hidden mb-4">
                <img
                  src={primaryImage.image_url}
                  alt={product.title}
                  className="object-cover w-full h-full"
                />
              </div>
            )}
            {images.length > 1 && (
              <div className="grid grid-cols-4 gap-2">
                {images.map((img: any, idx: number) => (
                  <div key={idx} className="aspect-square relative bg-muted rounded overflow-hidden">
                    <img
                      src={img.image_url}
                      alt={`${product.title} ${idx + 1}`}
                      className="object-cover w-full h-full"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {/* Details */}
          <div>
            <h1 className="text-4xl font-bold mb-4">{product.title}</h1>
            
            {attribution && (
              <div className="mb-4 space-y-2">
                {attribution.year && <Badge>Year: {attribution.year}</Badge>}
                {attribution.mintmark && <Badge>Mint: {attribution.mintmark}</Badge>}
                {attribution.denomination && <Badge>{attribution.denomination}</Badge>}
                {attribution.grade && <Badge>Grade: {attribution.grade}</Badge>}
              </div>
            )}
            
            <div className="mb-6">
              <div className="text-4xl font-bold mb-2">
                ${(product.price_cents / 100).toFixed(2)}
              </div>
              {valuation && (
                <div className="text-sm text-muted-foreground">
                  Confidence: {valuation.confidence_score}/10
                </div>
              )}
            </div>
            
            {product.description && (
              <div className="mb-6">
                <h2 className="text-xl font-semibold mb-2">Description</h2>
                <p className="text-muted-foreground">{product.description}</p>
              </div>
            )}
            
            {attribution?.notes && (
              <div className="mb-6">
                <h2 className="text-xl font-semibold mb-2">Notes</h2>
                <p className="text-muted-foreground">{attribution.notes}</p>
              </div>
            )}
            
            <Button size="lg" className="w-full mb-4">Add to Cart</Button>
            
            {/* Evidence Panel */}
            {valuation && <EvidencePanel valuation={valuation} intakeId={intake?.id || product.intake_id} />}
          </div>
        </div>
      </main>
    </div>
  )
}

