'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

export default function GradingServiceEditPage() {
  const router = useRouter()
  const params = useParams()
  const serviceId = params.id as string
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [service, setService] = useState<any>(null)

  useEffect(() => {
    if (serviceId) {
      loadService()
    }
  }, [serviceId])

  const loadService = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('grading_services')
        .select('*')
        .eq('id', serviceId)
        .single()

      if (error) throw error
      setService(data)
    } catch (err: any) {
      alert(`Error loading service: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const updateData: any = {
        name: service.name,
        website: service.website || null,
        enabled: service.enabled,
        base_fee_cents: parseInt(service.base_fee_cents) || 0,
        per_coin_fee_cents: parseInt(service.per_coin_fee_cents) || 0,
        max_declared_value_cents: service.max_declared_value_cents ? parseInt(service.max_declared_value_cents) : null,
        turnaround_days: service.turnaround_days ? parseInt(service.turnaround_days) : null,
        requires_membership: service.requires_membership || false,
        membership_fee_cents: service.membership_fee_cents ? parseInt(service.membership_fee_cents) : null,
        notes: service.notes || null
      }

      const { error } = await supabase
        .from('grading_services')
        .update(updateData)
        .eq('id', service.id)

      if (error) throw error

      alert('Service updated successfully')
      router.push('/admin/grading-services')
    } catch (err: any) {
      alert(`Error updating service: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="container mx-auto px-4 py-8">Loading...</div>
  }

  if (!service) {
    return <div className="container mx-auto px-4 py-8">Service not found</div>
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">{service.name}</h1>
      </div>

      <Card className="glass-strong">
        <CardHeader>
          <CardTitle>Service Configuration</CardTitle>
          <CardDescription>Update grading service settings and pricing</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Name */}
          <div>
            <Label htmlFor="name">Service Name</Label>
            <Input
              id="name"
              type="text"
              value={service.name || ''}
              onChange={(e) => setService({ ...service, name: e.target.value })}
            />
          </div>

          {/* Website */}
          <div>
            <Label htmlFor="website">Website</Label>
            <Input
              id="website"
              type="url"
              value={service.website || ''}
              onChange={(e) => setService({ ...service, website: e.target.value })}
              placeholder="https://example.com"
            />
          </div>

          {/* Enabled */}
          <div className="flex items-center justify-between">
            <div>
              <Label>Enabled</Label>
              <p className="text-sm text-muted-foreground">Enable or disable this grading service</p>
            </div>
            <Switch
              checked={service.enabled}
              onCheckedChange={(checked) => setService({ ...service, enabled: checked })}
            />
          </div>

          {/* Base Fee */}
          <div>
            <Label htmlFor="base_fee_cents">Base Fee (cents)</Label>
            <Input
              id="base_fee_cents"
              type="number"
              min="0"
              value={service.base_fee_cents || 0}
              onChange={(e) => setService({ ...service, base_fee_cents: e.target.value })}
            />
            <p className="text-sm text-muted-foreground mt-1">
              One-time base fee in cents (e.g., 1000 = $10.00)
            </p>
          </div>

          {/* Per Coin Fee */}
          <div>
            <Label htmlFor="per_coin_fee_cents">Per Coin Fee (cents)</Label>
            <Input
              id="per_coin_fee_cents"
              type="number"
              min="0"
              value={service.per_coin_fee_cents || 0}
              onChange={(e) => setService({ ...service, per_coin_fee_cents: e.target.value })}
            />
            <p className="text-sm text-muted-foreground mt-1">
              Fee per coin in cents (e.g., 6500 = $65.00)
            </p>
          </div>

          {/* Max Declared Value */}
          <div>
            <Label htmlFor="max_declared_value_cents">Max Declared Value (cents)</Label>
            <Input
              id="max_declared_value_cents"
              type="number"
              min="0"
              value={service.max_declared_value_cents || ''}
              onChange={(e) => setService({ ...service, max_declared_value_cents: e.target.value || null })}
            />
            <p className="text-sm text-muted-foreground mt-1">
              Maximum declared value for insurance (e.g., 1000000 = $10,000)
            </p>
          </div>

          {/* Turnaround Days */}
          <div>
            <Label htmlFor="turnaround_days">Turnaround Days</Label>
            <Input
              id="turnaround_days"
              type="number"
              min="1"
              value={service.turnaround_days || ''}
              onChange={(e) => setService({ ...service, turnaround_days: e.target.value || null })}
            />
            <p className="text-sm text-muted-foreground mt-1">
              Typical turnaround time in days
            </p>
          </div>

          {/* Requires Membership */}
          <div className="flex items-center justify-between">
            <div>
              <Label>Requires Membership</Label>
              <p className="text-sm text-muted-foreground">Does this service require a membership?</p>
            </div>
            <Switch
              checked={service.requires_membership || false}
              onCheckedChange={(checked) => setService({ ...service, requires_membership: checked })}
            />
          </div>

          {/* Membership Fee */}
          {service.requires_membership && (
            <div>
              <Label htmlFor="membership_fee_cents">Membership Fee (cents)</Label>
              <Input
                id="membership_fee_cents"
                type="number"
                min="0"
                value={service.membership_fee_cents || ''}
                onChange={(e) => setService({ ...service, membership_fee_cents: e.target.value || null })}
              />
              <p className="text-sm text-muted-foreground mt-1">
                Annual membership fee in cents (will be divided by batch size)
              </p>
            </div>
          )}

          {/* Notes */}
          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={service.notes || ''}
              onChange={(e) => setService({ ...service, notes: e.target.value })}
              rows={3}
              placeholder="Additional notes about this service..."
            />
          </div>

          {/* Save Button */}
          <div className="flex justify-end gap-4 pt-4 border-t">
            <Button variant="outline" onClick={() => router.push('/admin/grading-services')}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

