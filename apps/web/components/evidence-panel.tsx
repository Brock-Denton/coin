'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Valuation } from '@/types/database'

interface EvidencePanelProps {
  valuation: Valuation
  intakeId?: string
}

export function EvidencePanel({ valuation, intakeId }: EvidencePanelProps) {
  const [isOpen, setIsOpen] = useState(false)
  
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Pricing Evidence</CardTitle>
            <CardDescription>
              View comparable listings and pricing methodology
            </CardDescription>
          </div>
          <Button variant="outline" onClick={() => setIsOpen(!isOpen)}>
            {isOpen ? 'Hide' : 'Show'} Evidence
          </Button>
        </div>
      </CardHeader>
      {isOpen && (
        <CardContent className="space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="font-semibold">Confidence Score:</span>
              <Badge variant={valuation.confidence_score >= 7 ? 'default' : 'secondary'}>
                {valuation.confidence_score}/10
              </Badge>
            </div>
            {valuation.explanation && (
              <p className="text-sm text-muted-foreground mb-4">{valuation.explanation}</p>
            )}
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-muted-foreground">Comparables</div>
              <div className="text-2xl font-bold">{valuation.comp_count}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Sources</div>
              <div className="text-2xl font-bold">{valuation.comp_sources_count}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Sold</div>
              <div className="text-2xl font-bold">{valuation.sold_count}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Asking</div>
              <div className="text-2xl font-bold">{valuation.ask_count}</div>
            </div>
          </div>
          
          {valuation.price_cents_median && (
            <div className="pt-4 border-t">
              <div className="text-sm text-muted-foreground mb-2">Price Range (10th - 90th percentile)</div>
              <div className="flex items-center gap-4">
                {valuation.price_cents_p10 && (
                  <div>
                    <div className="text-xs text-muted-foreground">10th %ile</div>
                    <div className="font-semibold">${(valuation.price_cents_p10 / 100).toFixed(2)}</div>
                  </div>
                )}
                <div>
                  <div className="text-xs text-muted-foreground">Median</div>
                  <div className="text-xl font-bold">${(valuation.price_cents_median / 100).toFixed(2)}</div>
                </div>
                {valuation.price_cents_p90 && (
                  <div>
                    <div className="text-xs text-muted-foreground">90th %ile</div>
                    <div className="font-semibold">${(valuation.price_cents_p90 / 100).toFixed(2)}</div>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {intakeId && (
            <div className="pt-4">
              <Button variant="outline" size="sm" asChild>
                <a href={`/admin/intakes/${intakeId}`} target="_blank">
                  View Full Details in Admin
                </a>
              </Button>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}


