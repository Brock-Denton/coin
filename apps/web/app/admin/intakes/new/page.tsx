'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { IntakeWorkflowInfo } from '@/components/intake-workflow-info'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { InfoIcon, AlertCircle } from 'lucide-react'

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
  
  const getErrorMessage = (error: any): string => {
    if (!error) return 'An unexpected error occurred'
    
    // Handle specific error codes
    if (error.code === '23505') {
      return 'This intake number already exists. Please use a different number or click "Generate" to create a new one.'
    }
    
    if (error.code === 'PGRST301' || error.message?.includes('permission denied')) {
      return 'You do not have permission to create intakes. Please contact an administrator.'
    }
    
    if (error.message?.includes('infinite recursion')) {
      return 'Database configuration error. Please contact support if this persists.'
    }
    
    if (error.message?.includes('network') || error.message?.includes('fetch')) {
      return 'Network error. Please check your connection and try again.'
    }
    
    // Return user-friendly message or fallback to original
    return error.message || 'Failed to create intake. Please try again.'
  }
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    
    try {
      if (!intakeNumber.trim()) {
        setError('Intake number is required. Please enter a number or click "Generate" to create one automatically.')
        setLoading(false)
        return
      }
      
      // Validate intake number format
      const intakeNumberPattern = /^IN-\d{8}-\d{3}$/
      if (!intakeNumberPattern.test(intakeNumber.trim())) {
        setError('Invalid intake number format. Please use format: IN-YYYYMMDD-XXX (e.g., IN-20241228-001) or click "Generate".')
        setLoading(false)
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
        setError(getErrorMessage(insertError))
        setLoading(false)
        return
      }
      
      if (data) {
        router.push(`/admin/intakes/${data.id}`)
        router.refresh()
      }
    } catch (err: any) {
      setError(getErrorMessage(err))
      setLoading(false)
    }
  }
  
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-bold mb-2">New Intake</h1>
        <p className="text-muted-foreground">
          Create a new intake record for a physical coin you're adding to inventory
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Intake Details</CardTitle>
              <CardDescription>
                An intake represents a physical coin you're cataloging. After creating the intake, you'll be able to upload photos, add coin details (attribution), run pricing analysis, and eventually create a product listing.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
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
                      disabled={loading}
                    />
                    <Button type="button" variant="outline" onClick={handleGenerate} disabled={loading}>
                      Generate
                    </Button>
                  </div>
                  <div className="mt-2 space-y-1">
                    <p className="text-sm text-muted-foreground">
                      Unique identifier for this intake. Format: <code className="text-xs bg-muted px-1 py-0.5 rounded">IN-YYYYMMDD-XXX</code>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Example: <code className="text-xs bg-muted px-1 py-0.5 rounded">IN-20241228-001</code> (Intake from December 28, 2024, sequence 001)
                    </p>
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Optional notes about this intake (e.g., where you acquired it, condition notes, etc.)"
                    rows={4}
                    disabled={loading}
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    These notes are for your reference and won't appear on the public product page
                  </p>
                </div>
                
                <div className="flex gap-4 pt-2">
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

          <Alert>
            <InfoIcon className="h-4 w-4" />
            <AlertTitle>What happens next?</AlertTitle>
            <AlertDescription>
              After creating the intake, you'll be taken to the intake detail page where you can:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Upload photos of the coin (obverse and reverse)</li>
                <li>Add attribution details (year, mintmark, denomination, grade, etc.)</li>
                <li>Run pricing analysis to get market valuations</li>
                <li>Create a product listing for the storefront</li>
              </ul>
            </AlertDescription>
          </Alert>
        </div>

        <div>
          <IntakeWorkflowInfo currentStep="intake" />
        </div>
      </div>
    </div>
  )
}

