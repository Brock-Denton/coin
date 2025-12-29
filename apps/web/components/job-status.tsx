'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { RefreshCw, CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react'

interface JobStatusProps {
  intakeId: string
  jobs: any[]
  onRefresh?: () => void
}

export function JobStatus({ intakeId, jobs, onRefresh }: JobStatusProps) {
  const [currentJobs, setCurrentJobs] = useState(jobs)
  const [isPolling, setIsPolling] = useState(false)
  const supabase = createClient()

  // Initialize jobs from props
  useEffect(() => {
    setCurrentJobs(jobs)
  }, [jobs])

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
      const { data: updatedJobs } = await supabase
        .from('scrape_jobs')
        .select('*, sources(name)')
        .eq('intake_id', intakeId)
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
  }, [intakeId, currentJobs.length, supabase, onRefresh])

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default" className="bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" /> Completed</Badge>
      case 'running':
        return <Badge variant="default" className="bg-blue-600"><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Running</Badge>
      case 'pending':
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" /> Pending</Badge>
      case 'failed':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> Failed</Badge>
      case 'cancelled':
        return <Badge variant="outline">Cancelled</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-green-600" />
      case 'running':
        return <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
      case 'pending':
        return <Clock className="h-5 w-5 text-muted-foreground" />
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-600" />
      default:
        return <Clock className="h-5 w-5 text-muted-foreground" />
    }
  }

  const getProgressValue = () => {
    if (currentJobs.length === 0) return 0
    const completed = currentJobs.filter((j: any) => j.status === 'completed').length
    return (completed / currentJobs.length) * 100
  }

  const hasActiveJobs = currentJobs.some((job: any) => 
    job.status === 'pending' || job.status === 'running'
  )

  const allCompleted = currentJobs.length > 0 && currentJobs.every((job: any) => 
    job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled'
  )

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
            <span>{currentJobs.filter((j: any) => j.status === 'completed').length} / {currentJobs.length}</span>
          </div>
          <Progress value={getProgressValue()} />
        </div>

        {/* Job List */}
        <div className="space-y-2">
          {currentJobs.map((job: any) => (
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
              {getStatusBadge(job.status)}
            </div>
          ))}
        </div>

        {hasActiveJobs && (
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

