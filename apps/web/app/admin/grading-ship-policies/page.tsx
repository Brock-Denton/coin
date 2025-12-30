import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import Link from 'next/link'

export default async function GradingShipPoliciesPage() {
  const supabase = await createClient()
  
  const { data: policies } = await supabase
    .from('grading_ship_policies')
    .select('*')
    .order('name', { ascending: true })
  
  const formatCurrency = (cents: number | null) => {
    if (cents == null) return 'N/A'
    return `$${(cents / 100).toFixed(2)}`
  }
  
  return (
    <div>
      <h1 className="text-4xl font-bold mb-8">Shipping Policies</h1>
      
      <Card className="glass-strong">
        <CardHeader>
          <CardTitle>Grading Shipping Policies</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Outbound Shipping</TableHead>
                <TableHead>Return Shipping</TableHead>
                <TableHead>Insurance Rate</TableHead>
                <TableHead>Handling</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {policies && policies.length > 0 ? (
                policies.map((policy: any) => (
                  <TableRow key={policy.id}>
                    <TableCell className="font-medium">{policy.name}</TableCell>
                    <TableCell>{formatCurrency(policy.outbound_shipping_cents)}</TableCell>
                    <TableCell>{formatCurrency(policy.return_shipping_cents)}</TableCell>
                    <TableCell>
                      {(policy.insurance_rate_bps / 100).toFixed(2)}% ({policy.insurance_rate_bps} bps)
                    </TableCell>
                    <TableCell>{formatCurrency(policy.handling_cents)}</TableCell>
                    <TableCell>
                      <Link href={`/admin/grading-ship-policies/${policy.id}`}>
                        <Button variant="outline" size="sm">Edit</Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No shipping policies found
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

