'use client'

import { useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface JobProgressIndicatorProps {
  jobs: any[]
  jobType?: string // Optional: filter by job type ('pricing' or 'grading')
  queuedCount?: number | null // Optional: number of jobs just queued (to show progress immediately)
}

export function JobProgressIndicator({ jobs, jobType, queuedCount }: JobProgressIndicatorProps) {
  // Filter jobs by jobType if provided
  const filteredJobs = useMemo(() => {
    return jobType 
      ? jobs.filter((job: any) => job.job_type === jobType)
      : jobs
  }, [jobs, jobType])

  // If jobs are queued but not yet in the array, create placeholder jobs
  const jobsWithQueued = useMemo(() => {
    if (queuedCount && queuedCount > 0 && filteredJobs.length === 0) {
      // Create placeholder jobs to show progress
      return Array(queuedCount).fill(null).map((_, i) => ({
        id: `queued-${i}`,
        status: 'pending',
        job_type: jobType || 'pricing',
        created_at: new Date().toISOString()
      }))
    }
    return filteredJobs
  }, [filteredJobs, queuedCount, jobType])

  // Calculate progress - only count completed jobs, exclude running/pending from denominator
  const progress = useMemo(() => {
    if (jobsWithQueued.length === 0) return 0
    const completed = jobsWithQueued.filter((j: any) => 
      j.status === 'succeeded' || j.status === 'failed'
    ).length
    const total = jobsWithQueued.length
    // Only show progress based on completed jobs - running jobs don't contribute to progress yet
    // This gives a more accurate representation: if 3 of 4 are done, show 75%, not counting the running one
    return total > 0 ? (completed / total) * 100 : 0
  }, [jobsWithQueued])

  // Determine current state
  const state = useMemo(() => {
    const hasPending = jobsWithQueued.some((j: any) => j.status === 'pending')
    const hasRunning = jobsWithQueued.some((j: any) => j.status === 'running')
    const allCompleted = jobsWithQueued.length > 0 && jobsWithQueued.every((j: any) => 
      j.status === 'succeeded' || j.status === 'failed'
    )
    const hasFailed = jobsWithQueued.some((j: any) => j.status === 'failed')

    if (hasFailed && allCompleted) return 'failed'
    if (allCompleted) return 'completed'
    if (hasRunning) return 'running'
    if (hasPending) return 'queued'
    return 'idle'
  }, [jobsWithQueued])

  // Get status display
  const statusDisplay = useMemo(() => {
    const runningCount = jobsWithQueued.filter((j: any) => j.status === 'running').length
    const pendingCount = jobsWithQueued.filter((j: any) => j.status === 'pending').length
    const completedCount = jobsWithQueued.filter((j: any) => j.status === 'succeeded' || j.status === 'failed').length

    switch (state) {
      case 'queued':
        return {
          text: pendingCount > 0 ? `Queued (${pendingCount}) - waiting for worker...` : 'Queued',
          icon: Clock,
          color: 'text-blue-600 dark:text-blue-400',
          bgColor: 'bg-blue-50 dark:bg-blue-950',
          borderColor: 'border-blue-200 dark:border-blue-800',
          progressColor: 'bg-blue-600'
        }
      case 'running':
        return {
          text: runningCount > 0 ? `Running (${runningCount}) - ${Math.round(progress)}% complete...` : `Running - ${Math.round(progress)}% complete...`,
          icon: Loader2,
          color: 'text-yellow-600 dark:text-yellow-400',
          bgColor: 'bg-yellow-50 dark:bg-yellow-950',
          borderColor: 'border-yellow-200 dark:border-yellow-800',
          progressColor: 'bg-yellow-600'
        }
      case 'completed':
        return {
          text: `Completed! (${completedCount}/${jobsWithQueued.length})`,
          icon: CheckCircle2,
          color: 'text-green-600 dark:text-green-400',
          bgColor: 'bg-green-50 dark:bg-green-950',
          borderColor: 'border-green-200 dark:border-green-800',
          progressColor: 'bg-green-600'
        }
      case 'failed':
        return {
          text: `Failed (${jobsWithQueued.filter((j: any) => j.status === 'failed').length}/${jobsWithQueued.length})`,
          icon: XCircle,
          color: 'text-red-600 dark:text-red-400',
          bgColor: 'bg-red-50 dark:bg-red-950',
          borderColor: 'border-red-200 dark:border-red-800',
          progressColor: 'bg-red-600'
        }
      default:
        return {
          text: 'No jobs',
          icon: Clock,
          color: 'text-muted-foreground',
          bgColor: 'bg-muted',
          borderColor: 'border-border',
          progressColor: 'bg-muted-foreground'
        }
    }
  }, [state, jobsWithQueued, progress])

  // Don't show if no jobs and no queued count
  if (jobsWithQueued.length === 0 && !queuedCount) {
    return null
  }

  const StatusIcon = statusDisplay.icon
  const isActive = state === 'queued' || state === 'running'
  const showProgress = state !== 'idle'

  return (
    <div className={cn(
      'rounded-lg border p-4 transition-all',
      statusDisplay.bgColor,
      statusDisplay.borderColor,
      isActive && 'animate-pulse'
    )}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <StatusIcon className={cn('h-5 w-5', statusDisplay.color, state === 'running' && 'animate-spin')} />
          <span className={cn('font-medium text-sm', statusDisplay.color)}>
            {statusDisplay.text}
          </span>
        </div>
        <Badge 
          variant={state === 'completed' ? 'default' : state === 'failed' ? 'destructive' : 'secondary'}
          className={cn(
            state === 'completed' && 'bg-green-600',
            state === 'running' && 'bg-yellow-600',
            state === 'queued' && 'bg-blue-600'
          )}
        >
          {Math.round(progress)}%
        </Badge>
      </div>
      {showProgress && (
        <div className="space-y-1">
          <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                'h-full transition-all duration-300',
                statusDisplay.progressColor,
                state === 'running' && 'animate-pulse'
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {jobsWithQueued.filter((j: any) => j.status === 'succeeded' || j.status === 'failed').length} of {jobsWithQueued.length} jobs completed
            </span>
            {state === 'running' && (
              <span>Processing...</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
