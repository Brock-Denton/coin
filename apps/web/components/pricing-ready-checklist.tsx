'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle2, Circle, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { firstOrSelf } from '@/lib/relations'

interface PricingReadyChecklistProps {
  intake: {
    coin_media?: Array<{ kind?: string; media_type: string }>
    attributions?: {
      year?: number | null
      denomination?: string | null
      mintmark?: string | null
      series?: string | null
      title?: string | null
    } | Array<{
      year?: number | null
      denomination?: string | null
      mintmark?: string | null
      series?: string | null
      title?: string | null
    }> | null
    valuations?: any | Array<any> | null
  }
}

export function PricingReadyChecklist({ intake }: PricingReadyChecklistProps) {
  const images = intake.coin_media || []
  const attribution = firstOrSelf(intake.attributions)
  const valuation = firstOrSelf(intake.valuations)
  
  // Check 1: Photos present (at least one photo)
  const hasPhotos = images.length > 0
  const hasObverse = images.some((img: any) => img.kind === 'obverse' || img.media_type === 'obverse')
  const hasReverse = images.some((img: any) => img.kind === 'reverse' || img.media_type === 'reverse')
  
  // Check 2: Attribution complete (has required fields)
  // Helper to check if a value is truthy and not empty string
  const hasValue = (value: any): boolean => {
    return value != null && value !== ''
  }
  
  const hasYear = hasValue(attribution?.year) && Number(attribution?.year) > 0
  const hasDenomination = hasValue(attribution?.denomination)
  const hasMintmark = !!attribution?.mintmark || true // Mintmark can be blank (P mint)
  const hasSeriesOrTitle = hasValue(attribution?.series) || hasValue(attribution?.title)
  const attributionComplete = hasYear && hasDenomination && hasSeriesOrTitle
  
  // Check 3: Valuation exists
  const hasValuation = !!valuation
  
  const allReady = hasPhotos && attributionComplete && hasValuation
  
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Pricing Ready Checklist</CardTitle>
          {allReady && (
            <Badge variant="default" className="bg-green-600">Ready</Badge>
          )}
          {!allReady && (
            <Badge variant="secondary">Incomplete</Badge>
          )}
        </div>
        <CardDescription>
          Complete these items before running pricing to ensure accurate results.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Photos Check */}
        <div className="flex items-start gap-3">
          {hasPhotos ? (
            <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
          ) : (
            <Circle className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
          )}
          <div className="flex-1">
            <div className="font-medium">Photos Present</div>
            <div className="text-sm text-muted-foreground">
              {hasPhotos ? (
                <>
                  {hasObverse && hasReverse ? 'Both front and back photos' : 
                   hasObverse ? 'Front photo only' :
                   hasReverse ? 'Back photo only' :
                   'Photos uploaded'}
                </>
              ) : (
                'Upload at least one photo (front or back)'
              )}
            </div>
          </div>
        </div>
        
        {/* Attribution Check */}
        <div className="flex items-start gap-3">
          {attributionComplete ? (
            <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
          ) : (
            <Circle className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
          )}
          <div className="flex-1">
            <div className="font-medium">Attribution Complete</div>
            <div className="text-sm text-muted-foreground space-y-1">
              {attributionComplete ? (
                'All required attribution fields are filled'
              ) : (
                <ul className="list-disc list-inside space-y-0.5">
                  {!hasYear && <li>Year is required</li>}
                  {!hasDenomination && <li>Denomination is required</li>}
                  {!hasSeriesOrTitle && <li>Series or Title is required</li>}
                </ul>
              )}
            </div>
          </div>
        </div>
        
        {/* Valuation Check */}
        <div className="flex items-start gap-3">
          {hasValuation ? (
            <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
          ) : (
            <Circle className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
          )}
          <div className="flex-1">
            <div className="font-medium">Valuation Exists</div>
            <div className="text-sm text-muted-foreground">
              {hasValuation ? (
                'Pricing has been computed'
              ) : (
                'Run pricing to generate a valuation'
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

