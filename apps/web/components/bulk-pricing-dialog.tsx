'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2 } from 'lucide-react'

interface BulkPricingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  intakeIds: string[]
  onSuccess: () => void
}

interface Source {
  id: string
  name: string
  enabled: boolean
}

export function BulkPricingDialog({
  open,
  onOpenChange,
  intakeIds,
  onSuccess,
}: BulkPricingDialogProps) {
  const [sources, setSources] = useState<Source[]>([])
  const [selectedSourceIds, setSelectedSourceIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [fetchingSources, setFetchingSources] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  // Fetch enabled sources when dialog opens
  useEffect(() => {
    if (open) {
      fetchSources()
    }
  }, [open])

  const fetchSources = async () => {
    setFetchingSources(true)
    setError(null)
    try {
      const { data, error: fetchError } = await supabase
        .from('sources')
        .select('id, name, enabled')
        .eq('enabled', true)
        .order('name')

      if (fetchError) throw fetchError

      setSources(data || [])
      // Pre-select all enabled sources
      if (data && data.length > 0) {
        setSelectedSourceIds(new Set(data.map(s => s.id)))
      }
    } catch (err: any) {
      setError(`Failed to load sources: ${err.message}`)
    } finally {
      setFetchingSources(false)
    }
  }

  const toggleSource = (sourceId: string) => {
    const newSelected = new Set(selectedSourceIds)
    if (newSelected.has(sourceId)) {
      newSelected.delete(sourceId)
    } else {
      newSelected.add(sourceId)
    }
    setSelectedSourceIds(newSelected)
  }

  const toggleSelectAll = () => {
    if (selectedSourceIds.size === sources.length) {
      setSelectedSourceIds(new Set())
    } else {
      setSelectedSourceIds(new Set(sources.map(s => s.id)))
    }
  }

  const handleRunPricing = async () => {
    if (selectedSourceIds.size === 0) {
      setError('Please select at least one source')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Fetch attributions for all selected intakes
      const { data: attributions, error: attrError } = await supabase
        .from('attributions')
        .select('*')
        .in('intake_id', intakeIds)

      if (attrError) throw attrError

      // Create a map of intake_id -> attribution
      const attributionMap = new Map(
        (attributions || []).map(attr => [attr.intake_id, attr])
      )

      // Create scrape jobs: intake × source combinations
      const jobs = []
      for (const intakeId of intakeIds) {
        const attribution = attributionMap.get(intakeId)
        
        // Only create jobs if attribution exists
        if (attribution) {
          for (const sourceId of selectedSourceIds) {
            jobs.push({
              intake_id: intakeId,
              source_id: sourceId,
              status: 'pending',
              query_params: {
                year: attribution.year,
                mintmark: attribution.mintmark,
                denomination: attribution.denomination,
                series: attribution.series,
                title: attribution.title,
              },
            })
          }
        }
      }

      if (jobs.length === 0) {
        setError('No attributions found for selected intakes. Please ensure all intakes have attribution data.')
        setLoading(false)
        return
      }

      // Insert all jobs
      const { error: insertError } = await supabase
        .from('scrape_jobs')
        .insert(jobs)

      if (insertError) throw insertError

      // Success
      onSuccess()
    } catch (err: any) {
      setError(`Failed to create pricing jobs: ${err.message}`)
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Run Pricing for {intakeIds.length} Intake(s)</DialogTitle>
          <DialogDescription>
            Select the pricing sources to use for these intakes. Jobs will be created for each intake-source combination.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {fetchingSources ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : sources.length === 0 ? (
            <Alert>
              <AlertDescription>
                No enabled sources found. Please enable at least one source in the Sources page.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <Label>Select Sources</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleSelectAll}
                  className="h-auto py-1"
                >
                  {selectedSourceIds.size === sources.length ? 'Deselect All' : 'Select All'}
                </Button>
              </div>
              <div className="space-y-3 max-h-[300px] overflow-y-auto border rounded-md p-4">
                {sources.map((source) => (
                  <div key={source.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`source-${source.id}`}
                      checked={selectedSourceIds.has(source.id)}
                      onCheckedChange={() => toggleSource(source.id)}
                    />
                    <Label
                      htmlFor={`source-${source.id}`}
                      className="flex-1 cursor-pointer font-normal"
                    >
                      {source.name}
                    </Label>
                  </div>
                ))}
              </div>
            </>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleRunPricing}
            disabled={loading || sources.length === 0 || selectedSourceIds.size === 0}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating Jobs...
              </>
            ) : (
              'Run Pricing'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

