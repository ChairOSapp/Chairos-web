'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import OwnerNav from '@/components/OwnerNav'
import StaffNav from '@/components/StaffNav'
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
  color: string | null
  photo_url: string | null
}

type ReviewResponse = {
  id: string
  review_id: string
  draft_text: string
  edited_text: string | null
  status: 'pending' | 'approved' | 'posted' | 'dismissed'
}

const RESPONSE_STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Draft', cls: 'bg-warm-200 text-charcoal-500 border border-warm-300' },
  approved: { label: 'Approved', cls: 'bg-amber-500/10 text-amber-500 border border-amber-500/20' },
  posted: { label: 'Posted', cls: 'bg-green-500/10 text-green-500 border border-green-500/20' },
  dismissed: { label: 'Dismissed', cls: 'bg-red-500/10 text-red-400 border border-red-500/20' },
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

  // Draft responses, keyed by review_id
  const [responses, setResponses] = useState<Record<string, ReviewResponse>>({})
  const [responseDrafts, setResponseDrafts] = useState<Record<string, string>>({})
  const [responseBusy, setResponseBusy] = useState<Record<string, boolean>>({})
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Import modal
  const [showImportModal, setShowImportModal] = useState(false)
  const [importPlaceId, setImportPlaceId] = useState('')
  const [importLoading, setImportLoading] = useState(false)
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null)
  const [importError, setImportError] = useState('')

  // Business search (replaces raw Place ID entry as the primary flow)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [candidates, setCandidates] = useState<{ id: string; name: string; address: string; rating: number | null; userRatingCount: number | null }[] | null>(null)
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)

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

    if (prof?.role !== 'owner' && prof?.role !== 'barber') { router.push('/login'); return }

    const { data: shops } = await supabase
      .from('shops').select('*').eq('owner_id', user.id)
      .order('created_at', { ascending: true }).limit(1)
    const shopData = shops?.[0] || null

    // A Solo Chair (role='barber') owns their own one-person shop and
    // manages reviews the same way an owner would; hired staff (role=
    // 'barber', no shop of their own) use the read-only view instead.
    if (!shopData) {
      router.push(prof?.role === 'barber' ? '/dashboard/chair' : '/onboarding')
      return
    }
    setShop(shopData)

    const [{ data: reviewsData }, { data: barbersData }, { data: responsesData }] = await Promise.all([
      supabase.from('reviews').select('*').eq('shop_id', shopData.id).order('created_at', { ascending: false }),
      supabase.from('shop_barbers').select('id, barber_id, barber_name, alias, color, photo_url').eq('shop_id', shopData.id).eq('active', true),
      supabase.from('review_responses').select('id, review_id, draft_text, edited_text, status').eq('shop_id', shopData.id),
    ])

    setReviews(reviewsData || [])
    setBarbers(barbersData || [])
    const responseMap = Object.fromEntries((responsesData || []).map(r => [r.review_id, r]))
    setResponses(responseMap)
    setResponseDrafts(Object.fromEntries((responsesData || []).map(r => [r.review_id, r.edited_text ?? r.draft_text])))
    setLoading(false)
  }

  async function handleImport(placeIdOverride?: string) {
    const placeId = (placeIdOverride ?? importPlaceId).trim()
    if (!placeId || !shop) return
    setImportLoading(true)
    setImportError('')
    setImportResult(null)
    try {
      const res = await fetch('/api/reviews/import-google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ place_id: placeId, shop_id: shop.id }),
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

  async function handleSearch() {
    if (!searchQuery.trim()) return
    setSearchLoading(true)
    setSearchError('')
    setCandidates(null)
    setSelectedCandidateId(null)
    try {
      const res = await fetch('/api/reviews/resolve-place', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery.trim() }),
      })
      const json = await res.json()
      if (!res.ok) { setSearchError(json.error || "We couldn't find a match."); setSearchLoading(false); return }
      setCandidates(json.candidates)
      if (json.candidates.length === 1) setSelectedCandidateId(json.candidates[0].id)
    } catch {
      setSearchError("We couldn't reach Google to search for your business. Try again in a moment.")
    }
    setSearchLoading(false)
  }

  function resetImportModal() {
    setShowImportModal(false)
    setImportResult(null)
    setImportError('')
    setSearchQuery('')
    setSearchError('')
    setCandidates(null)
    setSelectedCandidateId(null)
    setShowAdvanced(false)
    setImportPlaceId('')
  }

  async function reloadReviews() {
    if (!shop) return
    const [{ data }, { data: responsesData }] = await Promise.all([
      supabase.from('reviews').select('*').eq('shop_id', shop.id).order('created_at', { ascending: false }),
      supabase.from('review_responses').select('id, review_id, draft_text, edited_text, status').eq('shop_id', shop.id),
    ])
    setReviews(data || [])
    const responseMap = Object.fromEntries((responsesData || []).map(r => [r.review_id, r]))
    setResponses(responseMap)
    setResponseDrafts(prev => ({
      ...Object.fromEntries((responsesData || []).map(r => [r.review_id, r.edited_text ?? r.draft_text])),
      ...prev,
    }))
  }

  async function generateResponse(reviewId: string) {
    setResponseBusy(b => ({ ...b, [reviewId]: true }))
    try {
      const res = await fetch(`/api/reviews/${reviewId}/response`, { method: 'POST' })
      const json = await res.json()
      if (res.ok && json.response) {
        setResponses(prev => ({ ...prev, [reviewId]: json.response }))
        setResponseDrafts(prev => ({ ...prev, [reviewId]: json.response.edited_text ?? json.response.draft_text }))
      }
    } finally {
      setResponseBusy(b => ({ ...b, [reviewId]: false }))
    }
  }

  async function saveResponseEdit(reviewId: string) {
    const text = responseDrafts[reviewId]
    if (text === undefined) return
    setResponseBusy(b => ({ ...b, [reviewId]: true }))
    try {
      const res = await fetch(`/api/reviews/${reviewId}/response`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ edited_text: text }),
      })
      const json = await res.json()
      if (res.ok && json.response) setResponses(prev => ({ ...prev, [reviewId]: json.response }))
    } finally {
      setResponseBusy(b => ({ ...b, [reviewId]: false }))
    }
  }

  async function setResponseStatus(reviewId: string, status: 'approved' | 'posted' | 'dismissed') {
    setResponseBusy(b => ({ ...b, [reviewId]: true }))
    try {
      const text = responseDrafts[reviewId]
      const res = await fetch(`/api/reviews/${reviewId}/response`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, ...(text !== undefined ? { edited_text: text } : {}) }),
      })
      const json = await res.json()
      if (res.ok && json.response) setResponses(prev => ({ ...prev, [reviewId]: json.response }))
    } finally {
      setResponseBusy(b => ({ ...b, [reviewId]: false }))
    }
  }

  async function copyResponse(reviewId: string) {
    const text = responseDrafts[reviewId] ?? ''
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(reviewId)
      setTimeout(() => setCopiedId(id => (id === reviewId ? null : id)), 2000)
    } catch {
      // Clipboard API can fail without permission — the textarea remains selectable/copyable manually.
    }
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
  // Solo Chair (role='barber') reaches this page owning their own shop
  // (guaranteed by the owner_id-scoped shop query above) -- same top nav
  // they see everywhere else, not the owner's.
  const myBarberRow = barbers.find(b => b.barber_id === userId)
  const soloBarberName = myBarberRow?.barber_name || myBarberRow?.alias || profile?.full_name || 'You'

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
      {profile?.role === 'barber' ? (
        <StaffNav
          shopName={shop?.name || ''}
          barberName={soloBarberName}
          color={myBarberRow?.color || '#b8861f'}
          initial={soloBarberName[0]?.toUpperCase() || 'S'}
          photoUrl={myBarberRow?.photo_url || undefined}
          userId={userId || undefined}
        />
      ) : (
        <OwnerNav
          shopName={shop?.name || ''}
          ownerName={ownerName}
          initials={initials}
          userId={userId || undefined}
        />
      )}

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

                  {/* Row 4: AI response draft */}
                  <div className="mt-3 pt-3 border-t border-warm-200">
                    {(() => {
                      const response = responses[review.id]
                      const busy = !!responseBusy[review.id]
                      if (!response) {
                        return (
                          <button
                            onClick={() => generateResponse(review.id)}
                            disabled={busy}
                            className="text-xs font-semibold text-od-green hover:text-od-green-light transition-colors disabled:opacity-50">
                            {busy ? 'Generating…' : '✦ Generate AI response draft'}
                          </button>
                        )
                      }
                      const statusBadge = RESPONSE_STATUS_BADGE[response.status] ?? RESPONSE_STATUS_BADGE.pending
                      const draftValue = responseDrafts[review.id] ?? response.edited_text ?? response.draft_text
                      const dirty = draftValue !== (response.edited_text ?? response.draft_text)
                      return (
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-semibold tracking-widest uppercase text-charcoal-400">Response Draft</span>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusBadge.cls}`}>{statusBadge.label}</span>
                          </div>
                          <textarea
                            value={draftValue}
                            onChange={e => setResponseDrafts(prev => ({ ...prev, [review.id]: e.target.value }))}
                            rows={2}
                            disabled={response.status === 'dismissed'}
                            className="w-full bg-warm-200 border border-warm-300 rounded-lg px-3 py-2 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors resize-none disabled:opacity-60"
                          />
                          <p className="text-xs text-charcoal-500 mt-1">
                            AI-drafted — edit freely. ChairOS doesn't post replies to Google automatically yet, so approve it, then copy and paste it as your reply on Google (or wherever the review lives).
                          </p>
                          <div className="flex items-center gap-2 flex-wrap mt-2">
                            {dirty && (
                              <button onClick={() => saveResponseEdit(review.id)} disabled={busy}
                                className="text-xs font-semibold text-charcoal-900 bg-warm-200 border border-warm-300 hover:border-warm-400 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                                Save Edit
                              </button>
                            )}
                            {response.status === 'pending' && (
                              <button onClick={() => setResponseStatus(review.id, 'approved')} disabled={busy}
                                className="text-xs font-semibold text-od-green bg-od-green/10 border border-od-green/30 hover:bg-od-green/20 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                                Approve
                              </button>
                            )}
                            {(response.status === 'approved' || response.status === 'pending') && (
                              <button onClick={() => copyResponse(review.id)}
                                className="text-xs font-semibold text-charcoal-900 bg-warm-200 border border-warm-300 hover:border-warm-400 px-3 py-1.5 rounded-lg transition-colors">
                                {copiedId === review.id ? 'Copied ✓' : 'Copy'}
                              </button>
                            )}
                            {response.status === 'approved' && (
                              <button onClick={() => setResponseStatus(review.id, 'posted')} disabled={busy}
                                className="text-xs font-semibold text-charcoal-900 bg-warm-200 border border-warm-300 hover:border-warm-400 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                                Mark as Posted
                              </button>
                            )}
                            {response.status !== 'dismissed' && response.status !== 'posted' && (
                              <button onClick={() => setResponseStatus(review.id, 'dismissed')} disabled={busy}
                                className="text-xs font-semibold text-red-400 hover:text-red-300 transition-colors disabled:opacity-50">
                                Dismiss
                              </button>
                            )}
                            <button onClick={() => generateResponse(review.id)} disabled={busy}
                              className="text-xs font-semibold text-charcoal-500 hover:text-charcoal-900 transition-colors disabled:opacity-50 ml-auto">
                              {busy ? '...' : '↻ Regenerate'}
                            </button>
                          </div>
                        </div>
                      )
                    })()}
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
            ) : candidates && !showAdvanced ? (
              <>
                <p className="text-xs text-charcoal-500 mb-3">
                  {candidates.length === 1 ? 'Is this your business?' : `Found ${candidates.length} possible matches — pick yours:`}
                </p>
                <div className="space-y-2 mb-3 max-h-64 overflow-y-auto">
                  {candidates.map(c => (
                    <label key={c.id}
                      className={`flex items-start gap-3 border rounded-lg px-4 py-3 cursor-pointer transition-colors ${selectedCandidateId === c.id ? 'border-od-green bg-od-green/5' : 'border-warm-300 bg-warm-200'}`}>
                      <input type="radio" name="candidate" checked={selectedCandidateId === c.id}
                        onChange={() => setSelectedCandidateId(c.id)} className="mt-1 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-charcoal-900">{c.name}</div>
                        <div className="text-xs text-charcoal-500">{c.address}</div>
                        {c.rating != null && (
                          <div className="text-xs text-amber-500 mt-0.5">★ {c.rating} · {c.userRatingCount ?? 0} reviews</div>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
                <button onClick={() => { setCandidates(null); setSelectedCandidateId(null); setImportError('') }}
                  className="text-xs text-charcoal-500 hover:text-charcoal-900 transition-colors mb-3 block">
                  ← Search again
                </button>
                {importError && (
                  <p className="text-xs text-red-400 bg-red-950/30 border border-red-900/30 rounded-lg px-3 py-2 mb-4">{importError}</p>
                )}
              </>
            ) : showAdvanced ? (
              <>
                <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">
                  Google Place ID (advanced)
                </label>
                <input
                  type="text"
                  value={importPlaceId}
                  onChange={e => setImportPlaceId(e.target.value)}
                  placeholder="ChIJ..."
                  autoFocus
                  className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green mb-2"
                />
                <p className="text-xs text-charcoal-500 mb-2">
                  Only needed if search above couldn't find your business. Find it at maps.google.com — search your shop, click Share, Copy Link, then paste the whole link into search instead of using this.
                </p>
                <button onClick={() => { setShowAdvanced(false); setImportError('') }}
                  className="text-xs text-charcoal-500 hover:text-charcoal-900 transition-colors mb-2 block">
                  ← Back to search
                </button>
                {importError && (
                  <p className="text-xs text-red-400 bg-red-950/30 border border-red-900/30 rounded-lg px-3 py-2 mb-4">{importError}</p>
                )}
              </>
            ) : (
              <>
                <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">
                  Google Maps link or shop name
                </label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSearch() }}
                  placeholder="Paste your Google Maps link, or type your shop name"
                  autoFocus
                  className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green mb-2"
                />
                <p className="text-xs text-charcoal-500 mb-2">
                  Paste a Google Maps share link (from the Share button on your listing), a maps.app.goo.gl link, or just your shop's name and city.
                </p>
                {searchError && (
                  <p className="text-xs text-red-400 bg-red-950/30 border border-red-900/30 rounded-lg px-3 py-2 mb-2">{searchError}</p>
                )}
                <button onClick={() => setShowAdvanced(true)}
                  className="text-xs text-charcoal-400 hover:text-charcoal-600 underline transition-colors mb-2 block">
                  Can't find it? Enter a Place ID manually
                </button>
              </>
            )}

            <div className="flex gap-3">
              <button
                onClick={resetImportModal}
                className="flex-1 px-4 py-2.5 bg-warm-200 border border-warm-300 rounded-lg text-sm text-charcoal-400 hover:text-charcoal-900 transition-colors">
                {importResult ? 'Done' : 'Cancel'}
              </button>
              {!importResult && candidates && !showAdvanced && (
                <button
                  onClick={() => selectedCandidateId && handleImport(selectedCandidateId)}
                  disabled={importLoading || !selectedCandidateId}
                  className="flex-1 bg-od-green text-white font-semibold py-2.5 rounded-lg text-sm hover:opacity-90 transition-opacity disabled:opacity-50">
                  {importLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                      Importing...
                    </span>
                  ) : 'Yes, import reviews'}
                </button>
              )}
              {!importResult && showAdvanced && (
                <button
                  onClick={() => handleImport()}
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
              {!importResult && !candidates && !showAdvanced && (
                <button
                  onClick={handleSearch}
                  disabled={searchLoading || !searchQuery.trim()}
                  className="flex-1 bg-od-green text-white font-semibold py-2.5 rounded-lg text-sm hover:opacity-90 transition-opacity disabled:opacity-50">
                  {searchLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                      Searching...
                    </span>
                  ) : 'Find My Business'}
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
