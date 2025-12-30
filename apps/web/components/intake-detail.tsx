'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { SearchQueries } from '@/components/search-queries'
import { JobStatus } from '@/components/job-status'
import { PricingReadyChecklist } from '@/components/pricing-ready-checklist'
import { PricingSummaryPanel } from '@/components/pricing-summary-panel'
import { GradeEstimatePanel } from '@/components/grade-estimate-panel'
import { GradingRecommendationsTable } from '@/components/grading-recommendations-table'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Trash2, RefreshCw, Sparkles } from 'lucide-react'

interface IntakeDetailProps {
  intake: any
  pricePoints: any[]
  jobs: any[]
  gradeEstimates?: any[]
  gradingRecommendations?: any[]
  gradingServices?: any[]
  shipPolicies?: any[]
}

export function IntakeDetail({ intake, pricePoints, jobs, gradeEstimates, gradingRecommendations, gradingServices = [], shipPolicies = [] }: IntakeDetailProps) {
  const [loading, setLoading] = useState(false)
  // Initialize attribution with keywords as strings for UI
  const initialAttribution = intake.attributions?.[0] || {}
  const [attribution, setAttribution] = useState({
    ...initialAttribution,
    keywords_include_string: initialAttribution.keywords_include 
      ? (Array.isArray(initialAttribution.keywords_include) 
          ? initialAttribution.keywords_include.join(', ') 
          : initialAttribution.keywords_include)
      : '',
    keywords_exclude_string: initialAttribution.keywords_exclude
      ? (Array.isArray(initialAttribution.keywords_exclude)
          ? initialAttribution.keywords_exclude.join(', ')
          : initialAttribution.keywords_exclude)
      : '',
  })
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [pricingMode, setPricingMode] = useState<'ebay_only' | 'all_sources'>('ebay_only')
  const [pricingMessage, setPricingMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [gradingMessage, setGradingMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [gradingLoading, setGradingLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()
  
  // Get latest grade estimate and recommendations
  const latestGradeEstimate = (gradeEstimates && gradeEstimates.length > 0) 
    ? gradeEstimates[0] 
    : (intake.grade_estimates && intake.grade_estimates.length > 0) 
      ? intake.grade_estimates[0] 
      : null
  const gradingRecs = (gradingRecommendations && gradingRecommendations.length > 0)
    ? gradingRecommendations
    : (intake.grading_recommendations && intake.grading_recommendations.length > 0)
      ? intake.grading_recommendations
      : []
  
  const handleRunPricing = async () => {
    setLoading(true)
    setPricingMessage(null)
    console.log('[handleRunPricing] Starting pricing job enqueue', {
      intakeId: intake.id,
      pricingMode,
      activeJobsCount: jobs.filter((j: any) => j.status === 'pending' || j.status === 'running').length
    })
    
    try {
      // Check for existing active jobs (pending/running)
      const activeJobs = jobs.filter((j: any) => j.status === 'pending' || j.status === 'running')
      if (activeJobs.length > 0) {
        console.log('[handleRunPricing] Active jobs exist, blocking', { activeJobsCount: activeJobs.length })
        setPricingMessage({ type: 'error', text: `Cannot queue: ${activeJobs.length} active job(s) already exist. Use "Re-run Pricing" after they complete.` })
        setLoading(false)
        return
      }

      let sourceIds: string[] = []

      if (pricingMode === 'ebay_only') {
        console.log('[handleRunPricing] Fetching eBay sources')
        // Get eBay source
        const { data: ebaySources, error: ebayError } = await supabase
          .from('sources')
          .select('id')
          .eq('enabled', true)
          .eq('adapter_type', 'ebay_api')
          .limit(1)
        
        console.log('[handleRunPricing] eBay sources query result', { ebaySources, ebayError })
        
        if (ebayError) {
          console.error('[handleRunPricing] Error fetching eBay sources', ebayError)
          throw ebayError
        }
        
        if (!ebaySources || ebaySources.length === 0) {
          console.warn('[handleRunPricing] No enabled eBay source found')
          setPricingMessage({ type: 'error', text: 'No enabled eBay source found' })
          setLoading(false)
          return
        }
        
        sourceIds = ebaySources.map((s: any) => s.id)
        console.log('[handleRunPricing] eBay source IDs', { sourceIds })
      } else {
        console.log('[handleRunPricing] Fetching all enabled sources')
        // Get all enabled sources in stable order
        const { data: allSources, error: allError } = await supabase
          .from('sources')
          .select('id')
          .eq('enabled', true)
          .order('name', { ascending: true })
        
        console.log('[handleRunPricing] All sources query result', { allSources, allError })
        
        if (allError) {
          console.error('[handleRunPricing] Error fetching all sources', allError)
          throw allError
        }
        
        if (!allSources || allSources.length === 0) {
          console.warn('[handleRunPricing] No enabled sources found')
          setPricingMessage({ type: 'error', text: 'No enabled sources found' })
          setLoading(false)
          return
        }
        
        sourceIds = allSources.map((s: any) => s.id)
        console.log('[handleRunPricing] All source IDs', { sourceIds })
      }

      console.log('[handleRunPricing] Calling enqueue_jobs RPC', {
        p_intake_id: intake.id,
        p_source_ids: sourceIds,
        p_base_delay_seconds: 0,
        p_stagger_seconds: 2
      })

      // Call enqueue_jobs RPC
      const { data, error } = await supabase.rpc('enqueue_jobs', {
        p_intake_id: intake.id,
        p_source_ids: sourceIds,
        p_base_delay_seconds: 0,
        p_stagger_seconds: 2
      })

      console.log('[handleRunPricing] enqueue_jobs RPC result', { data, error })

      if (error) {
        console.error('[handleRunPricing] RPC error details', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        setPricingMessage({ type: 'error', text: `Error: ${error.message}` })
      } else {
        const createdCount = data || 0
        console.log('[handleRunPricing] Jobs created', { createdCount })
        if (createdCount === 0) {
          setPricingMessage({ type: 'error', text: 'No jobs created. Pending jobs may already exist for these sources.' })
        } else {
          setPricingMessage({ type: 'success', text: `Successfully queued ${createdCount} pricing job(s)` })
          router.refresh()
        }
      }
    } catch (err: any) {
      setPricingMessage({ type: 'error', text: `Error: ${err.message}` })
    } finally {
      setLoading(false)
    }
  }

  const handleRerunPricing = async () => {
    setLoading(true)
    setPricingMessage(null)
    try {
      // Check for existing active jobs (pending/running)
      const activeJobs = jobs.filter((j: any) => j.status === 'pending' || j.status === 'running')
      if (activeJobs.length > 0) {
        setPricingMessage({ type: 'error', text: `Cannot re-run: ${activeJobs.length} active job(s) already exist. Wait for them to complete.` })
        setLoading(false)
        return
      }

      // Check if latest jobs are terminal (succeeded/failed)
      const latestJobs = jobs.sort((a: any, b: any) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
      
      if (latestJobs.length === 0) {
        // No previous jobs, treat as first run
        await handleRunPricing()
        return
      }

      // Get source IDs based on mode (same as handleRunPricing)
      let sourceIds: string[] = []

      if (pricingMode === 'ebay_only') {
        const { data: ebaySources, error: ebayError } = await supabase
          .from('sources')
          .select('id')
          .eq('enabled', true)
          .eq('adapter_type', 'ebay_api')
          .limit(1)
        
        if (ebayError) throw ebayError
        if (!ebaySources || ebaySources.length === 0) {
          setPricingMessage({ type: 'error', text: 'No enabled eBay source found' })
          setLoading(false)
          return
        }
        sourceIds = ebaySources.map((s: any) => s.id)
      } else {
        const { data: allSources, error: allError } = await supabase
          .from('sources')
          .select('id')
          .eq('enabled', true)
          .order('name', { ascending: true })
        
        if (allError) throw allError
        if (!allSources || allSources.length === 0) {
          setPricingMessage({ type: 'error', text: 'No enabled sources found' })
          setLoading(false)
          return
        }
        sourceIds = allSources.map((s: any) => s.id)
      }

      // Call enqueue_jobs RPC (will automatically handle duplicates via unique index)
      console.log('[handleRerunPricing] Calling enqueue_jobs RPC', {
        p_intake_id: intake.id,
        p_source_ids: sourceIds,
        p_base_delay_seconds: 0,
        p_stagger_seconds: 2
      })

      // Call enqueue_jobs RPC (will automatically handle duplicates via unique index)
      const { data, error } = await supabase.rpc('enqueue_jobs', {
        p_intake_id: intake.id,
        p_source_ids: sourceIds,
        p_base_delay_seconds: 0,
        p_stagger_seconds: 2
      })

      console.log('[handleRerunPricing] enqueue_jobs RPC result', { data, error })

      if (error) {
        console.error('[handleRerunPricing] RPC error details', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        setPricingMessage({ type: 'error', text: `Error: ${error.message}` })
      } else {
        const createdCount = data || 0
        console.log('[handleRerunPricing] Jobs created', { createdCount })
        if (createdCount === 0) {
          setPricingMessage({ type: 'error', text: 'No jobs created. Pending jobs may already exist.' })
        } else {
          setPricingMessage({ type: 'success', text: `Successfully queued ${createdCount} pricing job(s)` })
          router.refresh()
        }
      }
    } catch (err: any) {
      setPricingMessage({ type: 'error', text: `Error: ${err.message}` })
    } finally {
      setLoading(false)
    }
  }
  
  const handleRunGrading = async () => {
    setGradingLoading(true)
    setGradingMessage(null)
    try {
      // Check for existing active grading jobs
      const gradingJobs = jobs.filter((j: any) => j.job_type === 'grading')
      const activeGradingJobs = gradingJobs.filter((j: any) => j.status === 'pending' || j.status === 'running')
      
      if (activeGradingJobs.length > 0) {
        setGradingMessage({ type: 'error', text: `Cannot queue: ${activeGradingJobs.length} active grading job(s) already exist. Wait for them to complete.` })
        setGradingLoading(false)
        return
      }
      
      // Call enqueue_grading_job RPC
      const { data, error } = await supabase.rpc('enqueue_grading_job', {
        p_intake_id: intake.id
      })
      
      if (error) {
        setGradingMessage({ type: 'error', text: `Error: ${error.message}` })
      } else {
        const createdCount = data || 0
        if (createdCount === 0) {
          setGradingMessage({ type: 'error', text: 'No job created. A pending grading job may already exist.' })
        } else {
          setGradingMessage({ type: 'success', text: 'Successfully queued grading job' })
          router.refresh()
        }
      }
    } catch (err: any) {
      setGradingMessage({ type: 'error', text: `Error: ${err.message}` })
    } finally {
      setGradingLoading(false)
    }
  }
  
  const handleDeleteIntake = async () => {
    setDeleting(true)
    try {
      // Check for linked products first (helpful UX feedback)
      const { data: linkedProducts } = await supabase
        .from('products')
        .select('id, title, status')
        .eq('intake_id', intake.id)
        .limit(1)
      
      if (linkedProducts && linkedProducts.length > 0) {
        const product = linkedProducts[0]
        const confirmMessage = `This intake has a linked product "${product.title}" (${product.status}). The product will be unlinked (intake_id set to NULL) but will remain in the database. Continue?`
        if (!confirm(confirmMessage)) {
          setDeleting(false)
          return
        }
      }
      
      // Delete the intake (Supabase handles its own timeouts)
      const { error } = await supabase
        .from('coin_intakes')
        .delete()
        .eq('id', intake.id)
      
      if (error) {
        // Provide more specific error messages
        if (error.code === '23503') {
          throw new Error('Cannot delete intake: it is still referenced by other records. Please remove all references first.')
        }
        throw error
      }
      
      // Success - close dialog and redirect
      setDeleteDialogOpen(false)
      router.push('/admin/intakes')
      router.refresh()
    } catch (err: any) {
      const errorMessage = err.message || 'An unexpected error occurred while deleting the intake'
      alert(`Error deleting intake: ${errorMessage}`)
      setDeleting(false)
    }
  }

  // Normalize keywords from comma-separated string to array
  const normalizeKeywords = (keywordsString: string): string[] => {
    if (!keywordsString || keywordsString.trim() === '') return []
    return keywordsString
      .split(',')
      .map(k => k.trim().toLowerCase())
      .filter(k => k.length > 0)
  }

  // Convert keywords array to comma-separated string for display
  const keywordsToString = (keywordsArray: string[] | null | undefined): string => {
    if (!keywordsArray || !Array.isArray(keywordsArray)) return ''
    return keywordsArray.join(', ')
  }

  const handleSaveAttribution = async () => {
    setLoading(true)
    try {
      // Normalize keywords from comma-separated strings to arrays
      const keywordsIncludeArray = normalizeKeywords(attribution.keywords_include_string || '')
      const keywordsExcludeArray = normalizeKeywords(attribution.keywords_exclude_string || '')

      // Helper function to convert empty strings to null
      const nullIfEmpty = (value: any): any => {
        if (value === '' || value === undefined) return null
        return value
      }

      // Helper function to ensure year is a number or null
      const normalizeYear = (year: any): number | null => {
        if (!year && year !== 0) return null
        const num = Number(year)
        return isNaN(num) ? null : num
      }

      const attributionData: any = {
        intake_id: intake.id,
        year: normalizeYear(attribution.year),
        mintmark: nullIfEmpty(attribution.mintmark),
        denomination: nullIfEmpty(attribution.denomination),
        series: nullIfEmpty(attribution.series),
        variety: nullIfEmpty(attribution.variety),
        grade: nullIfEmpty(attribution.grade),
        title: nullIfEmpty(attribution.title),
        notes: nullIfEmpty(attribution.notes),
        keywords_include: keywordsIncludeArray,
        keywords_exclude: keywordsExcludeArray,
      }

      if (attribution.id) {
        // Update
        const { error } = await supabase
          .from('attributions')
          .update(attributionData)
          .eq('id', attribution.id)
        
        if (error) throw error
      } else {
        // Create
        const { error } = await supabase
          .from('attributions')
          .insert(attributionData)
        
        if (error) throw error
      }
      
      // Update local state to reflect saved keywords as strings
      setAttribution({
        ...attribution,
        keywords_include_string: keywordsIncludeArray.join(', '),
        keywords_exclude_string: keywordsExcludeArray.join(', '),
      })
      
      alert('Attribution saved successfully')
      router.refresh()
    } catch (err: any) {
      alert(`Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }
  
  const getImageUrl = (storagePath: string) => {
    const { data } = supabase.storage
      .from('coin-media')
      .getPublicUrl(storagePath)
    return data.publicUrl
  }
  
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, mediaType: string) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    setLoading(true)
    try {
      // Upload to Supabase Storage
      const fileExt = file.name.split('.').pop()
      const fileName = `${intake.id}/${mediaType}-${Date.now()}.${fileExt}`
      const filePath = fileName
      
      const { error: uploadError } = await supabase.storage
        .from('coin-media')
        .upload(filePath, file)
      
      if (uploadError) throw uploadError
      
      // Create media record (storage_path is the path in the bucket)
      const { error: insertError } = await supabase
        .from('coin_media')
        .insert({
          intake_id: intake.id,
          kind: mediaType,
          media_type: 'photo',
          capture_type: 'phone',
          storage_path: filePath,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type,
        })
      
      if (insertError) throw insertError
      
      alert('File uploaded successfully')
      router.refresh()
    } catch (err: any) {
      alert(`Error uploading file: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }
  
  const valuation = intake.valuations?.[0]
  const images = intake.coin_media || []
  const obverseImage = images.find((img: any) => img.kind === 'obverse' || img.media_type === 'obverse')
  const reverseImage = images.find((img: any) => img.kind === 'reverse' || img.media_type === 'reverse')
  
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold mb-2">{intake.intake_number}</h1>
          <Badge>{intake.status}</Badge>
        </div>
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="destructive" size="sm">
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Intake
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Intake</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete intake <strong>{intake.intake_number}</strong>? 
                This will permanently delete the intake and all associated data including:
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>Photos and media</li>
                  <li>Attribution data</li>
                  <li>Price points and valuations</li>
                  <li>Scrape jobs and logs</li>
                  <li>Manual search results</li>
                </ul>
                <strong className="block mt-3 text-destructive">This action cannot be undone.</strong>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeleteDialogOpen(false)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteIntake}
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Delete Intake'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      
      {/* Pricing Ready Checklist */}
      <PricingReadyChecklist 
        intake={{
          ...intake,
          attributions: attribution ? [{
            ...attribution,
            year: attribution.year ? Number(attribution.year) : null,
            denomination: attribution.denomination || null,
            series: attribution.series || null,
            title: attribution.title || null,
          }] : intake.attributions
        }}
      />
      
      {/* Pricing Summary Panel */}
      <PricingSummaryPanel valuation={intake.valuations?.[0]} pricePoints={pricePoints} />
      
      {/* AI Pre-Grade Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                AI Pre-Grade
              </CardTitle>
              <CardDescription>Analyze coin images to estimate grade distribution and ROI for grading submission</CardDescription>
            </div>
            <Button onClick={handleRunGrading} disabled={gradingLoading}>
              {gradingLoading ? 'Queuing...' : 'Run AI Pre-Grade'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Grading Message */}
          {gradingMessage && (
            <div className={`p-3 rounded-lg ${gradingMessage.type === 'success' ? 'bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 text-green-900 dark:text-green-100' : 'bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-900 dark:text-red-100'}`}>
              {gradingMessage.text}
            </div>
          )}
          
          {/* Grading Job Status */}
          <JobStatus 
            intakeId={intake.id} 
            jobs={jobs} 
            onRefresh={() => router.refresh()} 
            jobType="grading"
          />
          
          {/* Grade Estimate Panel */}
          {latestGradeEstimate && (
            <GradeEstimatePanel gradeEstimate={latestGradeEstimate} />
          )}
        </CardContent>
      </Card>
      
      {/* Grading Recommendations */}
      {gradingRecs.length > 0 && (
        <GradingRecommendationsTable 
          recommendations={gradingRecs}
          services={gradingServices}
          shipPolicies={shipPolicies}
        />
      )}
      
      {/* Images */}
      <Card>
        <CardHeader>
          <CardTitle>Images</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div>
            <Label>Front</Label>
            {obverseImage ? (
              <div className="mt-2 aspect-square relative bg-muted rounded overflow-hidden">
                <img
                  src={getImageUrl(obverseImage.storage_path)}
                  alt="Front"
                  className="object-cover w-full h-full"
                />
              </div>
            ) : (
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => handleFileUpload(e, 'obverse')}
                disabled={loading}
                className="mt-2"
              />
            )}
          </div>
          <div>
            <Label>Back</Label>
            {reverseImage ? (
              <div className="mt-2 aspect-square relative bg-muted rounded overflow-hidden">
                <img
                  src={getImageUrl(reverseImage.storage_path)}
                  alt="Back"
                  className="object-cover w-full h-full"
                />
              </div>
            ) : (
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => handleFileUpload(e, 'reverse')}
                disabled={loading}
                className="mt-2"
              />
            )}
          </div>
        </CardContent>
      </Card>
      
      {/* Attribution */}
      <Card>
        <CardHeader>
          <CardTitle>Attribution</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className={attribution.denomination ? 'text-green-500' : 'text-red-500'}>
                Denomination (required)
              </Label>
              <Select
                value={attribution.denomination || ''}
                onValueChange={(value) => setAttribution({ ...attribution, denomination: value })}
              >
                <SelectTrigger className={attribution.denomination ? 'border-green-500 focus:ring-green-500' : 'border-red-500 focus:ring-red-500'}>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="penny">Penny</SelectItem>
                  <SelectItem value="nickel">Nickel</SelectItem>
                  <SelectItem value="dime">Dime</SelectItem>
                  <SelectItem value="quarter">Quarter</SelectItem>
                  <SelectItem value="half_dollar">Half Dollar</SelectItem>
                  <SelectItem value="dollar">Dollar</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                The coin's face value (penny = 1 cent, nickel = 5 cents, dime = 10 cents, etc.)
              </p>
            </div>
            <div>
              <Label className={attribution.year ? 'text-green-500' : 'text-red-500'}>
                Year (required)
              </Label>
              <Input
                type="number"
                value={attribution.year || ''}
                onChange={(e) => setAttribution({ ...attribution, year: parseInt(e.target.value) || null })}
                className={attribution.year ? 'border-green-500 focus:ring-green-500' : 'border-red-500 focus:ring-red-500'}
              />
              <p className="text-xs text-muted-foreground mt-1">
                The year the coin was minted (usually found on the front of the coin)
              </p>
            </div>
            <div>
              <Label>Mintmark</Label>
              <Input
                value={attribution.mintmark || ''}
                onChange={(e) => setAttribution({ ...attribution, mintmark: e.target.value })}
                placeholder="e.g., P, D, S, W, CC"
              />
              <p className="text-xs text-muted-foreground mt-1">
                The letter indicating where the coin was minted (P = Philadelphia, D = Denver, S = San Francisco, W = West Point, CC = Carson City). Leave blank if no mintmark.
              </p>
            </div>
            <div>
              <Label>Series</Label>
              <Input
                value={attribution.series || ''}
                onChange={(e) => setAttribution({ ...attribution, series: e.target.value })}
                placeholder="e.g., Morgan Dollar, Peace Dollar, Washington Quarter"
              />
              <p className="text-xs text-muted-foreground mt-1">
                The coin's design series or type (helps identify specific coin designs)
              </p>
            </div>
            <div>
              <Label>Grade</Label>
              <Input
                value={attribution.grade || ''}
                onChange={(e) => setAttribution({ ...attribution, grade: e.target.value })}
                placeholder="e.g., MS65, AU, VF"
              />
              <p className="text-xs text-muted-foreground mt-1">
                The coin's condition rating. Common grades: MS (Mint State, e.g., MS60, MS65, MS70), AU (About Uncirculated), XF/EF (Extremely Fine), VF (Very Fine)
              </p>
            </div>
          </div>
          <div>
            <Label className={(attribution.title || attribution.series) ? 'text-green-500' : 'text-red-500'}>
              Title/Keywords (required if Series is empty)
            </Label>
            <Input
              value={attribution.title || ''}
              onChange={(e) => setAttribution({ ...attribution, title: e.target.value })}
              placeholder="US coin keywords for search"
              className={(attribution.title || attribution.series) ? 'border-green-500 focus:ring-green-500' : 'border-red-500 focus:ring-red-500'}
            />
          </div>
          <div>
            <Label>Keywords Include (comma-separated)</Label>
            <Input
              value={attribution.keywords_include_string || ''}
              onChange={(e) => setAttribution({ ...attribution, keywords_include_string: e.target.value })}
              placeholder="e.g., uncirculated, mint state, ms65"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Keywords to include in search queries (will be normalized: trimmed, lowercased)
            </p>
          </div>
          <div>
            <Label>Keywords Exclude (comma-separated)</Label>
            <Input
              value={attribution.keywords_exclude_string || ''}
              onChange={(e) => setAttribution({ ...attribution, keywords_exclude_string: e.target.value })}
              placeholder="e.g., damaged, cleaned, scratch"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Keywords to exclude from search results (will be normalized: trimmed, lowercased)
            </p>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea
              value={attribution.notes || ''}
              onChange={(e) => setAttribution({ ...attribution, notes: e.target.value })}
            />
          </div>
          <Button onClick={handleSaveAttribution} disabled={loading}>
            Save Attribution
          </Button>
        </CardContent>
      </Card>
      
      {/* Search Queries (Optional) */}
      <SearchQueries attribution={attribution} />
      
      {/* Pricing */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Pricing Jobs</CardTitle>
              <CardDescription>Run pricing jobs and view results</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={pricingMode} onValueChange={(value: 'ebay_only' | 'all_sources') => setPricingMode(value)}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ebay_only">eBay Only</SelectItem>
                  <SelectItem value="all_sources">All Enabled Sources</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleRunPricing} disabled={loading}>
                Run Pricing
              </Button>
              <Button onClick={handleRerunPricing} disabled={loading} variant="outline">
                <RefreshCw className="h-4 w-4 mr-2" />
                Re-run Pricing
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Pricing Message */}
          {pricingMessage && (
            <div className={`p-3 rounded-lg ${pricingMessage.type === 'success' ? 'bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 text-green-900 dark:text-green-100' : 'bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-900 dark:text-red-100'}`}>
              {pricingMessage.text}
            </div>
          )}
          
          {/* Job Status */}
          <JobStatus intakeId={intake.id} jobs={jobs} pricePoints={pricePoints} onRefresh={() => router.refresh()} />
          
          <div>
            <h3 className="font-semibold mb-2">Price Points ({pricePoints.length})</h3>
            {pricePoints.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border rounded-lg">
                <p>No price points collected yet. Run pricing jobs to collect data.</p>
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Source</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Listing</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pricePoints.map((pp: any) => (
                      <TableRow key={pp.id}>
                        <TableCell>{pp.sources?.name || 'Unknown'}</TableCell>
                        <TableCell>${(pp.price_cents / 100).toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge variant={pp.price_type === 'sold' ? 'default' : 'secondary'}>
                            {pp.price_type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {pp.listing_date ? new Date(pp.listing_date).toLocaleDateString() : 'N/A'}
                        </TableCell>
                        <TableCell>
                          {pp.listing_url && (
                            <a href={pp.listing_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                              View
                            </a>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

