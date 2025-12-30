// import { redirect } from 'next/navigation'
// import { createClient } from '@/lib/supabase/server'
import { AdminTopNav } from '@/components/admin/admin-top-nav'

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
          <AdminTopNav />
        </div>
      </nav>
      <main className="relative z-0 container mx-auto px-4 py-8 text-white">
        {children}
      </main>
    </div>
  )
}


