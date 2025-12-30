'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { RefreshCw, CheckCircle2, XCircle, Clock, Loader2, AlertTriangle, X } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface JobStatusProps {
  intakeId: string
  jobs: any[]
  pricePoints?: any[] // Optional: for detecting "no results" scenarios
  onRefresh?: () => void
  jobType?: string // Optional: filter by job type ('pricing' or 'grading')
}

export function JobStatus({ intakeId, jobs, pricePoints = [], onRefresh, jobType }: JobStatusProps) {
  const [currentJobs, setCurrentJobs] = useState(jobs)
  const [isPolling, setIsPolling] = useState(false)
  const [cancellingJobId, setCancellingJobId] = useState<string | null>(null)
  const supabase = createClient()

  // Filter jobs by jobType if provided
  const filteredJobs = jobType 
    ? jobs.filter((job: any) => job.job_type === jobType)
    : jobs

  // Initialize jobs from filtered props
  useEffect(() => {
    setCurrentJobs(filteredJobs)
  }, [filteredJobs])

  // Poll for job updates every 3 seconds if there are pending/running jobs
  useEffect(() => {
    const hasActiveJobs = currentJobs.some((job: any) => 
      job.status === 'pending' || job.status === 'running'
    )

    if (!hasActiveJobs) {
      setIsPolling(false)
      return
    }

    setIsPolling(true)
    const interval = setInterval(async () => {
      let query = supabase
        .from('scrape_jobs')
        .select('*, sources(name)')
        .eq('intake_id', intakeId)
      
      if (jobType) {
        query = query.eq('job_type', jobType)
      }
      
      const { data: updatedJobs } = await query
        .order('created_at', { ascending: false })
      
      if (updatedJobs) {
        setCurrentJobs(updatedJobs)
        const stillHasActiveJobs = updatedJobs.some((job: any) => 
          job.status === 'pending' || job.status === 'running'
        )
        if (!stillHasActiveJobs) {
          setIsPolling(false)
          if (onRefresh) {
            onRefresh()
          }
        }
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [intakeId, currentJobs.length, supabase, onRefresh, jobType])

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'succeeded':
        return <Badge variant="default" className="bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" /> Completed</Badge>
      case 'running':
        return <Badge variant="default" className="bg-blue-600"><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Running</Badge>
      case 'pending':
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" /> Pending</Badge>
      case 'failed':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> Failed</Badge>
      case 'retryable':
        return <Badge variant="default" className="bg-yellow-600"><Clock className="h-3 w-3 mr-1" /> Retryable</Badge>
      case 'cancelled':
        return <Badge variant="outline">Cancelled</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'succeeded':
        return <CheckCircle2 className="h-5 w-5 text-green-600" />
      case 'running':
        return <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
      case 'pending':
        return <Clock className="h-5 w-5 text-muted-foreground" />
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-600" />
      case 'retryable':
        return <Clock className="h-5 w-5 text-yellow-600" />
      default:
        return <Clock className="h-5 w-5 text-muted-foreground" />
    }
  }

  const getJobRuntimeMinutes = (job: any) => {
    if (!job.started_at || job.status !== 'running') return 0
    return (Date.now() - new Date(job.started_at).getTime()) / 1000 / 60
  }

  const getProgressValue = () => {
    if (currentJobs.length === 0) return 0
    const completed = currentJobs.filter((j: any) => 
      j.status === 'succeeded' || j.status === 'failed'
    ).length
    return (completed / currentJobs.length) * 100
  }

  const hasActiveJobs = currentJobs.some((job: any) => 
    job.status === 'pending' || job.status === 'running'
  )

  const stuckJobs = currentJobs.filter((job: any) => getJobRuntimeMinutes(job) > 10)
  const hasStuckJobs = stuckJobs.length > 0
  const maxRuntimeMinutes = stuckJobs.length > 0 
    ? Math.max(...stuckJobs.map((job: any) => getJobRuntimeMinutes(job)))
    : 0

  const allCompleted = currentJobs.length > 0 && currentJobs.every((job: any) => 
    job.status === 'succeeded' || job.status === 'failed'
  )

  // Check for succeeded jobs with no price points
  const hasNoResultsJobs = currentJobs.some((job: any) => {
    if (job.status !== 'succeeded') return false
    const jobPricePoints = pricePoints.filter((pp: any) => pp.job_id === job.id)
    return jobPricePoints.length === 0
  })

  const handleCancelJob = async (jobId: string) => {
    if (!confirm('Are you sure you want to cancel this job?')) {
      return
    }

    setCancellingJobId(jobId)
    try {
      const { error } = await supabase
        .from('scrape_jobs')
        .update({
          status: 'failed',
          error_message: 'Job cancelled by user',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', jobId)
        .in('status', ['pending', 'running']) // Only allow cancelling pending/running jobs

      if (error) throw error

      // Refresh jobs to show updated status
      const { data: updatedJobs } = await supabase
        .from('scrape_jobs')
        .select('*, sources(name)')
        .eq('intake_id', intakeId)
        .order('created_at', { ascending: false })

      if (updatedJobs) {
        setCurrentJobs(updatedJobs)
      }

      if (onRefresh) {
        onRefresh()
      }
    } catch (err: any) {
      console.error('Error cancelling job:', err)
      alert(`Failed to cancel job: ${err.message}`)
    } finally {
      setCancellingJobId(null)
    }
  }

  if (currentJobs.length === 0) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Pricing Jobs</CardTitle>
            <CardDescription>
              {hasActiveJobs 
                ? 'Jobs are running. This may take a few minutes. You can check back later.'
                : allCompleted
                ? 'All jobs completed'
                : 'Job status'}
            </CardDescription>
          </div>
          {isPolling && (
            <Badge variant="outline" className="flex items-center gap-1">
              <RefreshCw className="h-3 w-3 animate-spin" />
              Updating...
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Overall Progress</span>
            <span>{currentJobs.filter((j: any) => j.status === 'succeeded' || j.status === 'failed').length} / {currentJobs.length}</span>
          </div>
          <Progress value={getProgressValue()} />
        </div>

        {/* Job List */}
        <div className="space-y-2">
          {currentJobs.map((job: any) => {
            const canCancel = (job.status === 'pending' || job.status === 'running') && !cancellingJobId
            return (
              <div key={job.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  {getStatusIcon(job.status)}
                  <div>
                    <div className="font-medium">{job.sources?.name || 'Unknown Source'}</div>
                    {job.error_message && (
                      <div className="text-sm text-red-600 mt-1">{job.error_message}</div>
                    )}
                    {job.started_at && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Started: {new Date(job.started_at).toLocaleString()}
                      </div>
                    )}
                    {job.completed_at && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Completed: {new Date(job.completed_at).toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusBadge(job.status)}
                  {canCancel && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCancelJob(job.id)}
                      disabled={cancellingJobId === job.id}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                    >
                      <X className="h-3 w-3 mr-1" />
                      {cancellingJobId === job.id ? 'Cancelling...' : 'Cancel'}
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Timeout Warning */}
        {hasStuckJobs && (
          <Alert variant="destructive" className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <AlertDescription className="text-yellow-900 dark:text-yellow-100">
              <strong>Job timeout detected.</strong> One or more jobs have been running for {Math.round(maxRuntimeMinutes)} minutes. 
              This may indicate an issue. Check worker logs or try re-running the job.
            </AlertDescription>
          </Alert>
        )}

        {/* No Results Warning */}
        {hasNoResultsJobs && !hasActiveJobs && (
          <Alert className="border-blue-500 bg-blue-50 dark:bg-blue-950">
            <AlertTriangle className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-900 dark:text-blue-100">
              <strong>No matching listings found.</strong> One or more jobs completed successfully but found no matching listings. 
              Try adjusting your search criteria (year, denomination, series, etc.) or check the search query.
            </AlertDescription>
          </Alert>
        )}

        {hasActiveJobs && !hasStuckJobs && (
          <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-sm text-blue-900 dark:text-blue-100">
              <strong>Jobs are processing.</strong> This typically takes 2-5 minutes. 
              The page will automatically update when jobs complete. You can leave and come back later.
            </p>
          </div>
        )}

        {allCompleted && (
          <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
            <p className="text-sm text-green-900 dark:text-green-100">
              <strong>All jobs completed!</strong> Check the Price Points table below to see the collected data.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

