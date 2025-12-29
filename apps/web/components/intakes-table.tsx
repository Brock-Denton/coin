'use client'

import { useState, useEffect } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { BulkActionsToolbar } from '@/components/bulk-actions-toolbar'
import { BulkPricingDialog } from '@/components/bulk-pricing-dialog'
import { generateIntakesCSV, downloadCSV } from '@/lib/csv-export'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

interface Intake {
  id: string
  intake_number: string
  status: string
  notes?: string
  created_at: string
  updated_at: string
  attributions?: Array<{
    year?: number | null
    denomination?: string | null
    mintmark?: string | null
    series?: string | null
    grade?: string | null
  }>
  valuations?: Array<{
    price_cents_median?: number | null
    confidence_score?: number
  }>
}

interface IntakesTableProps {
  intakes: Intake[]
}

export function IntakesTable({ intakes }: IntakesTableProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkPricingOpen, setBulkPricingOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const supabase = createClient()

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === intakes.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(intakes.map(i => i.id)))
    }
  }

  const clearSelection = () => {
    setSelectedIds(new Set())
  }

  const selectedIntakes = intakes.filter(i => selectedIds.has(i.id))

  const handleExportCSV = async () => {
    setExporting(true)
    try {
      // Fetch comprehensive data for selected intakes (or all if none selected)
      const intakeIdsToExport = selectedIds.size > 0 
        ? Array.from(selectedIds)
        : intakes.map(i => i.id)

      if (intakeIdsToExport.length === 0) {
        alert('No intakes to export')
        return
      }

      // Fetch intakes with full attribution and valuation data
      const { data: intakesData, error: intakesError } = await supabase
        .from('coin_intakes')
        .select(`
          id,
          intake_number,
          status,
          notes,
          created_at,
          updated_at
        `)
        .in('id', intakeIdsToExport)

      if (intakesError) throw intakesError

      // Fetch attributions
      const { data: attributions, error: attrError } = await supabase
        .from('attributions')
        .select('*')
        .in('intake_id', intakeIdsToExport)

      if (attrError) throw attrError

      // Fetch valuations
      const { data: valuations, error: valError } = await supabase
        .from('valuations')
        .select('*')
        .in('intake_id', intakeIdsToExport)

      if (valError) throw valError

      // Create maps for joins
      const attributionMap = new Map((attributions || []).map(a => [a.intake_id, a]))
      const valuationMap = new Map((valuations || []).map(v => [v.intake_id, v]))

      // Combine data
      const csvRows = (intakesData || []).map(intake => {
        const attribution = attributionMap.get(intake.id) || {}
        const valuation = valuationMap.get(intake.id) || {}

        return {
          // Intake fields
          id: intake.id,
          intake_number: intake.intake_number,
          status: intake.status,
          notes: intake.notes,
          created_at: intake.created_at,
          updated_at: intake.updated_at,
          
          // Attribution fields
          year: attribution.year,
          denomination: attribution.denomination,
          mintmark: attribution.mintmark,
          normalized_mintmark: attribution.normalized_mintmark,
          series: attribution.series,
          variety: attribution.variety,
          grade: attribution.grade,
          title: attribution.title,
          attribution_notes: attribution.notes,
          cleaned: attribution.cleaned,
          scratches: attribution.scratches,
          rim_damage: attribution.rim_damage,
          details_damaged: attribution.details_damaged,
          harsh_cleaning: attribution.harsh_cleaning,
          toning: attribution.toning,
          
          // Valuation fields
          price_cents_p20: valuation.price_cents_p20,
          price_cents_p40: valuation.price_cents_p40,
          price_cents_median: valuation.price_cents_median,
          price_cents_p60: valuation.price_cents_p60,
          price_cents_p80: valuation.price_cents_p80,
          price_cents_p90: valuation.price_cents_p90,
          price_cents_mean: valuation.price_cents_mean,
          confidence_score: valuation.confidence_score,
          comp_count: valuation.comp_count,
          comp_sources_count: valuation.comp_sources_count,
          sold_count: valuation.sold_count,
          ask_count: valuation.ask_count,
        }
      })

      // Generate and download CSV
      const csvContent = generateIntakesCSV(csvRows)
      const filename = `coin-intakes-export-${new Date().toISOString().split('T')[0]}.csv`
      downloadCSV(csvContent, filename)
    } catch (err: any) {
      console.error('CSV export error:', err)
      alert(`Failed to export CSV: ${err.message}`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-4">
      {selectedIds.size > 0 && (
        <BulkActionsToolbar
          selectedCount={selectedIds.size}
          onRunPricing={() => setBulkPricingOpen(true)}
          onExportCSV={handleExportCSV}
          onClearSelection={clearSelection}
          exporting={exporting}
        />
      )}

      <BulkPricingDialog
        open={bulkPricingOpen}
        onOpenChange={setBulkPricingOpen}
        intakeIds={Array.from(selectedIds)}
        onSuccess={() => {
          setBulkPricingOpen(false)
          setSelectedIds(new Set())
          window.location.reload()
        }}
      />

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={selectedIds.size === intakes.length && intakes.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead>Intake Number</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Attribution</TableHead>
              <TableHead>Valuation</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {intakes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  No intakes found.
                </TableCell>
              </TableRow>
            ) : (
              intakes.map((intake) => {
                const attribution = intake.attributions?.[0]
                const valuation = intake.valuations?.[0]
                const isSelected = selectedIds.has(intake.id)
                
                const attributionSummary = attribution
                  ? [
                      attribution.year,
                      attribution.mintmark,
                      attribution.denomination,
                      attribution.series,
                    ]
                    .filter(Boolean)
                    .join(' ')
                  : 'No attribution'

                return (
                  <TableRow key={intake.id}>
                    <TableCell>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelect(intake.id)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{intake.intake_number}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{intake.status}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {attributionSummary}
                    </TableCell>
                    <TableCell>
                      {valuation?.price_cents_median ? (
                        <div className="text-sm">
                          <div className="font-medium">
                            ${(valuation.price_cents_median / 100).toFixed(2)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Confidence: {valuation.confidence_score}/10
                          </div>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">No valuation</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(intake.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/admin/intakes/${intake.id}`}>
                        <Button variant="outline" size="sm">
                          View
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

