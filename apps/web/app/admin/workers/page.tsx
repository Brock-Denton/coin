import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { WorkerHealthActions } from '@/components/worker-health-actions'

export default async function WorkersPage() {
  const supabase = await createClient()
  
  // Get worker heartbeats (online if last_seen_at < 2 min ago)
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()
  const { data: workers } = await supabase
    .from('worker_heartbeats')
    .select('*')
    .gt('last_seen_at', twoMinutesAgo)
    .order('last_seen_at', { ascending: false })
  
  // Get all workers (including offline) for complete view
  const { data: allWorkers } = await supabase
    .from('worker_heartbeats')
    .select('*')
    .order('last_seen_at', { ascending: false })
    .limit(50)
  
  // Get jobs processed last hour (succeeded jobs)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { data: recentJobs } = await supabase
    .from('scrape_jobs')
    .select('completed_at, source_id')
    .eq('status', 'succeeded')
    .gte('completed_at', oneHourAgo)
  
  // Count jobs per hour (last 24 hours)
  const { data: jobsByHour } = await supabase
    .from('scrape_jobs')
    .select('completed_at')
    .eq('status', 'succeeded')
    .gte('completed_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
  
  // Get failures per source (last 24 hours)
  const { data: failuresBySource } = await supabase
    .from('scrape_jobs')
    .select('source_id, sources(name)')
    .eq('status', 'failed')
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
  
  // Get paused sources
  const { data: pausedSources } = await supabase
    .from('sources')
    .select('*')
    .not('paused_until', 'is', null)
    .gt('paused_until', new Date().toISOString())
  
  // Count failures per source
  const failureCounts: Record<string, { count: number; sourceName: string }> = {}
  if (failuresBySource) {
    failuresBySource.forEach((job: any) => {
      const sourceId = job.source_id
      if (!failureCounts[sourceId]) {
        failureCounts[sourceId] = {
          count: 0,
          sourceName: job.sources?.name || 'Unknown'
        }
      }
      failureCounts[sourceId].count++
    })
  }
  
  // Count jobs by hour
  const hourlyCounts: Record<string, number> = {}
  if (jobsByHour) {
    jobsByHour.forEach((job: any) => {
      if (job.completed_at) {
        const hour = new Date(job.completed_at).toISOString().slice(0, 13) + ':00:00Z'
        hourlyCounts[hour] = (hourlyCounts[hour] || 0) + 1
      }
    })
  }
  
  const jobsLastHour = recentJobs?.length || 0
  
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold mb-2">Worker Health</h1>
        <p className="text-muted-foreground">Monitor worker status, job throughput, and source health</p>
      </div>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Online Workers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{workers?.length || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Jobs Last Hour</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{jobsLastHour}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Failed Sources (24h)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Object.keys(failureCounts).length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Paused Sources</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pausedSources?.length || 0}</div>
          </CardContent>
        </Card>
      </div>
      
      {/* Worker Status Table */}
      <Card>
        <CardHeader>
          <CardTitle>Worker Status</CardTitle>
          <CardDescription>Worker heartbeats and last activity</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Worker ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Seen</TableHead>
                <TableHead>Last Job ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allWorkers && allWorkers.length > 0 ? (
                allWorkers.map((worker: any) => {
                  const isOnline = new Date(worker.last_seen_at) > new Date(twoMinutesAgo)
                  const lastJobId = worker.meta?.last_job_id || null
                  
                  return (
                    <TableRow key={worker.worker_id}>
                      <TableCell className="font-mono text-sm">{worker.worker_id}</TableCell>
                      <TableCell>
                        <Badge variant={isOnline ? 'default' : 'secondary'}>
                          {isOnline ? 'Online' : 'Offline'}
                        </Badge>
                      </TableCell>
                      <TableCell>{new Date(worker.last_seen_at).toLocaleString()}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {lastJobId ? lastJobId.substring(0, 8) + '...' : 'N/A'}
                      </TableCell>
                    </TableRow>
                  )
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No workers found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
      {/* Jobs Per Hour (Last 24h) */}
      <Card>
        <CardHeader>
          <CardTitle>Jobs Per Hour (Last 24 Hours)</CardTitle>
          <CardDescription>Successful job completion rate</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Object.keys(hourlyCounts).length > 0 ? (
              Object.entries(hourlyCounts)
                .sort((a, b) => b[0].localeCompare(a[0]))
                .slice(0, 24)
                .map(([hour, count]) => (
                  <div key={hour} className="flex items-center justify-between py-2 border-b">
                    <span>{new Date(hour).toLocaleString()}</span>
                    <Badge>{count} jobs</Badge>
                  </div>
                ))
            ) : (
              <p className="text-muted-foreground">No jobs completed in the last 24 hours</p>
            )}
          </div>
        </CardContent>
      </Card>
      
      {/* Failures Per Source */}
      <Card>
        <CardHeader>
          <CardTitle>Failures Per Source (Last 24 Hours)</CardTitle>
          <CardDescription>Failed jobs grouped by source</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>Failed Jobs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.keys(failureCounts).length > 0 ? (
                Object.entries(failureCounts)
                  .sort((a, b) => b[1].count - a[1].count)
                  .map(([sourceId, data]) => (
                    <TableRow key={sourceId}>
                      <TableCell>{data.sourceName}</TableCell>
                      <TableCell>
                        <Badge variant="destructive">{data.count}</Badge>
                      </TableCell>
                    </TableRow>
                  ))
              ) : (
                <TableRow>
                  <TableCell colSpan={2} className="text-center text-muted-foreground">
                    No failures in the last 24 hours
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
      {/* Paused Sources */}
      {pausedSources && pausedSources.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Paused Sources</CardTitle>
            <CardDescription>Sources paused by circuit breaker (click Resume to reactivate)</CardDescription>
          </CardHeader>
          <CardContent>
            <WorkerHealthActions pausedSources={pausedSources} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}


