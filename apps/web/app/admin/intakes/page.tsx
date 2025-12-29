import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { IntakesTable } from '@/components/intakes-table'

export default async function IntakesPage() {
  const supabase = await createClient()
  
  // Fetch intakes with related data for table display
  const { data: intakes } = await supabase
    .from('coin_intakes')
    .select(`
      *,
      attributions(
        year,
        denomination,
        mintmark,
        series,
        grade
      ),
      valuations(
        price_cents_median,
        confidence_score
      )
    `)
    .order('created_at', { ascending: false })
    .limit(100)
  
  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-4xl font-bold text-white">Coin Intakes</h1>
        <Link href="/admin/intakes/new">
          <Button>New Intake</Button>
        </Link>
      </div>
      
      <IntakesTable intakes={intakes || []} />
    </div>
  )
}



