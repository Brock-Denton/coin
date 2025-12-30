import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
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
      valuations(*),
      grade_estimates(*),
      grading_recommendations(*)
    `)
    .eq('id', params.id)
    .single()
  
  if (!intake) {
    redirect('/admin/intakes')
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
  
  // Get grading services and ship policies for recommendations table
  const { data: gradingServices } = await supabase
    .from('grading_services')
    .select('*')
    .eq('enabled', true)
    .order('name', { ascending: true })
  
  const { data: shipPolicies } = await supabase
    .from('grading_ship_policies')
    .select('*')
    .order('name', { ascending: true })
  
  return (
    <IntakeDetail
      intake={intake}
      pricePoints={pricePoints || []}
      jobs={jobs || []}
      gradeEstimates={intake.grade_estimates}
      gradingRecommendations={intake.grading_recommendations}
      gradingServices={gradingServices || []}
      shipPolicies={shipPolicies || []}
    />
  )
}




