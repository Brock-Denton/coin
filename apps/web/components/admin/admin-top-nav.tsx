'use client'

import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export function AdminTopNav() {
  const pathname = usePathname()

  return (
    <div className="flex items-center justify-between">
      <Link href="/admin" className="text-xl font-bold text-white hover:text-white/80 transition-colors">
        Admin - coins.gov.technology
      </Link>
      <div className="flex items-center gap-4">
        <Button asChild variant={pathname.startsWith('/admin/intakes') ? 'secondary' : 'outline'}>
          <Link href="/admin/intakes">Intakes</Link>
        </Button>
        <Button asChild variant={pathname.startsWith('/admin/sources') ? 'secondary' : 'outline'}>
          <Link href="/admin/sources">Sources</Link>
        </Button>
        <Button asChild variant={pathname.startsWith('/admin/orders') ? 'secondary' : 'outline'}>
          <Link href="/admin/orders">Orders</Link>
        </Button>
        <Button asChild variant={pathname.startsWith('/admin/grading-services') ? 'secondary' : 'outline'}>
          <Link href="/admin/grading-services">Grading Services</Link>
        </Button>
        <Button asChild variant={pathname.startsWith('/admin/grading-ship-policies') ? 'secondary' : 'outline'}>
          <Link href="/admin/grading-ship-policies">Ship Policies</Link>
        </Button>
        <Button asChild variant={pathname.startsWith('/admin/grade-multipliers') ? 'secondary' : 'outline'}>
          <Link href="/admin/grade-multipliers">Grade Multipliers</Link>
        </Button>
        <form action="/admin/logout" method="post">
          <Button type="submit" variant="outline" className="border-[#27272a] hover:border-white/30 hover:bg-white/10">Logout</Button>
        </form>
      </div>
    </div>
  )
}

