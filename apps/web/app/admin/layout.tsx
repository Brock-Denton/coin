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
    <div className="min-h-screen bg-[#09090b]">
      <nav className="sticky top-0 z-[100] pointer-events-auto border-b border-[#27272a] glass-strong bg-[#09090b]">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link href="/admin" className="text-xl font-bold text-white hover:text-white/80 transition-colors">
              Admin - coins.gov.technology
            </Link>
            <div className="flex items-center gap-4">
              <Link href="/admin/intakes">
                <Button variant="ghost" className="hover:bg-white/10">Intakes</Button>
              </Link>
              <Link href="/admin/sources">
                <Button variant="ghost" className="hover:bg-white/10">Sources</Button>
              </Link>
              <Link href="/admin/orders">
                <Button variant="ghost" className="hover:bg-white/10">Orders</Button>
              </Link>
              <Link href="/admin/grading-services">
                <Button variant="ghost" className="hover:bg-white/10">Grading Services</Button>
              </Link>
              <Link href="/admin/grading-ship-policies">
                <Button variant="ghost" className="hover:bg-white/10">Ship Policies</Button>
              </Link>
              <Link href="/admin/grade-multipliers">
                <Button variant="ghost" className="hover:bg-white/10">Grade Multipliers</Button>
              </Link>
              <form action="/admin/logout" method="post">
                <Button type="submit" variant="outline" className="border-[#27272a] hover:border-white/30 hover:bg-white/10">Logout</Button>
              </form>
            </div>
          </div>
        </div>
      </nav>
      <main className="relative z-0 container mx-auto px-4 py-8 text-white">
        {children}
      </main>
    </div>
  )
}


