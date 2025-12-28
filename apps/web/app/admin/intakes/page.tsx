import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'

export default async function IntakesPage() {
  const supabase = await createClient()
  
  const { data: intakes } = await supabase
    .from('coin_intakes')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)
  
  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-4xl font-bold">Coin Intakes</h1>
        <Link href="/admin/intakes/new">
          <Button>New Intake</Button>
        </Link>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {intakes && intakes.length > 0 ? (
          intakes.map((intake: any) => (
            <Card key={intake.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{intake.intake_number}</CardTitle>
                  <Badge>{intake.status}</Badge>
                </div>
                <CardDescription>
                  Created {new Date(intake.created_at).toLocaleDateString()}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {intake.notes && (
                  <p className="text-sm text-muted-foreground mb-4">{intake.notes}</p>
                )}
                <Link href={`/admin/intakes/${intake.id}`}>
                  <Button className="w-full">View Details</Button>
                </Link>
              </CardContent>
            </Card>
          ))
        ) : (
          <p className="text-muted-foreground">No intakes yet.</p>
        )}
      </div>
    </div>
  )
}


