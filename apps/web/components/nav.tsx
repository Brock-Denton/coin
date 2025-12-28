'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'

export function Nav() {
  return (
    <nav className="border-b">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold">
          coins.gov.technology
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/browse">
            <Button variant="ghost">Browse</Button>
          </Link>
          <Link href="/admin">
            <Button variant="outline">Admin</Button>
          </Link>
        </div>
      </div>
    </nav>
  )
}


