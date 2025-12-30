'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Alert, AlertDescription } from '@/components/ui/alert'

export default function GradeMultipliersPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [multipliers, setMultipliers] = useState<any[]>([])
  const [version, setVersion] = useState('baseline_v1')
  const [denomination, setDenomination] = useState<string>('all')
  const [series, setSeries] = useState<string>('all')
  const [editedMultipliers, setEditedMultipliers] = useState<Record<string, number>>({})

  const denominations = ['all', 'penny', 'nickel', 'dime', 'quarter', 'half_dollar', 'dollar']
  const gradeBuckets = ['AG', 'G', 'VG', 'F', 'VF', 'XF', 'AU', 'MS', 'MS60', 'MS61', 'MS62', 'MS63', 'MS64', 'MS65', 'MS66', 'MS67']

  useEffect(() => {
    loadMultipliers()
  }, [version, denomination, series])

  const loadMultipliers = async () => {
    setLoading(true)
    try {
      // Get all multipliers for the version, then filter in memory
      // This is simpler than complex SQL filtering
      const { data: allMultipliers, error } = await supabase
        .from('grade_multipliers')
        .select('*')
        .eq('version', version)
        .order('bucket', { ascending: true })

      if (error) throw error

      // Filter by denomination
      let filtered = allMultipliers || []
      if (denomination !== 'all') {
        filtered = filtered.filter(m => m.denomination === denomination)
      } else {
        // Show generic multipliers (denomination is null)
        filtered = filtered.filter(m => m.denomination === null || m.denomination === undefined)
      }

      // Filter by series (only if denomination is selected and not 'all')
      if (denomination !== 'all' && series !== 'all') {
        filtered = filtered.filter(m => m.series === series)
      } else if (denomination !== 'all') {
        // Show generic series multipliers (series is null) for this denomination
        filtered = filtered.filter(m => m.series === null || m.series === undefined)
      }

      setMultipliers(filtered)
      setEditedMultipliers({})
    } catch (err: any) {
      alert(`Error loading multipliers: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleMultiplierChange = (id: string, value: string) => {
    const numValue = parseFloat(value)
    if (!isNaN(numValue) && numValue > 0) {
      setEditedMultipliers({ ...editedMultipliers, [id]: numValue })
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const updates = Object.entries(editedMultipliers).map(([id, multiplier]) => ({
        id,
        multiplier
      }))

      for (const update of updates) {
        const { error } = await supabase
          .from('grade_multipliers')
          .update({ multiplier: update.multiplier })
          .eq('id', update.id)

        if (error) throw error
      }

      alert(`Updated ${updates.length} multiplier(s)`)
      setEditedMultipliers({})
      loadMultipliers()
    } catch (err: any) {
      alert(`Error saving multipliers: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  const hasChanges = Object.keys(editedMultipliers).length > 0

  return (
    <div>
      <h1 className="text-4xl font-bold mb-8">Grade Multipliers</h1>

      <Card className="glass-strong mb-6">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Model Version</Label>
              <Select value={version} onValueChange={setVersion}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="baseline_v1">baseline_v1</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Denomination</Label>
              <Select value={denomination} onValueChange={setDenomination}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Generic (All)</SelectItem>
                  {denominations.filter(d => d !== 'all').map(d => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {denomination !== 'all' && (
              <div>
                <Label>Series</Label>
                <Select value={series} onValueChange={setSeries}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Generic (All Series)</SelectItem>
                    {/* In a real app, you'd fetch series from attributions or a separate table */}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="glass-strong">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Grade Multipliers</CardTitle>
              <CardDescription>
                {denomination === 'all' 
                  ? 'Generic multipliers (apply to all coin types)'
                  : `Multipliers for ${denomination}${series !== 'all' ? ` - ${series}` : ''}`
                }
              </CardDescription>
            </div>
            {hasChanges && (
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : `Save ${Object.keys(editedMultipliers).length} Change(s)`}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : multipliers.length === 0 ? (
            <Alert>
              <AlertDescription>
                No multipliers found for the selected filters. Generic multipliers (denomination=null, series=null) 
                are the fallback values used when no specific override exists.
              </AlertDescription>
            </Alert>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Grade Bucket</TableHead>
                  <TableHead>Multiplier</TableHead>
                  <TableHead>Denomination</TableHead>
                  <TableHead>Series</TableHead>
                  <TableHead>Enabled</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {multipliers.map((mult) => {
                  const editedValue = editedMultipliers[mult.id]
                  const displayValue = editedValue !== undefined ? editedValue : mult.multiplier
                  
                  return (
                    <TableRow key={mult.id}>
                      <TableCell className="font-medium">{mult.bucket}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={displayValue}
                          onChange={(e) => handleMultiplierChange(mult.id, e.target.value)}
                          className="w-24"
                        />
                      </TableCell>
                      <TableCell>
                        {mult.denomination ? (
                          <Badge variant="default">{mult.denomination}</Badge>
                        ) : (
                          <span className="text-muted-foreground">Generic</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {mult.series ? (
                          <Badge variant="secondary">{mult.series}</Badge>
                        ) : (
                          <span className="text-muted-foreground">Generic</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={mult.enabled ? 'default' : 'secondary'}>
                          {mult.enabled ? 'Yes' : 'No'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="glass-strong mt-6">
        <CardHeader>
          <CardTitle>About Grade Multipliers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-semibold mb-2">Lookup Order</h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
              <li>Exact match: denomination + series + version</li>
              <li>Denomination match: denomination + version (series=null)</li>
              <li>Generic fallback: denomination=null, series=null, version</li>
            </ol>
          </div>
          <div>
            <h3 className="font-semibold mb-2">Example</h3>
            <p className="text-sm text-muted-foreground">
              A raw coin worth $100 at MS65 grade would be valued at $100 × 3.8 (MS65 multiplier) = $380 when graded.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

