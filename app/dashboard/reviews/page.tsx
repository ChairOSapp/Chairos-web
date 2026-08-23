'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import OwnerNav from '@/components/OwnerNav'
import MobileNav from '@/components/MobileNav'
import { useVerticalLabels } from '@/lib/VerticalContext'

type Review = {
  id: string
  shop_id: string
  reviewer_name: string
  rating: number
  body: string
  review_date: string
  source: 'google' | 'booksy' | 'manual' | 'chairos'
  barber_id: string | null
  visible: boolean
  created_at: string
}

type Barber = {
  id: string
  barber_id: string | null
  barber_name: string
  alias: string
}

const SOURCE_BADGE: Record<string, { label: string; cls: string }> = {
  google: { label: 'Google', cls: 'bg-blue-500/10 text-blue-500 border border-blue-500/20' },
  booksy: { label: 'Booksy', cls: 'bg-purple-500/10 text-purple-400 border border-purple-500/20' },
  manual: { label: 'Manual', cls: 'bg-warm-200 text-charcoal-500 border border-warm-300' },
  chairos: { label: 'ChairOS', cls: 'bg-od-green/10 text-od-green border border-od-green/20' },
}

function StarDisplay({ rating }: { rating: number }) {
  return (
    <span className="text-amber-400 tracking-tight">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i}>{i < rating ? '★' : '☆'}</span>
      ))}
    </span>
  )
}

function StarSelector({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0)
  return (
    <div className="flex gap-1">
      {Array.from({ length: 5 }, (_, i) => {
        const star = i + 1
        const filled = star <= (hover || value)
        return (
          <button
            key={i}
            type="button"
            onMouseEnter={() => setHover(star)}
            onMouseLeave={() => setHover(0)}
            onClick={() => onChange(star)}
            className={`text-2xl leading-none transition-colors ${filled ? 'text-amber-400' : 'text-warm-300 hover:text-amber-300'}`}
          >
            {filled ? '★' : '☆'}
          </button>
        )
      })}
    </div>
  )
}

export default function ReviewsPage() {
  const { staffLabel } = useVerticalLabels()
  const [shop, setShop] = useState<any>(null)
  const [reviews, setReviews] = useState<Review[]>([])
  const [barbers, setBarbers] = useState<Barber[]>([])
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<any>(null)
  const [userId, setUserId] = useState<string | null>(null)

  // Import modal
  const [showImportModal, setShowImportModal] = useState(false)
  const [importPlaceId, setImportPlaceId] = useState('')
  const [importLoading, setImportLoading] = useState(false)
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null)
  const [importError, setImportError] = useState('')

  // Manual modal
  const [showManualModal, setShowManualModal] = useState(false)
  const [manualForm, setManualForm] = useState({
    reviewer_name: '',
    rating: 5,
    body: '',
    review_date: new Date().toISOString().split('T')[0],
    source: 'manual' as 'google' | 'booksy' | 'manual',
    barber_id: '',
  })
  const [manualLoading, setManualLoading] = useState(false)
  const [manualError, setManualError] = useState('')

  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setUserId(user.id)

    const { data: prof } = await supabase
      .from('profiles').select('*').eq('id', user.id).maybeSingle()
    setProfile(prof)

    if (prof?.role === 'barber') { router.push('/dashboard/chair'); return }
    if (prof?.role !== 'owner') { router.push('/login'); return }

    const { data: shops } = await supabase
      .from('shops').select('*').eq('owner_id', user.id)
      .order('created_at', { ascending: true }).limit(1)
    const shopData = shops?.[0] || null
    if (!shopData) { router.push('/onboarding'); return }
    setShop(shopData)

    const [{ data: reviewsData }, { data: barbersData }] = await Promise.all([
      supabase.from('reviews').select('*').eq('shop_id', shopData.id).order('created_at', { ascending: false }),
      supabase.from('shop_barbers').select('id, barber_id, barber_name, alias').eq('shop_id', shopData.id).eq('active', true),
    ])

    setReviews(reviewsData || [])
    setBarbers(barbersData || [])
    setLoading(false)
  }

  async function handleImport() {
    if (!importPlaceId.trim() || !shop) return
    setImportLoading(true)
    setImportError('')
    setImportResult(null)
    try {
      const res = await fetch('/api/reviews/import-google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ place_id: importPlaceId.trim(), shop_id: shop.id }),
      })
      const json = await res.json()
      if (!res.ok) { setImportError(json.error || 'Import failed'); setImportLoading(false); return }
      setImportResult({ imported: json.imported ?? 0, skipped: json.skipped ?? 0 })
      await reloadReviews()
    } catch (e: any) {
      setImportError(e.message || 'Import failed')
    }
    setImportLoading(false)
  }

  async function reloadReviews() {
    if (!shop) return
    const { data } = await supabase.from('reviews').select('*').eq('shop_id', shop.id).order('created_at', { ascending: false })
    setReviews(data || [])
  }

  async function handleManualSubmit() {
    if (!manualForm.reviewer_name.trim() || !shop) return
    setManualLoading(true)
    setManualError('')
    try {
      const res = await fetch('/api/reviews/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shop_id: shop.id,
          reviewer_name: manualForm.reviewer_name.trim(),
          rating: manualForm.rating,
          body: manualForm.body.trim(),
          review_date: manualForm.review_date,
          source: manualForm.source,
          barber_id: manualForm.barber_id || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setManualError(json.error || 'Failed to save review'); setManualLoading(false); return }
      await reloadReviews()
      setShowManualModal(false)
      setManualForm({ reviewer_name: '', rating: 5, body: '', review_date: new Date().toISOString().split('T')[0], source: 'manual', barber_id: '' })
    } catch (e: any) {
      setManualError(e.message || 'Failed to save review')
    }
    setManualLoading(false)
  }

  async function patchReview(id: string, patch: Partial<Review>) {
    await fetch(`/api/reviews/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    setReviews(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
  }

  async function deleteReview(id: string) {
    if (!confirm('Delete this review? This cannot be undone.')) return
    await fetch(`/api/reviews/${id}`, { method: 'DELETE' })
    setReviews(prev => prev.filter(r => r.id !== id))
  }

  if (loading) return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-od-green border-t-transparent animate-spin" />
    </div>
  )

  const initials = profile?.full_name?.split(' ').map((w: string) => w[0]).join('').substring(0, 2).toUpperCase() || 'OS'
  const ownerName = profile?.full_name || shop?.name || ''

  // Stats
  const avgRating = reviews.length > 0
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : null
  const googleCount = reviews.filter(r => r.source === 'google').length
  const booksyCount = reviews.filter(r => r.source === 'booksy').length
  const manualCount = reviews.filter(r => r.source === 'manual').length

  function getBarberName(barberId: string | null): string {
    if (!barberId) return ''
    const b = barbers.find(b => b.barber_id === barberId || b.id === barberId)
    return b?.barber_name || b?.alias || ''
  }

  return (
    <div className="min-h-screen bg-warm-50">
      <OwnerNav
        shopName={shop?.name || ''}
        ownerName={ownerName}
        initials={initials}
        userId={userId || undefined}
      />

      <div className="p-5 max-w-2xl mx-auto pb-24 md:pb-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-serif text-2xl text-od-green">Reviews</h1>
          <div className="flex gap-2">
            <button
              onClick={() => { setShowImportModal(true); setImportResult(null); setImportError(''); setImportPlaceId('') }}
              className="border border-od-green/40 text-od-green bg-od-green/10 hover:bg-od-green/20 font-semibold px-4 py-2 rounded-lg text-sm transition-colors">
              Import from Google
            </button>
            <button
              onClick={() => { setShowManualModal(true); setManualError('') }}
              className="bg-od-green text-white font-semibold px-4 py-2 rounded-lg text-sm hover:opacity-90 transition-opacity">
              Add Review
            </button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-warm-100 border border-warm-200 rounded-xl p-4 text-center">
            <div className="font-serif text-2xl text-amber-400 mb-1">
              {avgRating !== null ? `★ ${avgRating}` : '—'}
            </div>
            <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500">Avg Rating</div>
          </div>
          <div className="bg-warm-100 border border-warm-200 rounded-xl p-4 text-center">
            <div className="font-serif text-2xl text-charcoal-900 mb-1">{reviews.length}</div>
            <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500">Total Reviews</div>
          </div>
          <div className="bg-warm-100 border border-warm-200 rounded-xl p-4 text-center">
            <div className="text-xs text-charcoal-900 font-semibold mb-1 leading-relaxed">
              Google ({googleCount}) · Booksy ({booksyCount}) · Manual ({manualCount})
            </div>
            <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500">By Source</div>
          </div>
        </div>

        {/* Review list */}
        {reviews.length === 0 ? (
          <div className="bg-warm-100 border border-warm-200 rounded-xl p-10 text-center">
            <div className="text-charcoal-500 text-sm">
              No reviews yet. Import from Google or add manually.
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {reviews.map(review => {
              const badge = SOURCE_BADGE[review.source] || SOURCE_BADGE.manual
              const formattedDate = review.review_date
                ? new Date(review.review_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                : ''
              return (
                <div key={review.id} className="bg-warm-100 border border-warm-200 rounded-xl p-4">
                  {/* Row 1: name + stars + date + source badge */}
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className="font-semibold text-charcoal-900 text-sm">{review.reviewer_name}</span>
                    <StarDisplay rating={review.rating} />
                    {formattedDate && (
                      <span className="text-xs text-charcoal-500">{formattedDate}</span>
                    )}
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </div>

                  {/* Row 2: body */}
                  {review.body && (
                    <p className="text-sm text-charcoal-600 line-clamp-3 mb-3">{review.body}</p>
                  )}

                  {/* Row 3: controls */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <select
                      value={review.barber_id || ''}
                      onChange={e => patchReview(review.id, { barber_id: e.target.value || null })}
                      className="bg-warm-200 border border-warm-300 rounded-lg px-2 py-1.5 text-xs text-charcoal-900 outline-none focus:border-od-green">
                      <option value="">No barber</option>
                      {barbers.map(b => (
                        <option key={b.id} value={b.barber_id || b.id}>
                          {b.barber_name || b.alias}
                        </option>
                      ))}
                    </select>

                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={review.visible !== false}
                        onChange={e => patchReview(review.id, { visible: e.target.checked })}
                        className="accent-od-green w-3.5 h-3.5"
                      />
                      <span className="text-xs text-charcoal-500">Visible</span>
                    </label>

                    <button
                      onClick={() => deleteReview(review.id)}
                      className="ml-auto text-xs font-semibold text-red-400 hover:text-red-300 border border-red-400/30 hover:border-red-400/60 px-3 py-1.5 rounded-lg transition-colors">
                      Delete
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <MobileNav />

      {/* Import from Google Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-warm-50 border border-warm-200 rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-4">
              Import from Google
            </div>

            {importResult ? (
              <div className="mb-4">
                <div className="text-sm font-semibold text-od-green mb-1">
                  ✓ {importResult.imported} review{importResult.imported !== 1 ? 's' : ''} imported
                  {importResult.skipped > 0 && `, ${importResult.skipped} already existed`}
                </div>
              </div>
            ) : (
              <>
                <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">
                  Google Place ID
                </label>
                <input
                  type="text"
                  value={importPlaceId}
                  onChange={e => setImportPlaceId(e.target.value)}
                  placeholder="ChIJ..."
                  autoFocus
                  className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green mb-2"
                />
                <p className="text-xs text-charcoal-500 mb-4">
                  Find your Place ID at maps.google.com — search your shop name, click Share, then copy the ID from the URL (starts with "ChIJ")
                </p>
                {importError && (
                  <p className="text-xs text-red-400 bg-red-950/30 border border-red-900/30 rounded-lg px-3 py-2 mb-4">{importError}</p>
                )}
              </>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setShowImportModal(false); setImportResult(null); setImportError('') }}
                className="flex-1 px-4 py-2.5 bg-warm-200 border border-warm-300 rounded-lg text-sm text-charcoal-400 hover:text-charcoal-900 transition-colors">
                {importResult ? 'Done' : 'Cancel'}
              </button>
              {!importResult && (
                <button
                  onClick={handleImport}
                  disabled={importLoading || !importPlaceId.trim()}
                  className="flex-1 bg-od-green text-white font-semibold py-2.5 rounded-lg text-sm hover:opacity-90 transition-opacity disabled:opacity-50">
                  {importLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                      Importing...
                    </span>
                  ) : 'Import'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Manual Review Modal */}
      {showManualModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-warm-50 border border-warm-200 rounded-2xl p-6 w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-4">
              Add Review
            </div>

            {manualError && (
              <p className="text-xs text-red-400 bg-red-950/30 border border-red-900/30 rounded-lg px-3 py-2 mb-4">{manualError}</p>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">
                  Reviewer Name *
                </label>
                <input
                  type="text"
                  value={manualForm.reviewer_name}
                  onChange={e => setManualForm(f => ({ ...f, reviewer_name: e.target.value }))}
                  placeholder="John D."
                  className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">
                  Rating
                </label>
                <StarSelector
                  value={manualForm.rating}
                  onChange={v => setManualForm(f => ({ ...f, rating: v }))}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">
                  Review Body
                </label>
                <textarea
                  value={manualForm.body}
                  onChange={e => setManualForm(f => ({ ...f, body: e.target.value }))}
                  placeholder="Great experience..."
                  rows={3}
                  className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">
                  Date
                </label>
                <input
                  type="date"
                  value={manualForm.review_date}
                  onChange={e => setManualForm(f => ({ ...f, review_date: e.target.value }))}
                  className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">
                  Source
                </label>
                <select
                  value={manualForm.source}
                  onChange={e => setManualForm(f => ({ ...f, source: e.target.value as any }))}
                  className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green">
                  <option value="google">Google</option>
                  <option value="booksy">Booksy</option>
                  <option value="manual">Manual</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">
                  Assign to {staffLabel}
                </label>
                <select
                  value={manualForm.barber_id}
                  onChange={e => setManualForm(f => ({ ...f, barber_id: e.target.value }))}
                  className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green">
                  <option value="">No barber</option>
                  {barbers.map(b => (
                    <option key={b.id} value={b.barber_id || b.id}>
                      {b.barber_name || b.alias}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowManualModal(false); setManualError('') }}
                className="flex-1 px-4 py-2.5 bg-warm-200 border border-warm-300 rounded-lg text-sm text-charcoal-400 hover:text-charcoal-900 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleManualSubmit}
                disabled={manualLoading || !manualForm.reviewer_name.trim()}
                className="flex-1 bg-od-green text-white font-semibold py-2.5 rounded-lg text-sm hover:opacity-90 transition-opacity disabled:opacity-50">
                {manualLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    Saving...
                  </span>
                ) : 'Add Review'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
