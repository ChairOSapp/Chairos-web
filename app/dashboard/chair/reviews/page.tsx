'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import StaffNav from '@/components/StaffNav'
import StaffMobileNav from '@/components/StaffMobileNav'

export default function BarberReviewsPage() {
  const [reviews, setReviews] = useState<any[]>([])
  const [shopName, setShopName] = useState('')
  const [shopBarber, setShopBarber] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()
      setProfile(prof)

      const { data: sb } = await supabase
        .from('shop_barbers')
        .select('*, shops(*)')
        .eq('barber_id', user.id)
        .eq('active', true)
        .maybeSingle()

      if (!sb) { router.push('/join'); return }
      setShopBarber(sb)
      setShopName(sb.shops?.name || '')

      const { data: reviewsData } = await supabase
        .from('reviews')
        .select('*')
        .eq('barber_id', user.id)
        .eq('visible', true)
        .order('created_at', { ascending: false })
      setReviews(reviewsData || [])

      setLoading(false)
    }
    load()
  }, [supabase])

  if (loading) return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center">
      <div className="text-od-green text-sm">Loading...</div>
    </div>
  )

  const color = shopBarber?.color || '#b8861f'
  const barberName = shopBarber?.barber_name || shopBarber?.alias || ''
  const firstName = profile?.full_name?.split(' ')[0] || barberName || profile?.email?.split('@')[0] || 'there'
  const initial = (firstName[0] || 'B').toUpperCase()
  const userId = profile?.id

  const avgRating = reviews.length > 0
    ? reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length
    : 0

  return (
    <div className="min-h-screen bg-warm-50">
      <StaffNav
        shopName={shopName}
        barberName={barberName}
        color={color}
        initial={initial}
        photoUrl={shopBarber?.photo_url || undefined}
        userId={userId || undefined}
      />

      <div className="p-6 max-w-2xl mx-auto pb-20 md:pb-0">

        {/* Back button */}
        <button
          onClick={() => router.push('/dashboard/chair')}
          className="btn-chairos-outline mb-6">
          My Dashboard
        </button>

        {/* Header */}
        <div className="mb-6">
          <h1 className="font-serif text-2xl text-od-green mb-1">Your Reviews</h1>
          {shopName && (
            <p className="text-sm text-charcoal-500">Managed by {shopName}</p>
          )}
        </div>

        {/* Stats row */}
        {reviews.length > 0 && (
          <div className="bg-warm-100 border border-warm-200 rounded-xl p-5 mb-6 flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-amber-500 text-3xl">★</span>
              <div>
                <div className="font-serif text-2xl text-charcoal-900">{avgRating.toFixed(1)}</div>
                <div className="text-xs text-charcoal-500">avg rating</div>
              </div>
            </div>
            <div className="h-10 w-px bg-warm-200" />
            <div>
              <div className="font-serif text-2xl text-charcoal-900">{reviews.length}</div>
              <div className="text-xs text-charcoal-500">total reviews</div>
            </div>
          </div>
        )}

        {/* Review cards */}
        {reviews.length === 0 ? (
          <div className="bg-warm-100 border border-warm-200 rounded-xl p-8 text-center mb-6">
            <div className="text-charcoal-500 text-sm">No reviews assigned to you yet.</div>
            <div className="text-charcoal-400 text-xs mt-1">Your shop owner assigns reviews to barbers.</div>
          </div>
        ) : (
          <div className="space-y-3 mb-6">
            {reviews.map((review) => {
              const rating = Math.min(5, Math.max(0, Math.round(review.rating || 0)))
              const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating)
              const date = review.created_at
                ? new Date(review.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                : ''
              return (
                <div key={review.id} className="bg-warm-100 border border-warm-200 rounded-xl p-5">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="text-sm font-semibold text-charcoal-900">
                        {review.reviewer_name || review.author_name || 'Anonymous'}
                      </div>
                      <div className="text-amber-500 text-sm mt-0.5">{stars}</div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-4">
                      {date && <div className="text-xs text-charcoal-400">{date}</div>}
                      {review.source && (
                        <span className="inline-block mt-1 text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full bg-warm-200 text-charcoal-500">
                          {review.source}
                        </span>
                      )}
                    </div>
                  </div>
                  {review.body || review.text || review.review_text ? (
                    <p className="text-sm text-charcoal-600 leading-relaxed">
                      {review.body || review.text || review.review_text}
                    </p>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}

        {/* Footer note */}
        <div className="text-xs text-charcoal-400 text-center">
          Reviews are imported and managed by your shop owner.
        </div>

      </div>
      <StaffMobileNav />
    </div>
  )
}
