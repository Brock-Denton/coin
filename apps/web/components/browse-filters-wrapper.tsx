import { Suspense } from 'react'
import { BrowseFilters } from './browse-filters'

export function BrowseFiltersWrapper() {
  return (
    <Suspense fallback={<div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4">Loading filters...</div>}>
      <BrowseFilters />
    </Suspense>
  )
}



