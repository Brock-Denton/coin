'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { SearchQueries } from '@/components/search-queries'
import { JobStatus } from '@/components/job-status'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Trash2 } from 'lucide-react'

interface IntakeDetailProps {
  intake: any
  pricePoints: any[]
  jobs: any[]
}

export function IntakeDetail({ intake, pricePoints, jobs }: IntakeDetailProps) {
  const [loading, setLoading] = useState(false)
  const [attribution, setAttribution] = useState(intake.attributions?.[0] || {})
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const router = useRouter()
  const supabase = createClient()
  
  const handleRunPricing = async () => {
    setLoading(true)
    try {
      // Get enabled sources
      const { data: sources } = await supabase
        .from('sources')
        .select('id')
        .eq('enabled', true)
      
      if (!sources || sources.length === 0) {
        alert('No enabled sources found')
        return
      }
      
      // Create scrape jobs for each enabled source
      const jobs = sources.map((source: any) => ({
        intake_id: intake.id,
        source_id: source.id,
        status: 'pending',
        query_params: {
          year: attribution.year,
          mintmark: attribution.mintmark,
          denomination: attribution.denomination,
          series: attribution.series,
          title: attribution.title,
        }
      }))
      
      const { error } = await supabase
        .from('scrape_jobs')
        .insert(jobs)
      
      if (error) {
        alert(`Error creating jobs: ${error.message}`)
      } else {
        alert('Pricing jobs created successfully')
        router.refresh()
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }
  
  const handleDeleteIntake = async () => {
    setDeleting(true)
    try {
      const { error } = await supabase
        .from('coin_intakes')
        .delete()
        .eq('id', intake.id)
      
      if (error) throw error
      
      // Redirect to intakes list
      router.push('/admin/intakes')
    } catch (err: any) {
      alert(`Error deleting intake: ${err.message}`)
      setDeleting(false)
    }
  }

  const handleSaveAttribution = async () => {
    setLoading(true)
    try {
      if (attribution.id) {
        // Update
        const { error } = await supabase
          .from('attributions')
          .update(attribution)
          .eq('id', attribution.id)
        
        if (error) throw error
      } else {
        // Create
        const { error } = await supabase
          .from('attributions')
          .insert({ ...attribution, intake_id: intake.id })
        
        if (error) throw error
      }
      
      alert('Attribution saved')
      router.refresh()
    } catch (err: any) {
      alert(`Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }
  
  const getImageUrl = (storagePath: string) => {
    const { data } = supabase.storage
      .from('coin-media')
      .getPublicUrl(storagePath)
    return data.publicUrl
  }
  
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, mediaType: string) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    setLoading(true)
    try {
      // Upload to Supabase Storage
      const fileExt = file.name.split('.').pop()
      const fileName = `${intake.id}/${mediaType}-${Date.now()}.${fileExt}`
      const filePath = fileName
      
      const { error: uploadError } = await supabase.storage
        .from('coin-media')
        .upload(filePath, file)
      
      if (uploadError) throw uploadError
      
      // Create media record (storage_path is the path in the bucket)
      const { error: insertError } = await supabase
        .from('coin_media')
        .insert({
          intake_id: intake.id,
          media_type: mediaType,
          storage_path: filePath,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type,
        })
      
      if (insertError) throw insertError
      
      alert('File uploaded successfully')
      router.refresh()
    } catch (err: any) {
      alert(`Error uploading file: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }
  
  const valuation = intake.valuations?.[0]
  const images = intake.coin_media || []
  const obverseImage = images.find((img: any) => img.media_type === 'obverse')
  const reverseImage = images.find((img: any) => img.media_type === 'reverse')
  
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold mb-2">{intake.intake_number}</h1>
          <Badge>{intake.status}</Badge>
        </div>
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="destructive" size="sm">
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Intake
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Intake</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete intake <strong>{intake.intake_number}</strong>? 
                This will permanently delete the intake and all associated data including:
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>Photos and media</li>
                  <li>Attribution data</li>
                  <li>Price points and valuations</li>
                  <li>Scrape jobs and logs</li>
                  <li>Manual search results</li>
                </ul>
                <strong className="block mt-3 text-destructive">This action cannot be undone.</strong>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeleteDialogOpen(false)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteIntake}
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      
      {/* Images */}
      <Card>
        <CardHeader>
          <CardTitle>Images</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div>
            <Label>Obverse</Label>
            {obverseImage ? (
              <div className="mt-2 aspect-square relative bg-muted rounded overflow-hidden">
                <img
                  src={getImageUrl(obverseImage.storage_path)}
                  alt="Obverse"
                  className="object-cover w-full h-full"
                />
              </div>
            ) : (
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => handleFileUpload(e, 'obverse')}
                disabled={loading}
                className="mt-2"
              />
            )}
          </div>
          <div>
            <Label>Reverse</Label>
            {reverseImage ? (
              <div className="mt-2 aspect-square relative bg-muted rounded overflow-hidden">
                <img
                  src={getImageUrl(reverseImage.storage_path)}
                  alt="Reverse"
                  className="object-cover w-full h-full"
                />
              </div>
            ) : (
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => handleFileUpload(e, 'reverse')}
                disabled={loading}
                className="mt-2"
              />
            )}
          </div>
        </CardContent>
      </Card>
      
      {/* Attribution */}
      <Card>
        <CardHeader>
          <CardTitle>Attribution</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Denomination</Label>
              <Select
                value={attribution.denomination || ''}
                onValueChange={(value) => setAttribution({ ...attribution, denomination: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="penny">Penny</SelectItem>
                  <SelectItem value="nickel">Nickel</SelectItem>
                  <SelectItem value="dime">Dime</SelectItem>
                  <SelectItem value="quarter">Quarter</SelectItem>
                  <SelectItem value="half_dollar">Half Dollar</SelectItem>
                  <SelectItem value="dollar">Dollar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Year</Label>
              <Input
                type="number"
                value={attribution.year || ''}
                onChange={(e) => setAttribution({ ...attribution, year: parseInt(e.target.value) || null })}
              />
            </div>
            <div>
              <Label>Mintmark</Label>
              <Input
                value={attribution.mintmark || ''}
                onChange={(e) => setAttribution({ ...attribution, mintmark: e.target.value })}
              />
            </div>
            <div>
              <Label>Grade</Label>
              <Input
                value={attribution.grade || ''}
                onChange={(e) => setAttribution({ ...attribution, grade: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label>Title/Keywords</Label>
            <Input
              value={attribution.title || ''}
              onChange={(e) => setAttribution({ ...attribution, title: e.target.value })}
              placeholder="US coin keywords for search"
            />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea
              value={attribution.notes || ''}
              onChange={(e) => setAttribution({ ...attribution, notes: e.target.value })}
            />
          </div>
          <Button onClick={handleSaveAttribution} disabled={loading}>
            Save Attribution
          </Button>
        </CardContent>
      </Card>
      
      {/* Search Queries (Optional) */}
      <SearchQueries attribution={attribution} />
      
      {/* Pricing */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Pricing</CardTitle>
              <CardDescription>Run pricing jobs and view results</CardDescription>
            </div>
            <Button onClick={handleRunPricing} disabled={loading}>
              Run Pricing
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Job Status */}
          <JobStatus intakeId={intake.id} jobs={jobs} onRefresh={() => router.refresh()} />
          
          {valuation && (
            <div className="p-4 bg-muted rounded-lg">
              <h3 className="font-semibold mb-2">Valuation</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">Median Price</div>
                  <div className="text-2xl font-bold">
                    {valuation.price_cents_median ? `$${(valuation.price_cents_median / 100).toFixed(2)}` : 'N/A'}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Confidence</div>
                  <div className="text-2xl font-bold">{valuation.confidence_score}/10</div>
                </div>
              </div>
              {valuation.explanation && (
                <p className="mt-4 text-sm">{valuation.explanation}</p>
              )}
            </div>
          )}
          
          <div>
            <h3 className="font-semibold mb-2">Price Points ({pricePoints.length})</h3>
            {pricePoints.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border rounded-lg">
                <p>No price points collected yet. Run pricing jobs to collect data.</p>
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Source</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Listing</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pricePoints.map((pp: any) => (
                      <TableRow key={pp.id}>
                        <TableCell>{pp.sources?.name || 'Unknown'}</TableCell>
                        <TableCell>${(pp.price_cents / 100).toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge variant={pp.price_type === 'sold' ? 'default' : 'secondary'}>
                            {pp.price_type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {pp.listing_date ? new Date(pp.listing_date).toLocaleDateString() : 'N/A'}
                        </TableCell>
                        <TableCell>
                          {pp.listing_url && (
                            <a href={pp.listing_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                              View
                            </a>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

