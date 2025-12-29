'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Copy, Check, Link2, DollarSign } from 'lucide-react'
import { Label } from '@/components/ui/label'

interface SearchQuery {
  id: string
  query: string
  source: string
  url: string
  found?: boolean
  resultUrl?: string
  resultPrice?: string
}

interface SearchQueriesProps {
  attribution: any
  onQueriesCompleted?: () => void
}

export function SearchQueries({ attribution, onQueriesCompleted }: SearchQueriesProps) {
  const [queries, setQueries] = useState<SearchQuery[]>([])
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Generate search queries based on attribution (returns array instead of setting state)
  const generateQueriesArray = useCallback((): SearchQuery[] => {
    const queries: SearchQuery[] = []
    
    // Build base coin description
    const denominationMap: Record<string, string> = {
      penny: 'penny',
      nickel: 'nickel',
      dime: 'dime',
      quarter: 'quarter',
      half_dollar: 'half dollar',
      dollar: 'dollar'
    }
    
    const denomination = denominationMap[attribution?.denomination || ''] || ''
    const year = attribution?.year || ''
    const mintmark = attribution?.mintmark || ''
    const grade = attribution?.grade || ''
    const series = attribution?.series || ''
    const title = attribution?.title || ''
    
    // Query 1: PCGS CoinFacts (most authoritative)
    const pcgsParts = []
    if (year) pcgsParts.push(year)
    if (mintmark) pcgsParts.push(mintmark)
    if (denomination) pcgsParts.push(denomination)
    if (series) pcgsParts.push(series)
    const pcgsQuery = pcgsParts.join(' ')
    queries.push({
      id: 'pcgs',
      query: pcgsQuery || title || `${year} ${denomination}`,
      source: 'PCGS CoinFacts',
      url: `https://www.pcgs.com/coinfacts/search?q=${encodeURIComponent(pcgsQuery || title || `${year} ${denomination}`)}`
    })
    
    // Query 2: NGC Coin Explorer
    const ngcQuery = `${year} ${mintmark} ${denomination} ${series}`.trim()
    queries.push({
      id: 'ngc',
      query: ngcQuery || title || `${year} ${denomination}`,
      source: 'NGC Coin Explorer',
      url: `https://www.ngccoin.com/coin-explorer/?q=${encodeURIComponent(ngcQuery || title || `${year} ${denomination}`)}`
    })
    
    // Query 3: Heritage Auctions
    const heritageQuery = `${year} ${mintmark} ${denomination} ${grade}`.trim()
    queries.push({
      id: 'heritage',
      query: heritageQuery || title || `${year} ${denomination}`,
      source: 'Heritage Auctions',
      url: `https://www.ha.com/c/search-results.zx?N=790+231+4294949385&Ntt=${encodeURIComponent(heritageQuery || title || `${year} ${denomination}`)}`
    })
    
    // Query 4: Google search for price guide
    const googleQuery = `${year} ${mintmark} ${denomination} ${grade} price guide`.trim()
    queries.push({
      id: 'google',
      query: googleQuery || title || `${year} ${denomination} price guide`,
      source: 'Google Search',
      url: `https://www.google.com/search?q=${encodeURIComponent(googleQuery || title || `${year} ${denomination} price guide`)}`
    })
    
    // Query 5: NumisMedia or CoinWorld
    const numisQuery = `${year} ${denomination} ${series} ${grade}`.trim()
    const numisFullQuery = numisQuery ? `${numisQuery} numismedia OR coinworld` : (title || `${year} ${denomination}`)
    queries.push({
      id: 'numis',
      query: numisFullQuery,
      source: 'NumisMedia / CoinWorld',
      url: `https://www.google.com/search?q=${encodeURIComponent(numisFullQuery)}`
    })
    
    return queries
  }, [attribution])

  // Regenerate queries while preserving existing state (found status, resultUrl, resultPrice)
  const regenerateQueries = useCallback(() => {
    setQueries(currentQueries => {
      // Save current query state before regenerating
      const savedState = currentQueries.reduce((acc, q) => {
        acc[q.id] = {
          found: q.found,
          resultUrl: q.resultUrl,
          resultPrice: q.resultPrice
        }
        return acc
      }, {} as Record<string, { found?: boolean; resultUrl?: string; resultPrice?: string }>)
      
      // Generate new queries
      const newQueries = generateQueriesArray()
      
      // Restore saved state for queries that still exist
      const restoredQueries = newQueries.map(q => ({
        ...q,
        ...(savedState[q.id] || {})
      }))
      
      return restoredQueries
    })
  }, [generateQueriesArray])

  const handleCopy = async (queryId: string, text: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedId(queryId)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const toggleFound = (queryId: string, found: boolean) => {
    setQueries(queries.map(q => 
      q.id === queryId 
        ? { ...q, found, resultUrl: found ? q.resultUrl : undefined, resultPrice: found ? q.resultPrice : undefined }
        : q
    ))
  }

  const updateResultData = (queryId: string, field: 'resultUrl' | 'resultPrice', value: string) => {
    setQueries(queries.map(q => 
      q.id === queryId ? { ...q, [field]: value } : q
    ))
  }

  // Auto-regenerate queries when attribution fields change
  useEffect(() => {
    // Only regenerate if we have at least one attribution field
    const hasAttributionData = attribution && (
      attribution.year || 
      attribution.denomination || 
      attribution.mintmark || 
      attribution.series || 
      attribution.grade || 
      attribution.title
    )
    
    if (hasAttributionData) {
      regenerateQueries()
    }
  }, [
    attribution?.year,
    attribution?.denomination,
    attribution?.mintmark,
    attribution?.series,
    attribution?.grade,
    attribution?.title,
    regenerateQueries
  ])

  const allQueriesCompleted = queries.length > 0 && queries.every(q => q.found !== undefined)
  const foundCount = queries.filter(q => q.found === true).length

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Manual Search (Optional)</CardTitle>
            <CardDescription>
              Copy and paste these searches into reputable coin pricing sources. Mark each as found or not found.
            </CardDescription>
          </div>
          <Button onClick={regenerateQueries} variant="outline" size="sm">
            Regenerate Queries
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {queries.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>Click &quot;Regenerate Queries&quot; to generate search queries based on your attribution.</p>
          </div>
        ) : (
          <>
            {queries.map((query) => (
              <div key={query.id} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{query.source}</Badge>
                    {query.found !== undefined && (
                      <Badge variant={query.found ? 'default' : 'secondary'}>
                        {query.found ? 'Found' : 'Not Found'}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopy(query.id, query.query)}
                    >
                      {copiedId === query.id ? (
                        <>
                          <Check className="h-4 w-4 mr-1" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4 mr-1" />
                          Copy Query
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(query.url, '_blank')}
                    >
                      Open Search
                    </Button>
                  </div>
                </div>
                <Input
                  value={query.query}
                  readOnly
                  className="font-mono text-sm"
                />
                <div className="flex items-center gap-2">
                  <Button
                    variant={query.found === true ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => toggleFound(query.id, true)}
                  >
                    {query.found === true ? '✓ Found' : 'Mark as Found'}
                  </Button>
                  <Button
                    variant={query.found === false ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => toggleFound(query.id, false)}
                  >
                    {query.found === false ? '✗ Not Found' : 'Mark as Not Found'}
                  </Button>
                </div>
                {query.found === true && (
                  <div className="pt-3 border-t space-y-3 bg-muted/30 p-3 rounded-lg">
                    <div>
                      <Label htmlFor={`url-${query.id}`} className="flex items-center gap-2 mb-2">
                        <Link2 className="h-4 w-4" />
                        Result URL
                      </Label>
                      <Input
                        id={`url-${query.id}`}
                        type="url"
                        placeholder="https://example.com/coin-listing"
                        value={query.resultUrl || ''}
                        onChange={(e) => updateResultData(query.id, 'resultUrl', e.target.value)}
                      />
                      {query.resultUrl && (
                        <a
                          href={query.resultUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline mt-1 inline-block"
                        >
                          Open link
                        </a>
                      )}
                    </div>
                    <div>
                      <Label htmlFor={`price-${query.id}`} className="flex items-center gap-2 mb-2">
                        <DollarSign className="h-4 w-4" />
                        Price (USD)
                      </Label>
                      <Input
                        id={`price-${query.id}`}
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={query.resultPrice || ''}
                        onChange={(e) => updateResultData(query.id, 'resultPrice', e.target.value)}
                      />
                      {query.resultPrice && (
                        <p className="text-xs text-muted-foreground mt-1">
                          ${parseFloat(query.resultPrice || '0').toFixed(2)}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
            
            {allQueriesCompleted && (
              <div className="mt-4 p-4 bg-muted rounded-lg">
                <p className="text-sm font-medium mb-2">
                  Completed: {foundCount} of {queries.length} searches found results.
                </p>
                {foundCount > 0 && (
                  <div className="text-xs text-muted-foreground space-y-1">
                    {queries.filter(q => q.found === true && q.resultPrice).map(q => (
                      <div key={q.id} className="flex justify-between">
                        <span>{q.source}:</span>
                        <span className="font-medium">${parseFloat(q.resultPrice || '0').toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

