'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertTriangle, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'

interface GradingRecommendationsTableProps {
  recommendations: any[]
  services: any[]
  shipPolicies: any[]
  batchSize?: number
  onBatchSizeChange?: (size: number) => void
  onShipPolicyChange?: (policyId: string) => void
}

export function GradingRecommendationsTable({
  recommendations,
  services,
  shipPolicies,
  batchSize = 20,
  onBatchSizeChange,
  onShipPolicyChange
}: GradingRecommendationsTableProps) {
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(
    shipPolicies.length > 0 ? shipPolicies[0].id : null
  )

  // Format currency
  const formatCents = (cents: number | null) => {
    if (cents == null) return 'N/A'
    return `$${(cents / 100).toFixed(2)}`
  }

  // Get recommendation badge
  const getRecommendationBadge = (recommendation: string) => {
    switch (recommendation) {
      case 'submit_for_grading':
        return <Badge className="bg-green-600 hover:bg-green-700">Submit for Grading</Badge>
      case 'sell_raw':
        return <Badge variant="secondary">Sell Raw</Badge>
      case 'needs_better_photos':
        return <Badge variant="destructive">Needs Better Photos</Badge>
      case 'high_details_risk':
        return <Badge variant="destructive">High Details Risk</Badge>
      default:
        return <Badge variant="outline">{recommendation}</Badge>
    }
  }

  // Get method indicator badge
  const getMethodBadge = (breakdown: any) => {
    const method = breakdown?.method_used || 'multipliers'
    if (method === 'certified_comps') {
      return <Badge variant="default" className="bg-blue-600">Certified Comps</Badge>
    }
    return <Badge variant="outline">Multipliers</Badge>
  }

  // Sort recommendations by expected profit (descending)
  const sortedRecommendations = [...recommendations].sort((a, b) => 
    (b.expected_profit_cents || 0) - (a.expected_profit_cents || 0)
  )

  // Create service lookup map
  const serviceMap = new Map(services.map(s => [s.id, s]))
  const policyMap = new Map(shipPolicies.map(p => [p.id, p]))

  if (recommendations.length === 0) {
    return (
      <Card className="glass-strong">
        <CardHeader>
          <CardTitle>Grading Recommendations</CardTitle>
          <CardDescription>No recommendations available yet. Run AI Pre-Grade to generate recommendations.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card className="glass-strong">
      <CardHeader>
        <CardTitle>Grading Recommendations</CardTitle>
        <CardDescription>
          ROI analysis for each grading service. Recommendations are sorted by expected profit.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Batch Size and Ship Policy Controls */}
        <div className="grid grid-cols-2 gap-4 pb-4 border-b">
          <div>
            <Label>Batch Size</Label>
            <Select 
              value={batchSize.toString()} 
              onValueChange={(value) => onBatchSizeChange?.(parseInt(value))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 coin</SelectItem>
                <SelectItem value="5">5 coins</SelectItem>
                <SelectItem value="10">10 coins</SelectItem>
                <SelectItem value="20">20 coins</SelectItem>
                <SelectItem value="50">50 coins</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">Number of coins in batch (affects per-coin cost)</p>
          </div>
          <div>
            <Label>Shipping Policy</Label>
            <Select 
              value={selectedPolicyId || ''} 
              onValueChange={(value) => {
                setSelectedPolicyId(value)
                onShipPolicyChange?.(value)
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {shipPolicies.map(policy => (
                  <SelectItem key={policy.id} value={policy.id}>{policy.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">Shipping method and insurance</p>
          </div>
        </div>

        {/* Recommendations Table */}
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service</TableHead>
                <TableHead>Raw Value</TableHead>
                <TableHead>Graded Value</TableHead>
                <TableHead>Total Cost</TableHead>
                <TableHead>Expected Profit</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Recommendation</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRecommendations.map((rec) => {
                const service = serviceMap.get(rec.service_id)
                const profit = rec.expected_profit_cents || 0
                const isPositive = profit > 0
                
                return (
                  <TableRow key={rec.id || rec.service_id}>
                    <TableCell className="font-medium">
                      {service?.name || 'Unknown Service'}
                    </TableCell>
                    <TableCell>{formatCents(rec.expected_raw_value_cents)}</TableCell>
                    <TableCell>{formatCents(rec.expected_graded_value_cents)}</TableCell>
                    <TableCell>{formatCents(rec.total_cost_cents)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {isPositive ? (
                          <TrendingUp className="h-4 w-4 text-green-600" />
                        ) : profit < 0 ? (
                          <TrendingDown className="h-4 w-4 text-red-600" />
                        ) : (
                          <Minus className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className={isPositive ? 'text-green-600 font-semibold' : profit < 0 ? 'text-red-600 font-semibold' : ''}>
                          {formatCents(rec.expected_profit_cents)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {getMethodBadge(rec.breakdown)}
                    </TableCell>
                    <TableCell>
                      {getRecommendationBadge(rec.recommendation)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>

        {/* Breakdown Info */}
        {sortedRecommendations.some(r => r.breakdown) && (
          <div className="pt-4 border-t space-y-2">
            <h3 className="font-semibold text-sm">Method Details</h3>
            {sortedRecommendations.map((rec) => {
              const breakdown = rec.breakdown || {}
              const service = serviceMap.get(rec.service_id)
              
              if (!breakdown.method_used) return null
              
              return (
                <div key={rec.id || rec.service_id} className="text-xs text-muted-foreground">
                  <strong>{service?.name}:</strong>{' '}
                  {breakdown.method_used === 'certified_comps' 
                    ? `Using ${breakdown.certified_comps_total || 0} certified comps`
                    : `Using ${breakdown.multiplier_version || 'baseline_v1'} multipliers (${breakdown.multiplier_lookup_path || 'generic'})`
                  }
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

