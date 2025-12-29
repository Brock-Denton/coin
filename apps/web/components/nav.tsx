'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'

export function Nav() {
  return (
    <nav className="border-b border-[#27272a] glass-strong">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-white hover:text-white/80 transition-colors">
          coins.gov.technology
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/browse">
            <Button variant="ghost" className="hover:bg-white/10">Browse</Button>
          </Link>
          <Link href="/admin">
            <Button variant="outline" className="border-[#27272a] hover:border-white/30 hover:bg-white/10">Admin</Button>
          </Link>
        </div>
      </div>
    </nav>
  )
}



