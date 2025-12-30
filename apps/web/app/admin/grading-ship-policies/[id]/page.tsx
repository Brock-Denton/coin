'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function GradingShipPolicyEditPage() {
  const router = useRouter()
  const params = useParams()
  const policyId = params.id as string
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [policy, setPolicy] = useState<any>(null)

  useEffect(() => {
    if (policyId) {
      loadPolicy()
    }
  }, [policyId])

  const loadPolicy = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('grading_ship_policies')
        .select('*')
        .eq('id', policyId)
        .single()

      if (error) throw error
      setPolicy(data)
    } catch (err: any) {
      alert(`Error loading policy: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const updateData: any = {
        name: policy.name,
        outbound_shipping_cents: parseInt(policy.outbound_shipping_cents) || 0,
        return_shipping_cents: parseInt(policy.return_shipping_cents) || 0,
        insurance_rate_bps: parseInt(policy.insurance_rate_bps) || 0,
        handling_cents: parseInt(policy.handling_cents) || 0
      }

      const { error } = await supabase
        .from('grading_ship_policies')
        .update(updateData)
        .eq('id', policy.id)

      if (error) throw error

      alert('Policy updated successfully')
      router.push('/admin/grading-ship-policies')
    } catch (err: any) {
      alert(`Error updating policy: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="container mx-auto px-4 py-8">Loading...</div>
  }

  if (!policy) {
    return <div className="container mx-auto px-4 py-8">Policy not found</div>
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">{policy.name}</h1>
      </div>

      <Card className="glass-strong">
        <CardHeader>
          <CardTitle>Shipping Policy Configuration</CardTitle>
          <CardDescription>Update shipping costs and insurance rates</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Name */}
          <div>
            <Label htmlFor="name">Policy Name</Label>
            <Input
              id="name"
              type="text"
              value={policy.name || ''}
              onChange={(e) => setPolicy({ ...policy, name: e.target.value })}
            />
          </div>

          {/* Outbound Shipping */}
          <div>
            <Label htmlFor="outbound_shipping_cents">Outbound Shipping (cents)</Label>
            <Input
              id="outbound_shipping_cents"
              type="number"
              min="0"
              value={policy.outbound_shipping_cents || 0}
              onChange={(e) => setPolicy({ ...policy, outbound_shipping_cents: e.target.value })}
            />
            <p className="text-sm text-muted-foreground mt-1">
              Cost to ship coins to grading service (e.g., 1500 = $15.00)
            </p>
          </div>

          {/* Return Shipping */}
          <div>
            <Label htmlFor="return_shipping_cents">Return Shipping (cents)</Label>
            <Input
              id="return_shipping_cents"
              type="number"
              min="0"
              value={policy.return_shipping_cents || 0}
              onChange={(e) => setPolicy({ ...policy, return_shipping_cents: e.target.value })}
            />
            <p className="text-sm text-muted-foreground mt-1">
              Cost for grading service to return coins (e.g., 1500 = $15.00)
            </p>
          </div>

          {/* Insurance Rate */}
          <div>
            <Label htmlFor="insurance_rate_bps">Insurance Rate (basis points)</Label>
            <Input
              id="insurance_rate_bps"
              type="number"
              min="0"
              max="10000"
              value={policy.insurance_rate_bps || 0}
              onChange={(e) => setPolicy({ ...policy, insurance_rate_bps: e.target.value })}
            />
            <p className="text-sm text-muted-foreground mt-1">
              Insurance rate in basis points (100 = 1%, e.g., 100 = 1% of declared value)
            </p>
          </div>

          {/* Handling */}
          <div>
            <Label htmlFor="handling_cents">Handling Fee (cents)</Label>
            <Input
              id="handling_cents"
              type="number"
              min="0"
              value={policy.handling_cents || 0}
              onChange={(e) => setPolicy({ ...policy, handling_cents: e.target.value })}
            />
            <p className="text-sm text-muted-foreground mt-1">
              Additional handling fee (e.g., 500 = $5.00)
            </p>
          </div>

          {/* Save Button */}
          <div className="flex justify-end gap-4 pt-4 border-t">
            <Button variant="outline" onClick={() => router.push('/admin/grading-ship-policies')}>
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

