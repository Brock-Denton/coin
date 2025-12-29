'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function NewIntakePage() {
  const [intakeNumber, setIntakeNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()
  
  const generateIntakeNumber = () => {
    const date = new Date()
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
    return `IN-${year}${month}${day}-${random}`
  }
  
  const handleGenerate = () => {
    setIntakeNumber(generateIntakeNumber())
  }
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    
    try {
      if (!intakeNumber.trim()) {
        setError('Intake number is required')
        return
      }
      
      const { data, error: insertError } = await supabase
        .from('coin_intakes')
        .insert({
          intake_number: intakeNumber.trim(),
          notes: notes.trim() || null,
          status: 'pending'
        })
        .select()
        .single()
      
      if (insertError) {
        if (insertError.code === '23505') { // Unique constraint violation
          setError('Intake number already exists. Please use a different number.')
        } else {
          setError(insertError.message)
        }
        return
      }
      
      if (data) {
        router.push(`/admin/intakes/${data.id}`)
        router.refresh()
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }
  
  return (
    <div>
      <h1 className="text-4xl font-bold mb-8">New Intake</h1>
      
      <Card>
        <CardHeader>
          <CardTitle>Create New Coin Intake</CardTitle>
          <CardDescription>
            Enter details for a new coin intake. You'll be able to add photos and attribution after creation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md">
                {error}
              </div>
            )}
            
            <div>
              <Label htmlFor="intake_number">Intake Number *</Label>
              <div className="flex gap-2">
                <Input
                  id="intake_number"
                  value={intakeNumber}
                  onChange={(e) => setIntakeNumber(e.target.value)}
                  placeholder="IN-20241228-001"
                  required
                />
                <Button type="button" variant="outline" onClick={handleGenerate}>
                  Generate
                </Button>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Unique identifier for this intake (e.g., IN-20241228-001)
              </p>
            </div>
            
            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes about this intake..."
                rows={4}
              />
            </div>
            
            <div className="flex gap-4">
              <Button type="submit" disabled={loading}>
                {loading ? 'Creating...' : 'Create Intake'}
              </Button>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => router.back()}
                disabled={loading}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

