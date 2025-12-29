'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'

export default function SourceEditPage() {
  const router = useRouter()
  const params = useParams()
  const sourceId = params.id as string
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [source, setSource] = useState<any>(null)
  const [config, setConfig] = useState({
    app_id: '',
    cert_id: '',
    dev_id: '',
    sandbox: false
  })

  useEffect(() => {
    if (sourceId) {
      loadSource()
    }
  }, [sourceId])

  const loadSource = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('sources')
        .select('*')
        .eq('id', sourceId)
        .single()

      if (error) throw error

      setSource(data)
      if (data.config) {
        setConfig({
          app_id: data.config.app_id || '',
          cert_id: data.config.cert_id || '',
          dev_id: data.config.dev_id || '',
          sandbox: data.config.sandbox || false
        })
      }
    } catch (err: any) {
      alert(`Error loading source: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const updateData: any = {
        enabled: source.enabled,
        reputation_weight: parseFloat(source.reputation_weight) || 1.0,
        tier: parseInt(source.tier) || 1,
        config: {
          ...config,
          sandbox: config.sandbox
        }
      }

      const { error } = await supabase
        .from('sources')
        .update(updateData)
        .eq('id', source.id)

      if (error) throw error

      alert('Source updated successfully')
      router.push('/admin/sources')
    } catch (err: any) {
      alert(`Error updating source: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="container mx-auto px-4 py-8">Loading...</div>
  }

  if (!source) {
    return <div className="container mx-auto px-4 py-8">Source not found</div>
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">{source.name}</h1>
        <Badge>{source.adapter_type}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Source Configuration</CardTitle>
          <CardDescription>Update source settings and credentials</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Enabled Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label>Enabled</Label>
              <p className="text-sm text-muted-foreground">Enable or disable this pricing source</p>
            </div>
            <Switch
              checked={source.enabled}
              onCheckedChange={(checked) => setSource({ ...source, enabled: checked })}
            />
          </div>

          {/* Reputation Weight */}
          <div>
            <Label htmlFor="reputation_weight">Reputation Weight</Label>
            <Input
              id="reputation_weight"
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={source.reputation_weight || 1.0}
              onChange={(e) => setSource({ ...source, reputation_weight: e.target.value })}
            />
            <p className="text-sm text-muted-foreground mt-1">
              Weight for this source in valuation calculations (0.0 to 1.0)
            </p>
          </div>

          {/* Tier */}
          <div>
            <Label htmlFor="tier">Tier</Label>
            <Input
              id="tier"
              type="number"
              min="1"
              max="10"
              value={source.tier || 1}
              onChange={(e) => setSource({ ...source, tier: e.target.value })}
            />
            <p className="text-sm text-muted-foreground mt-1">
              Source tier for prioritization (1 to 10)
            </p>
          </div>

          {/* eBay API Configuration */}
          {source.adapter_type === 'ebay_api' && (
            <>
              <div className="border-t pt-6">
                <h3 className="text-lg font-semibold mb-4">eBay API Credentials</h3>

                <Alert className="mb-4">
                  <AlertDescription>
                    These credentials are stored securely. Use your eBay Developer account credentials.
                    For sandbox testing, use your sandbox credentials and enable the sandbox toggle below.
                  </AlertDescription>
                </Alert>

                <div className="space-y-4">
                  <div>
                    <Label htmlFor="app_id">App ID (Client ID)</Label>
                    <Input
                      id="app_id"
                      type="text"
                      value={config.app_id}
                      onChange={(e) => setConfig({ ...config, app_id: e.target.value })}
                      placeholder="Your eBay App ID"
                    />
                  </div>

                  <div>
                    <Label htmlFor="cert_id">Cert ID (Client Secret)</Label>
                    <Input
                      id="cert_id"
                      type="password"
                      value={config.cert_id}
                      onChange={(e) => setConfig({ ...config, cert_id: e.target.value })}
                      placeholder="Your eBay Cert ID"
                    />
                  </div>

                  <div>
                    <Label htmlFor="dev_id">Dev ID (Optional)</Label>
                    <Input
                      id="dev_id"
                      type="text"
                      value={config.dev_id}
                      onChange={(e) => setConfig({ ...config, dev_id: e.target.value })}
                      placeholder="Your eBay Dev ID (optional)"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Sandbox Mode</Label>
                      <p className="text-sm text-muted-foreground">Use eBay sandbox environment for testing</p>
                    </div>
                    <Switch
                      checked={config.sandbox}
                      onCheckedChange={(checked) => setConfig({ ...config, sandbox: checked })}
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Save Button */}
          <div className="flex justify-end gap-4 pt-4 border-t">
            <Button variant="outline" onClick={() => router.push('/admin/sources')}>
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

