import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { IntakeDetail } from '@/components/intake-detail'

interface IntakeDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function IntakeDetailPage(props: IntakeDetailPageProps) {
  const params = await props.params
  const supabase = await createClient()
  
  const { data: intake } = await supabase
    .from('coin_intakes')
    .select(`
      *,
      coin_media(*),
      attributions(*),
      valuations(*)
    `)
    .eq('id', params.id)
    .single()
  
  if (!intake) {
    notFound()
  }
  
  // Get price points
  const { data: pricePoints } = await supabase
    .from('price_points')
    .select('*, sources(name)')
    .eq('intake_id', params.id)
    .order('created_at', { ascending: false })
  
  // Get scrape jobs
  const { data: jobs } = await supabase
    .from('scrape_jobs')
    .select('*, sources(name)')
    .eq('intake_id', params.id)
    .order('created_at', { ascending: false })
  
  return (
    <IntakeDetail
      intake={intake}
      pricePoints={pricePoints || []}
      jobs={jobs || []}
    />
  )
}



