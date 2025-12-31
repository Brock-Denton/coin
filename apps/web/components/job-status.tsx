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
  const [workerOnline, setWorkerOnline] = useState<boolean | null>(null)
  const [currentTime, setCurrentTime] = useState(Date.now())
  const supabase = createClient()

  // Update current time every second for real-time elapsed time display
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now())
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Check worker availability
  useEffect(() => {
    const checkWorker = async () => {
      try {
        // Check for workers with heartbeats within the last 2 minutes
        // Use gte (greater than or equal) to be more inclusive and handle edge cases
        const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()
        const { data: workers, error } = await supabase
          .from('worker_heartbeats')
          .select('worker_id, last_seen_at')
          .gte('last_seen_at', twoMinutesAgo)
          .limit(1)
        
        if (error) {
          console.error('Error checking worker availability:', error)
          setWorkerOnline(false)
          return
        }
        
        const isOnline = workers && workers.length > 0
        setWorkerOnline(isOnline)
        
        // Log for debugging
        if (!isOnline) {
          console.debug('No workers found online. Last check:', twoMinutesAgo, 'Workers found:', workers)
        }
      } catch (err) {
        console.error('Error checking worker availability:', err)
        setWorkerOnline(false)
      }
    }
    
    checkWorker()
    const interval = setInterval(checkWorker, 30000) // Check every 30 seconds
    return () => clearInterval(interval)
  }, [supabase])

  // Filter jobs by jobType if provided
  const filteredJobs = jobType 
    ? jobs.filter((job: any) => job.job_type === jobType)
    : jobs

  // Initialize jobs from filtered props, but filter out old failed jobs when new jobs exist
  useEffect(() => {
    // Always filter to show only the most recent batch of jobs
    // This hides old failed jobs when new jobs are queued (even if they're not active yet)
    if (filteredJobs.length === 0) {
      setCurrentJobs([])
      return
    }
    
    // Find the most recent job (any status)
    const sortedJobs = [...filteredJobs].sort((a: any, b: any) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    const mostRecentJob = sortedJobs[0]
    
    // Show only jobs from the same batch (created within 5 minutes of the most recent job)
    // This ensures old failed jobs are hidden when new jobs are queued
    const batchTime = new Date(mostRecentJob.created_at).getTime()
    const batchJobs = filteredJobs.filter((job: any) => {
      const jobTime = new Date(job.created_at).getTime()
      const timeDiff = Math.abs(jobTime - batchTime)
      return timeDiff < 300000 // Within 5 minutes (allows for staggered job creation)
    })
    
    setCurrentJobs(batchJobs)
  }, [filteredJobs])

  // Poll for job updates - more frequently when pending (2s) vs running (3s)
  useEffect(() => {
    const hasActiveJobs = currentJobs.some((job: any) => 
      job.status === 'pending' || job.status === 'running'
    )

    if (!hasActiveJobs) {
      setIsPolling(false)
      return
    }

    setIsPolling(true)
    const hasPendingJobs = currentJobs.some((job: any) => job.status === 'pending')
    // Poll every 2 seconds if pending (to detect when they start), 3 seconds if running
    const pollInterval = hasPendingJobs ? 2000 : 3000
    
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
    }, pollInterval)

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
        return <Loader2 className="h-6 w-6 text-blue-600 animate-spin" />
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
    return (currentTime - new Date(job.started_at).getTime()) / 1000 / 60
  }

  const getElapsedTime = (startTime: string | null) => {
    if (!startTime) return null
    const elapsed = currentTime - new Date(startTime).getTime()
    const minutes = Math.floor(elapsed / 60000)
    const seconds = Math.floor((elapsed % 60000) / 1000)
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`
    }
    return `${seconds}s`
  }

  const getTimeInQueue = (createdAt: string) => {
    const elapsed = currentTime - new Date(createdAt).getTime()
    const minutes = Math.floor(elapsed / 60000)
    const seconds = Math.floor((elapsed % 60000) / 1000)
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`
    }
    return `${seconds}s`
  }

  const getEstimatedTimeRemaining = (elapsedSeconds: number) => {
    // Typical job duration is 2-5 minutes (120-300 seconds)
    // If elapsed < 2 minutes, estimate 2-5 minutes total
    // If elapsed > 2 minutes, estimate 5 minutes total
    const typicalMin = 120
    const typicalMax = 300
    if (elapsedSeconds < typicalMin) {
      return `~${Math.max(0, typicalMin - elapsedSeconds)}-${typicalMax - elapsedSeconds}s remaining`
    }
    return `~${Math.max(0, typicalMax - elapsedSeconds)}s remaining`
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

  // Detect stuck jobs: running > 10 minutes OR pending > 2 minutes with no worker
  const stuckRunningJobs = currentJobs.filter((job: any) => {
    if (job.status !== 'running') return false
    return getJobRuntimeMinutes(job) > 10
  })
  
  const stuckPendingJobs = currentJobs.filter((job: any) => {
    if (job.status !== 'pending') return false
    const pendingMinutes = (currentTime - new Date(job.created_at).getTime()) / 1000 / 60
    return pendingMinutes > 2 && workerOnline === false
  })
  
  const stuckJobs = [...stuckRunningJobs, ...stuckPendingJobs]
  const hasStuckJobs = stuckJobs.length > 0
  const maxRuntimeMinutes = stuckRunningJobs.length > 0 
    ? Math.max(...stuckRunningJobs.map((job: any) => getJobRuntimeMinutes(job)))
    : 0
  const maxPendingMinutes = stuckPendingJobs.length > 0
    ? Math.max(...stuckPendingJobs.map((job: any) => 
        (currentTime - new Date(job.created_at).getTime()) / 1000 / 60
      ))
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
                ? currentJobs.some((j: any) => j.status === 'running')
                  ? 'Jobs are running. Typically takes 2-5 minutes to complete.'
                  : 'Jobs queued. Waiting for worker to pick them up...'
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
            <span className="font-medium">Overall Progress</span>
            <span className="text-muted-foreground">
              {currentJobs.filter((j: any) => j.status === 'succeeded' || j.status === 'failed').length} / {currentJobs.length} completed
            </span>
          </div>
          <Progress value={getProgressValue()} className="h-2" />
          {hasActiveJobs && (
            <div className="text-xs text-muted-foreground">
              {currentJobs.filter((j: any) => j.status === 'running').length > 0 && (
                <span className="text-blue-600 dark:text-blue-400">
                  {currentJobs.filter((j: any) => j.status === 'running').length} running
                </span>
              )}
              {currentJobs.filter((j: any) => j.status === 'running').length > 0 && currentJobs.filter((j: any) => j.status === 'pending').length > 0 && ' • '}
              {currentJobs.filter((j: any) => j.status === 'pending').length > 0 && (
                <span className="text-muted-foreground">
                  {currentJobs.filter((j: any) => j.status === 'pending').length} pending
                </span>
              )}
            </div>
          )}
        </div>

        {/* Job List */}
        <div className="space-y-2">
          {currentJobs.map((job: any) => {
            const canCancel = (job.status === 'pending' || job.status === 'running') && !cancellingJobId
            const elapsedTime = job.status === 'running' && job.started_at ? getElapsedTime(job.started_at) : null
            const timeInQueue = job.status === 'pending' ? getTimeInQueue(job.created_at) : null
            const estimatedRemaining = job.status === 'running' && job.started_at 
              ? getEstimatedTimeRemaining((currentTime - new Date(job.started_at).getTime()) / 1000)
              : null
            const isStuck = stuckJobs.some((sj: any) => sj.id === job.id)
            
            return (
              <div 
                key={job.id} 
                className={`flex items-center justify-between p-3 border rounded-lg transition-all ${
                  job.status === 'running' 
                    ? 'border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-950/50 shadow-sm' 
                    : job.status === 'pending'
                    ? 'border-gray-200 dark:border-gray-800'
                    : ''
                } ${isStuck ? 'border-yellow-300 dark:border-yellow-700 bg-yellow-50/50 dark:bg-yellow-950/50' : ''}`}
              >
                <div className="flex items-center gap-3 flex-1">
                  <div className={job.status === 'running' ? 'relative flex items-center justify-center' : ''}>
                    {getStatusIcon(job.status)}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">{job.sources?.name || 'Unknown Source'}</div>
                    {job.error_message && (
                      <div className="text-sm text-red-600 mt-1">{job.error_message}</div>
                    )}
                    {job.status === 'running' && elapsedTime && (
                      <div className="text-sm font-medium text-blue-700 dark:text-blue-300 mt-1 flex items-center gap-2">
                        <span>Running for {elapsedTime}</span>
                        {estimatedRemaining && (
                          <span className="text-xs font-normal text-muted-foreground">• {estimatedRemaining}</span>
                        )}
                      </div>
                    )}
                    {job.status === 'pending' && timeInQueue && (
                      <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
                        <span>In queue for {timeInQueue}</span>
                        {workerOnline === false && (
                          <span className="text-yellow-600 dark:text-yellow-400 font-medium">⚠ No worker online</span>
                        )}
                        {workerOnline === true && parseFloat(timeInQueue.replace(/[^0-9.]/g, '')) > 0.5 && (
                          <span className="text-blue-600 dark:text-blue-400">Worker should pick up soon...</span>
                        )}
                      </div>
                    )}
                    {job.started_at && job.status !== 'running' && (
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

        {/* Stuck Jobs Warning */}
        {hasStuckJobs && (
          <Alert variant="destructive" className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <AlertDescription className="text-yellow-900 dark:text-yellow-100">
              {stuckRunningJobs.length > 0 && (
                <div>
                  <strong>Job timeout detected.</strong> One or more jobs have been running for {Math.round(maxRuntimeMinutes)} minutes. 
                  This may indicate an issue. Check worker logs or try re-running the job.
                </div>
              )}
              {stuckPendingJobs.length > 0 && (
                <div className={stuckRunningJobs.length > 0 ? 'mt-2' : ''}>
                  <strong>Jobs stuck in queue.</strong> {stuckPendingJobs.length} job(s) have been pending for {Math.round(maxPendingMinutes)} minutes. 
                  {workerOnline === false 
                    ? ' No workers are online. Start the worker service to process jobs.'
                    : ' Worker may not be processing jobs. Check worker status.'}
                </div>
              )}
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
              {currentJobs.some((j: any) => j.status === 'pending') && (
                <span>
                  <strong>Jobs queued.</strong> Worker will pick them up in ~5-10 seconds. 
                </span>
              )}
              {currentJobs.some((j: any) => j.status === 'running') && (
                <span>
                  <strong>Jobs are processing.</strong> This typically takes 2-5 minutes. 
                </span>
              )}
              The page will automatically update when jobs complete. You can leave and come back later.
            </p>
          </div>
        )}

        {allCompleted && (
          <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <p className="text-sm text-green-900 dark:text-green-100">
                <strong>All jobs completed!</strong> Check the Price Points table below to see the collected data.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

