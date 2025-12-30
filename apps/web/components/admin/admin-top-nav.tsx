'use client'

import { useRouter, usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export function AdminTopNav() {
  const router = useRouter()
  const pathname = usePathname()

  const go = (href: string) => router.push(href)

  return (
    <div className="flex items-center justify-between">
      <Link href="/admin" className="text-xl font-bold text-white hover:text-white/80 transition-colors">
        Admin - coins.gov.technology
      </Link>
      <div className="flex items-center gap-4">
        <Button 
          variant={pathname.startsWith('/admin/intakes') ? 'secondary' : 'outline'} 
          onClick={() => go('/admin/intakes')}
        >
          Intakes
        </Button>
        <Button 
          variant={pathname.startsWith('/admin/sources') ? 'secondary' : 'outline'} 
          onClick={() => go('/admin/sources')}
        >
          Sources
        </Button>
        <Button 
          variant={pathname.startsWith('/admin/orders') ? 'secondary' : 'outline'} 
          onClick={() => go('/admin/orders')}
        >
          Orders
        </Button>
        <Button 
          variant={pathname.startsWith('/admin/grading-services') ? 'secondary' : 'outline'} 
          onClick={() => go('/admin/grading-services')}
        >
          Grading Services
        </Button>
        <Button 
          variant={pathname.startsWith('/admin/grading-ship-policies') ? 'secondary' : 'outline'} 
          onClick={() => go('/admin/grading-ship-policies')}
        >
          Ship Policies
        </Button>
        <Button 
          variant={pathname.startsWith('/admin/grade-multipliers') ? 'secondary' : 'outline'} 
          onClick={() => go('/admin/grade-multipliers')}
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

