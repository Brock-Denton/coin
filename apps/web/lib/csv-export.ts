/**
 * CSV export utilities for coin intakes
 */

interface IntakeRow {
  // Intake fields
  id: string
  intake_number: string
  status: string
  notes?: string | null
  created_at: string
  updated_at: string
  
  // Attribution fields
  year?: number | null
  denomination?: string | null
  mintmark?: string | null
  normalized_mintmark?: string | null
  series?: string | null
  variety?: string | null
  grade?: string | null
  title?: string | null
  attribution_notes?: string | null
  cleaned?: boolean | null
  scratches?: boolean | null
  rim_damage?: boolean | null
  details_damaged?: boolean | null
  harsh_cleaning?: boolean | null
  toning?: boolean | null
  
  // Valuation fields
  price_cents_p20?: number | null
  price_cents_p40?: number | null
  price_cents_median?: number | null
  price_cents_p60?: number | null
  price_cents_p80?: number | null
  price_cents_p90?: number | null
  price_cents_mean?: number | null
  confidence_score?: number | null
  comp_count?: number | null
  comp_sources_count?: number | null
  sold_count?: number | null
  ask_count?: number | null
}

/**
 * Escape a CSV field value
 */
function escapeCSVField(value: any): string {
  if (value === null || value === undefined) {
    return ''
  }
  
  const str = String(value)
  
  // If contains comma, quote, or newline, wrap in quotes and escape quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  
  return str
}

/**
 * Format a date value for CSV
 */
function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return ''
  try {
    return new Date(dateString).toISOString()
  } catch {
    return dateString
  }
}

/**
 * Format currency from cents to dollars
 */
function formatCurrency(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return ''
  return (cents / 100).toFixed(2)
}

/**
 * Format boolean as Yes/No
 */
function formatBoolean(value: boolean | null | undefined): string {
  if (value === null || value === undefined) return ''
  return value ? 'Yes' : 'No'
}

/**
 * Convert intake data to CSV row
 */
function intakeToCSVRow(row: IntakeRow): string[] {
  return [
    escapeCSVField(row.intake_number),
    escapeCSVField(row.status),
    escapeCSVField(row.notes || ''),
    formatDate(row.created_at),
    formatDate(row.updated_at),
    escapeCSVField(row.year?.toString() || ''),
    escapeCSVField(row.denomination || ''),
    escapeCSVField(row.mintmark || ''),
    escapeCSVField(row.normalized_mintmark || ''),
    escapeCSVField(row.series || ''),
    escapeCSVField(row.variety || ''),
    escapeCSVField(row.grade || ''),
    escapeCSVField(row.title || ''),
    escapeCSVField(row.attribution_notes || ''),
    formatBoolean(row.cleaned),
    formatBoolean(row.scratches),
    formatBoolean(row.rim_damage),
    formatBoolean(row.details_damaged),
    formatBoolean(row.harsh_cleaning),
    formatBoolean(row.toning),
    formatCurrency(row.price_cents_p20),
    formatCurrency(row.price_cents_p40),
    formatCurrency(row.price_cents_median),
    formatCurrency(row.price_cents_p60),
    formatCurrency(row.price_cents_p80),
    formatCurrency(row.price_cents_p90),
    formatCurrency(row.price_cents_mean),
    escapeCSVField(row.confidence_score?.toString() || ''),
    escapeCSVField(row.comp_count?.toString() || ''),
    escapeCSVField(row.comp_sources_count?.toString() || ''),
    escapeCSVField(row.sold_count?.toString() || ''),
    escapeCSVField(row.ask_count?.toString() || ''),
  ]
}

/**
 * CSV headers
 */
const CSV_HEADERS = [
  'Intake Number',
  'Status',
  'Notes',
  'Created At',
  'Updated At',
  'Year',
  'Denomination',
  'Mintmark',
  'Normalized Mintmark',
  'Series',
  'Variety',
  'Grade',
  'Title',
  'Attribution Notes',
  'Cleaned',
  'Scratches',
  'Rim Damage',
  'Details Damaged',
  'Harsh Cleaning',
  'Toning',
  'Price Quick Sale (20th %ile) USD',
  'Price Fair Low (40th %ile) USD',
  'Price Median (50th %ile) USD',
  'Price Fair High (60th %ile) USD',
  'Price Premium (80th %ile) USD',
  'Price (90th %ile) USD',
  'Price Mean USD',
  'Confidence Score',
  'Comp Count',
  'Comp Sources Count',
  'Sold Count',
  'Ask Count',
]

/**
 * Generate CSV content from intake data
 */
export function generateIntakesCSV(rows: IntakeRow[]): string {
  const csvRows = [
    CSV_HEADERS.join(','),
    ...rows.map(row => intakeToCSVRow(row).join(',')),
  ]
  
  return csvRows.join('\n')
}

/**
 * Download CSV file
 */
export function downloadCSV(csvContent: string, filename: string = 'coin-intakes-export.csv') {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  
  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  link.style.visibility = 'hidden'
  
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  
  URL.revokeObjectURL(url)
}

