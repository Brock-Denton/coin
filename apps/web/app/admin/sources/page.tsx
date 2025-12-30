import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import Link from 'next/link'

export default async function SourcesPage() {
  const supabase = await createClient()
  
  const { data: sources } = await supabase
    .from('sources')
    .select('*')
    .order('name', { ascending: true })
  
  return (
    <div>
      <h1 className="text-4xl font-bold mb-8">Pricing Sources</h1>
      
      <Card>
        <CardHeader>
          <CardTitle>Sources</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Adapter Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reputation Weight</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources && sources.length > 0 ? (
                sources.map((source: any) => (
                  <TableRow key={source.id}>
                    <TableCell className="font-medium">{source.name}</TableCell>
                    <TableCell>
                      <Badge>{source.adapter_type}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={source.enabled ? 'default' : 'secondary'}>
                        {source.enabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </TableCell>
                    <TableCell>{source.reputation_weight.toFixed(2)}</TableCell>
                    <TableCell>{source.tier}</TableCell>
                    <TableCell>
                      <Link href={`/admin/sources/${source.id}`}>
                        <Button variant="outline" size="sm">Edit</Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No sources found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}




