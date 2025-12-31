'use client'

import { usePathname, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export function AdminTopNav() {
  const pathname = usePathname()
  const router = useRouter()

  return (
    <div className="flex items-center justify-between">
      <Link href="/admin" className="text-xl font-bold text-white hover:text-white/80 transition-colors">
        Admin - coins.gov.technology
      </Link>
      <div className="flex items-center gap-4">
        <Button 
          variant={pathname.startsWith('/admin/intakes') ? 'secondary' : 'outline'}
          onClick={() => router.push('/admin/intakes')}
        >
          Intakes
        </Button>
        <Button 
          variant={pathname.startsWith('/admin/sources') ? 'secondary' : 'outline'}
          onClick={() => router.push('/admin/sources')}
        >
          Sources
        </Button>
        <Button 
          variant={pathname.startsWith('/admin/orders') ? 'secondary' : 'outline'}
          onClick={() => router.push('/admin/orders')}
        >
          Orders
        </Button>
        <Button 
          variant={pathname.startsWith('/admin/grading-services') ? 'secondary' : 'outline'}
          onClick={() => router.push('/admin/grading-services')}
        >
          Grading Services
        </Button>
        <Button 
          variant={pathname.startsWith('/admin/grading-ship-policies') ? 'secondary' : 'outline'}
          onClick={() => router.push('/admin/grading-ship-policies')}
        >
          Ship Policies
        </Button>
        <Button 
          variant={pathname.startsWith('/admin/grade-multipliers') ? 'secondary' : 'outline'}
          onClick={() => router.push('/admin/grade-multipliers')}
        >
          Grade Multipliers
        </Button>
        <form action="/admin/logout" method="post">
          <Button type="submit" variant="outline" className="border-[#27272a] hover:border-white/30 hover:bg-white/10">Logout</Button>
        </form>
      </div>
    </div>
  )
}

