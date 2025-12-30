'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertTriangle, Info } from 'lucide-react'

interface GradeEstimatePanelProps {
  gradeEstimate: any | null
}

export function GradeEstimatePanel({ gradeEstimate }: GradeEstimatePanelProps) {
  if (!gradeEstimate) {
    return null
  }

  const gradeDistribution = gradeEstimate.grade_distribution || {}
  const detailsRisk = gradeEstimate.details_risk || {}
  const msSubDistribution = gradeEstimate.ms_sub_distribution || {}
  const confidence = gradeEstimate.confidence || 0
  const qualityStatus = gradeEstimate.quality_status || 'unknown'

  // Format confidence as percentage
  const confidencePercent = (confidence * 100).toFixed(0)

  // Check if there are any high risk flags
  const hasHighRisk = Object.values(detailsRisk).some((risk: any) => risk > 0.5)

  // Grade bucket display order
  const gradeBuckets = ['AG', 'G', 'VG', 'F', 'VF', 'XF', 'AU', 'MS']

  return (
    <Card className="glass-strong">
      <CardHeader>
        <CardTitle>AI Pre-Grade Estimate</CardTitle>
        <CardDescription>
          Preliminary grade estimate based on image analysis. This is for informational purposes only.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Disclaimer */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            <strong>Preliminary Estimate:</strong> This is a preliminary estimate for informational purposes only. 
            Professional grading by PCGS, NGC, or ANACS provides the definitive grade. This tool helps estimate 
            whether grading may be worthwhile based on expected value vs cost.
          </AlertDescription>
        </Alert>

        {/* Most Likely Grade */}
        <div className="flex items-center gap-4">
          <div>
            <div className="text-sm text-muted-foreground">Most Likely Grade</div>
            <div className="text-3xl font-bold">{gradeEstimate.grade_bucket}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Confidence</div>
            <Badge variant={confidence > 0.6 ? 'default' : confidence > 0.3 ? 'secondary' : 'destructive'} className="text-lg py-1 px-3">
              {confidencePercent}%
            </Badge>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Image Quality</div>
            <Badge variant={qualityStatus === 'good' ? 'default' : qualityStatus === 'fair' ? 'secondary' : 'destructive'}>
              {qualityStatus}
            </Badge>
          </div>
        </div>

        {/* Grade Distribution */}
        <div>
          <h3 className="font-semibold mb-3">Grade Distribution</h3>
          <div className="space-y-2">
            {gradeBuckets.map((bucket) => {
              const probability = gradeDistribution[bucket] || 0
              const percent = (probability * 100).toFixed(1)
              
              return (
                <div key={bucket} className="flex items-center gap-4">
                  <div className="w-16 text-sm font-medium">{bucket}</div>
                  <div className="flex-1">
                    <div className="h-6 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary transition-all"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                  <div className="w-16 text-sm text-right">{percent}%</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* MS Sub-Distribution (if available) */}
        {Object.keys(msSubDistribution).length > 0 && (
          <div>
            <h3 className="font-semibold mb-3">Mint State Sub-Distribution</h3>
            <div className="grid grid-cols-4 gap-2">
              {['MS60', 'MS61', 'MS62', 'MS63', 'MS64', 'MS65', 'MS66', 'MS67'].map((msGrade) => {
                const probability = msSubDistribution[msGrade] || 0
                const percent = (probability * 100).toFixed(1)
                
                return (
                  <div key={msGrade} className="border rounded p-2">
                    <div className="text-xs text-muted-foreground">{msGrade}</div>
                    <div className="text-sm font-semibold">{percent}%</div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Details Risk Flags */}
        {hasHighRisk && (
          <div>
            <h3 className="font-semibold mb-3">Details Risk Assessment</h3>
            {hasHighRisk && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <strong>High risk flags detected.</strong> This coin may have condition issues that could affect grading.
                </AlertDescription>
              </Alert>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
              {Object.entries(detailsRisk).map(([risk, probability]: [string, any]) => {
                if (probability <= 0) return null
                const percent = (probability * 100).toFixed(0)
                const isHigh = probability > 0.5
                
                return (
                  <div key={risk} className="border rounded p-2">
                    <div className="text-xs text-muted-foreground capitalize">{risk.replace('_', ' ')}</div>
                    <div className={`text-sm font-semibold ${isHigh ? 'text-red-600' : ''}`}>
                      {percent}%
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Notes */}
        {gradeEstimate.notes && (
          <div className="pt-4 border-t">
            <div className="text-sm text-muted-foreground">{gradeEstimate.notes}</div>
          </div>
        )}

        {/* Model Version */}
        <div className="text-xs text-muted-foreground pt-2 border-t">
          Model: {gradeEstimate.model_version || 'baseline_v1'} | 
          Updated: {gradeEstimate.updated_at ? new Date(gradeEstimate.updated_at).toLocaleString() : 'N/A'}
        </div>
      </CardContent>
    </Card>
  )
}

