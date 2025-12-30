'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertTriangle } from 'lucide-react'

interface PricingSummaryPanelProps {
  valuation: any | null
  pricePoints: any[]
}

export function PricingSummaryPanel({ valuation, pricePoints }: PricingSummaryPanelProps) {
  if (!valuation) {
    return null
  }

  // Calculate additional metrics from price points
  const lastCompObservedAt = pricePoints.length > 0
    ? pricePoints
        .map((pp: any) => pp.observed_at || pp.created_at)
        .sort()
        .reverse()[0]
    : null

  const matchStrengths = pricePoints
    .map((pp: any) => pp.match_strength)
    .filter((ms: any) => ms != null) as number[]
  const avgMatchStrength = matchStrengths.length > 0
    ? matchStrengths.reduce((a, b) => a + b, 0) / matchStrengths.length
    : null

  // Calculate spread ratio (tightness)
  const spreadRatio = valuation.price_cents_median && valuation.price_cents_p10 && valuation.price_cents_p90
    ? (valuation.price_cents_p90 - valuation.price_cents_p10) / valuation.price_cents_median
    : null

  // Check if only ASK comps exist
  const onlyAskComps = valuation.sold_count === 0 && valuation.ask_count > 0

  // Format currency
  const formatCents = (cents: number | null) => {
    if (cents == null) return 'N/A'
    return `$${(cents / 100).toFixed(2)}`
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pricing Summary</CardTitle>
        <CardDescription>Valuation metrics and comp analysis</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {onlyAskComps && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Ask-only comps; confidence capped.</strong> No sold comps available.
            </AlertDescription>
          </Alert>
        )}

        {/* Price Bands */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <div className="text-sm text-muted-foreground">Quick Sale (P20)</div>
            <div className="text-lg font-semibold">{formatCents(valuation.price_cents_p20)}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Fair Low (P40)</div>
            <div className="text-lg font-semibold">{formatCents(valuation.price_cents_p40)}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Median (P50)</div>
            <div className="text-xl font-bold">{formatCents(valuation.price_cents_median)}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Fair High (P60)</div>
            <div className="text-lg font-semibold">{formatCents(valuation.price_cents_p60)}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Premium (P80)</div>
            <div className="text-lg font-semibold">{formatCents(valuation.price_cents_p80)}</div>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
          <div>
            <div className="text-sm text-muted-foreground">Confidence</div>
            <div className="text-xl font-bold">
              <Badge variant={valuation.confidence_score >= 7 ? 'default' : valuation.confidence_score >= 4 ? 'secondary' : 'destructive'}>
                {valuation.confidence_score}/10
              </Badge>
            </div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Total Comps</div>
            <div className="text-xl font-semibold">{valuation.comp_count}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Sold</div>
            <div className="text-lg font-semibold text-green-600">{valuation.sold_count}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Ask</div>
            <div className="text-lg font-semibold text-blue-600">{valuation.ask_count}</div>
          </div>
        </div>

        {/* Additional Metrics */}
        {(lastCompObservedAt || avgMatchStrength != null || spreadRatio != null) && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t">
            {lastCompObservedAt && (
              <div>
                <div className="text-sm text-muted-foreground">Last Comp Observed</div>
                <div className="text-sm font-medium">
                  {new Date(lastCompObservedAt).toLocaleString()}
                </div>
              </div>
            )}
            {avgMatchStrength != null && (
              <div>
                <div className="text-sm text-muted-foreground">Avg Match Strength</div>
                <div className="text-sm font-medium">
                  {(avgMatchStrength * 100).toFixed(1)}%
                </div>
              </div>
            )}
            {spreadRatio != null && (
              <div>
                <div className="text-sm text-muted-foreground">Spread Ratio</div>
                <div className="text-sm font-medium">
                  {(spreadRatio * 100).toFixed(1)}%
                  {spreadRatio < 0.2 && <span className="ml-2 text-green-600">(Tight)</span>}
                  {spreadRatio >= 0.2 && spreadRatio < 0.4 && <span className="ml-2 text-blue-600">(Moderate)</span>}
                  {spreadRatio >= 0.4 && <span className="ml-2 text-orange-600">(Wide)</span>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Last Updated */}
        <div className="text-xs text-muted-foreground pt-2 border-t">
          Last updated: {new Date(valuation.updated_at).toLocaleString()}
        </div>
      </CardContent>
    </Card>
  )
}


