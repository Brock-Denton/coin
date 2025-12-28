// import { redirect } from 'next/navigation'
// import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Auth temporarily disabled - can be re-enabled later
  // const supabase = await createClient()
  // const { data: { user } } = await supabase.auth.getUser()
  
  // if (!user) {
  //   redirect('/admin/login')
  // }
  
  // const { data: profile } = await supabase
  //   .from('profiles')
  //   .select('role')
  //   .eq('id', user.id)
  //   .single()
  
  // if (!profile || !['admin', 'staff'].includes(profile.role)) {
  //   redirect('/')
  // }
  
  return (
    <div className="min-h-screen">
      <nav className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link href="/admin" className="text-xl font-bold">
              Admin - coins.gov.technology
            </Link>
            <div className="flex items-center gap-4">
              <Link href="/admin/intakes">
                <Button variant="ghost">Intakes</Button>
              </Link>
              <Link href="/admin/sources">
                <Button variant="ghost">Sources</Button>
              </Link>
              <Link href="/admin/orders">
                <Button variant="ghost">Orders</Button>
              </Link>
              <form action="/admin/logout" method="post">
                <Button type="submit" variant="outline">Logout</Button>
              </form>
            </div>
          </div>
        </div>
      </nav>
      <main className="container mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  )
}


