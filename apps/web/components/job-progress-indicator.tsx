'use client'

import { useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface JobProgressIndicatorProps {
  jobs: any[]
  jobType?: string // Optional: filter by job type ('pricing' or 'grading')
}

export function JobProgressIndicator({ jobs, jobType }: JobProgressIndicatorProps) {
  // Filter jobs by jobType if provided
  const filteredJobs = useMemo(() => {
    return jobType 
      ? jobs.filter((job: any) => job.job_type === jobType)
      : jobs
  }, [jobs, jobType])

  // Calculate progress
  const progress = useMemo(() => {
    if (filteredJobs.length === 0) return 0
    const completed = filteredJobs.filter((j: any) => 
      j.status === 'succeeded' || j.status === 'failed'
    ).length
    return (completed / filteredJobs.length) * 100
  }, [filteredJobs])

  // Determine current state
  const state = useMemo(() => {
    const hasPending = filteredJobs.some((j: any) => j.status === 'pending')
    const hasRunning = filteredJobs.some((j: any) => j.status === 'running')
    const allCompleted = filteredJobs.length > 0 && filteredJobs.every((j: any) => 
      j.status === 'succeeded' || j.status === 'failed'
    )
    const hasFailed = filteredJobs.some((j: any) => j.status === 'failed')

    if (hasFailed && allCompleted) return 'failed'
    if (allCompleted) return 'completed'
    if (hasRunning) return 'running'
    if (hasPending) return 'queued'
    return 'idle'
  }, [filteredJobs])

  // Get status display
  const statusDisplay = useMemo(() => {
    const runningCount = filteredJobs.filter((j: any) => j.status === 'running').length
    const pendingCount = filteredJobs.filter((j: any) => j.status === 'pending').length
    const completedCount = filteredJobs.filter((j: any) => j.status === 'succeeded' || j.status === 'failed').length

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
          text: `Completed! (${completedCount}/${filteredJobs.length})`,
          icon: CheckCircle2,
          color: 'text-green-600 dark:text-green-400',
          bgColor: 'bg-green-50 dark:bg-green-950',
          borderColor: 'border-green-200 dark:border-green-800',
          progressColor: 'bg-green-600'
        }
      case 'failed':
        return {
          text: `Failed (${filteredJobs.filter((j: any) => j.status === 'failed').length}/${filteredJobs.length})`,
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
  }, [state, filteredJobs, progress])

  // Don't show if no jobs and no active state
  // But we'll let the parent handle showing a message when queuing
  if (filteredJobs.length === 0) {
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
              {filteredJobs.filter((j: any) => j.status === 'succeeded' || j.status === 'failed').length} of {filteredJobs.length} jobs completed
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
