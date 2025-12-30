'use client'

import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

interface WorkerHealthActionsProps {
  pausedSources: any[]
}

export function WorkerHealthActions({ pausedSources }: WorkerHealthActionsProps) {
  const [resuming, setResuming] = useState<Record<string, boolean>>({})
  const router = useRouter()
  const supabase = createClient()
  
  const handleResumeSource = async (sourceId: string) => {
    setResuming({ ...resuming, [sourceId]: true })
    try {
      const { error } = await supabase
        .from('sources')
        .update({
          paused_until: null,
          failure_streak: 0,
          updated_at: new Date().toISOString()
        })
        .eq('id', sourceId)
      
      if (error) throw error
      
      router.refresh()
    } catch (err: any) {
      alert(`Error resuming source: ${err.message}`)
    } finally {
      setResuming({ ...resuming, [sourceId]: false })
    }
  }
  
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Source Name</TableHead>
          <TableHead>Failure Streak</TableHead>
          <TableHead>Paused Until</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {pausedSources.map((source: any) => (
          <TableRow key={source.id}>
            <TableCell className="font-medium">{source.name}</TableCell>
            <TableCell>
              <Badge variant="destructive">{source.failure_streak || 0}</Badge>
            </TableCell>
            <TableCell>
              {source.paused_until 
                ? new Date(source.paused_until).toLocaleString()
                : 'N/A'}
            </TableCell>
            <TableCell>
              <Button
                size="sm"
                onClick={() => handleResumeSource(source.id)}
                disabled={resuming[source.id]}
              >
                {resuming[source.id] ? 'Resuming...' : 'Resume'}
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}


