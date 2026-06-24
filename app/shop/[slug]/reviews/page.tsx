'use client'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useParams } from 'next/navigation'

type SortOption = 'newest' | 'highest' | 'lowest'

function Stars({ rating }: { rating: number }) {
  const r = Math.max(0, Math.min(5, Math.round(rating)))
  return (
    <span className="text-amber-500">
      {'★'.repeat(r)}{'☆'.repeat(5 - r)}
    </span>
  )
}

function SourceBadge({ source }: { source: string }) {
  const map: Record<string, string> = {
    google: 'bg-blue-100 text-blue-700',
    booksy: 'bg-purple-100 text-purple-700',
    manual: 'bg-gray-100 text-gray-600',
    chairos: 'bg-od-green/10 text-od-green',
  }
  const cls = map[source?.toLowerCase()] || 'bg-gray-100 text-gray-600'
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>
      {source ? source.charAt(0).toUpperCase() + source.slice(1).toLowerCase() : 'Manual'}
    </span>
  )
}

export default function ShopReviews() {
  const params = useParams()
  const slug = params.slug as string
  const supabase = useMemo(() => createClient(), [])

  const [shop, setShop] = useState<any>(null)
  const [reviews, setReviews] = useState<any[]>([])
  const [barberMap, setBarberMap] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [sort, setSort] = useState<SortOption>('newest')

  useEffect(() => {
    async function load() {
      const { data: shopData } = await supabase
        .from('shops')
        .select('*')
        .eq('slug', slug)
        .maybeSingle()

      if (!shopData) { setLoading(false); return }
      setShop(shopData)

      const { data: reviewsData } = await supabase
        .from('reviews')
        .select('*')
        .eq('shop_id', shopData.id)
        .eq('visible', true)
        .order('created_at', { ascending: false })

      const allReviews = reviewsData || []
      setReviews(allReviews)

      // Fetch barber names for any assigned barber_ids
      const barberIds = [...new Set(allReviews.map((r: any) => r.barber_id).filter(Boolean))]
      if (barberIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', barberIds)
        const map = new Map<string, string>()
        for (const p of profiles || []) {
          map.set(p.id, p.full_name)
        }
        setBarberMap(map)
      }

      setLoading(false)
    }
    load()
  }, [slug])

  const sorted = useMemo(() => {
    const copy = [...reviews]
    if (sort === 'newest') return copy // already newest-first from query
    if (sort === 'highest') return copy.sort((a, b) => b.rating - a.rating)
    if (sort === 'lowest') return copy.sort((a, b) => a.rating - b.rating)
    return copy
  }, [reviews, sort])

  const avgRating = reviews.length
    ? (reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviews.length).toFixed(1)
    : null

  // Source breakdown
  const sourceCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const r of reviews) {
      const s = (r.source || 'manual').toLowerCase()
      counts[s] = (counts[s] || 0) + 1
    }
    return counts
  }, [reviews])

  if (loading) return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-od-green border-t-transparent animate-spin" />
    </div>
  )

  if (!shop) return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center p-4">
      <div className="text-center">
        <h1 className="font-serif text-3xl text-od-green mb-4">ChairOS</h1>
        <p className="text-charcoal-400 mb-6">Shop not found.</p>
        <a href="/" className="text-sm text-charcoal-500 hover:text-charcoal-900 transition-colors">← Go home</a>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-warm-50">
      <div className="max-w-2xl mx-auto px-4 py-8">

        {/* BACK LINK */}
        <a
          href={`/shop/${slug}`}
          className="inline-flex items-center gap-1 text-sm text-charcoal-500 hover:text-charcoal-900 transition-colors mb-8"
        >
          ← Back to {shop.name}
        </a>

        {/* HERO */}
        <div className="bg-warm-100 border border-warm-200 rounded-xl p-6 mb-6 text-center">
          <h1 className="font-serif text-3xl text-charcoal-900 mb-4">{shop.name}</h1>
          {avgRating ? (
            <>
              <div className="flex items-center justify-center gap-3 mb-2">
                <span className="text-amber-400 text-3xl">★</span>
                <span className="font-serif text-5xl text-charcoal-900">{avgRating}</span>
                <span className="text-sm text-charcoal-500 self-end mb-1">out of 5</span>
              </div>
              <p className="text-charcoal-500 text-sm mb-4">{reviews.length} review{reviews.length !== 1 ? 's' : ''}</p>
              {Object.keys(sourceCounts).length > 0 && (
                <div className="flex flex-wrap justify-center gap-2">
                  {Object.entries(sourceCounts).map(([src, count]) => (
                    <SourceBadge key={src} source={src} />
                  )).reduce<React.ReactNode[]>((acc, badge, i, arr) => {
                    acc.push(badge)
                    if (i < arr.length - 1) acc.push(<span key={`dot-${i}`} className="text-charcoal-300 text-sm">·</span>)
                    return acc
                  }, []).map((el, i) => <span key={i}>{el}</span>)}
                  <span className="sr-only">
                    {Object.entries(sourceCounts).map(([src, count]) => `${src.charAt(0).toUpperCase() + src.slice(1)} (${count})`).join(' · ')}
                  </span>
                </div>
              )}
            </>
          ) : (
            <p className="text-charcoal-400 text-sm">No reviews yet.</p>
          )}
        </div>

        {/* SOURCE BREAKDOWN (text version for clarity) */}
        {reviews.length > 0 && Object.keys(sourceCounts).length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {Object.entries(sourceCounts).map(([src, count], i, arr) => (
              <span key={src} className="text-sm text-charcoal-500">
                <SourceBadge source={src} />
                <span className="ml-1 text-charcoal-400">({count})</span>
                {i < arr.length - 1 && <span className="ml-2 text-charcoal-300">·</span>}
              </span>
            ))}
          </div>
        )}

        {/* SORT CONTROLS */}
        {reviews.length > 0 && (
          <div className="flex gap-2 mb-6">
            {(['newest', 'highest', 'lowest'] as SortOption[]).map(s => (
              <button
                key={s}
                onClick={() => setSort(s)}
                className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-all border"
                style={{
                  background: sort === s ? '#5c7a3e' : 'transparent',
                  borderColor: sort === s ? '#5c7a3e' : '#d4c9b0',
                  color: sort === s ? '#fff' : '#6b7280',
                }}
              >
                {s === 'newest' ? 'Newest' : s === 'highest' ? 'Highest Rated' : 'Lowest Rated'}
              </button>
            ))}
          </div>
        )}

        {/* REVIEW CARDS */}
        {sorted.length === 0 ? (
          <div className="text-center text-charcoal-500 text-sm py-12">No reviews yet.</div>
        ) : (
          <div className="space-y-4">
            {sorted.map(r => {
              const dateStr = r.review_date
                ? new Date(r.review_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                : r.created_at
                  ? new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                  : null
              const barberName = r.barber_id ? barberMap.get(r.barber_id) : null

              return (
                <div key={r.id} className="bg-warm-100 border border-warm-200 rounded-xl p-5">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <span className="font-semibold text-sm text-charcoal-900">{r.reviewer_name || 'Anonymous'}</span>
                      {barberName && (
                        <span className="ml-2 text-xs text-charcoal-400">· Cut by {barberName}</span>
                      )}
                    </div>
                    <SourceBadge source={r.source || 'manual'} />
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <Stars rating={r.rating || 0} />
                    {dateStr && <span className="text-xs text-charcoal-400">{dateStr}</span>}
                  </div>
                  {r.body && (
                    <p className="text-sm text-charcoal-600 leading-relaxed">{r.body}</p>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <p className="text-charcoal-600 text-xs text-center mt-10">Powered by ChairOS</p>
      </div>
    </div>
  )
}
