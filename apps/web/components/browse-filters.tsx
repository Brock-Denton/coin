'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function BrowseFilters() {
  const router = useRouter()
  let searchParams
  try {
    searchParams = useSearchParams()
  } catch (error) {
    console.error('Error getting search params:', error)
    searchParams = null
  }
  
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const params = new URLSearchParams()
    
    const denomination = formData.get('denomination')
    const yearMin = formData.get('year_min')
    const yearMax = formData.get('year_max')
    const priceMin = formData.get('price_min')
    const priceMax = formData.get('price_max')
    
    if (denomination) params.set('denomination', denomination as string)
    if (yearMin) params.set('year_min', yearMin as string)
    if (yearMax) params.set('year_max', yearMax as string)
    if (priceMin) params.set('price_min', priceMin as string)
    if (priceMax) params.set('price_max', priceMax as string)
    
    router.push(`/browse?${params.toString()}`)
  }
  
  const getParam = (key: string) => {
    try {
      return searchParams?.get(key) || ''
    } catch {
      return ''
    }
  }
  
  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <div>
        <Label htmlFor="denomination">Denomination</Label>
        <Select name="denomination" defaultValue={getParam('denomination')}>
          <SelectTrigger id="denomination">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All</SelectItem>
            <SelectItem value="penny">Penny</SelectItem>
            <SelectItem value="nickel">Nickel</SelectItem>
            <SelectItem value="dime">Dime</SelectItem>
            <SelectItem value="quarter">Quarter</SelectItem>
            <SelectItem value="half_dollar">Half Dollar</SelectItem>
            <SelectItem value="dollar">Dollar</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      <div>
        <Label htmlFor="year_min">Year Min</Label>
        <Input 
          id="year_min" 
          name="year_min" 
          type="number" 
          placeholder="1800" 
          defaultValue={getParam('year_min')}
        />
      </div>
      
      <div>
        <Label htmlFor="year_max">Year Max</Label>
        <Input 
          id="year_max" 
          name="year_max" 
          type="number" 
          placeholder="2024" 
          defaultValue={getParam('year_max')}
        />
      </div>
      
      <div>
        <Label htmlFor="price_min">Price Min ($)</Label>
        <Input 
          id="price_min" 
          name="price_min" 
          type="number" 
          placeholder="0" 
          defaultValue={getParam('price_min')}
        />
      </div>
      
      <div>
        <Label htmlFor="price_max">Price Max ($)</Label>
        <Input 
          id="price_max" 
          name="price_max" 
          type="number" 
          placeholder="10000" 
          defaultValue={getParam('price_max')}
        />
      </div>
      
      <div className="md:col-span-4">
        <Button type="submit">Apply Filters</Button>
      </div>
    </form>
  )
}


