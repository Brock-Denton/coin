'use client'

import { Button } from '@/components/ui/button'
import { Play, Download, X } from 'lucide-react'

interface BulkActionsToolbarProps {
  selectedCount: number
  onRunPricing: () => void
  onExportCSV: () => void
  onMarkListed: () => void
  onMarkSold: () => void
  onClearSelection: () => void
  exporting?: boolean
}

export function BulkActionsToolbar({
  selectedCount,
  onRunPricing,
  onExportCSV,
  onMarkListed,
  onMarkSold,
  onClearSelection,
  exporting = false,
}: BulkActionsToolbarProps) {
  return (
    <div className="flex items-center justify-between p-4 bg-muted rounded-lg border">
      <div className="flex items-center gap-2">
        <span className="font-medium">{selectedCount} selected</span>
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={onRunPricing} size="sm">
          <Play className="h-4 w-4 mr-2" />
          Run Pricing
        </Button>
        <Button 
          onClick={onExportCSV} 
          variant="outline" 
          size="sm"
          disabled={exporting}
        >
          <Download className="h-4 w-4 mr-2" />
          {exporting ? 'Exporting...' : 'Export CSV'}
        </Button>
        <Button onClick={onMarkListed} variant="outline" size="sm">
          Mark Listed
        </Button>
        <Button onClick={onMarkSold} variant="outline" size="sm">
          Mark Sold
        </Button>
        <Button onClick={onClearSelection} variant="ghost" size="sm">
          <X className="h-4 w-4 mr-2" />
          Clear Selection
        </Button>
      </div>
    </div>
  )
}

