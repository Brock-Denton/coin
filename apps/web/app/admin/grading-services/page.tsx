import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import Link from 'next/link'

export default async function GradingServicesPage() {
  const supabase = await createClient()
  
  const { data: services } = await supabase
    .from('grading_services')
    .select('*')
    .order('name', { ascending: true })
  
  const formatCurrency = (cents: number | null) => {
    if (cents == null) return 'N/A'
    return `$${(cents / 100).toFixed(2)}`
  }
  
  return (
    <div>
      <h1 className="text-4xl font-bold mb-8">Grading Services</h1>
      
      <Card className="glass-strong">
        <CardHeader>
          <CardTitle>Grading Services</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Website</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Base Fee</TableHead>
                <TableHead>Per Coin Fee</TableHead>
                <TableHead>Turnaround</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {services && services.length > 0 ? (
                services.map((service: any) => (
                  <TableRow key={service.id}>
                    <TableCell className="font-medium">{service.name}</TableCell>
                    <TableCell>
                      {service.website ? (
                        <a href={service.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                          {service.website}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">N/A</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={service.enabled ? 'default' : 'secondary'}>
                        {service.enabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatCurrency(service.base_fee_cents)}</TableCell>
                    <TableCell>{formatCurrency(service.per_coin_fee_cents)}</TableCell>
                    <TableCell>
                      {service.turnaround_days ? `${service.turnaround_days} days` : 'N/A'}
                    </TableCell>
                    <TableCell>
                      <Link href={`/admin/grading-services/${service.id}`}>
                        <Button variant="outline" size="sm">Edit</Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No grading services found
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

