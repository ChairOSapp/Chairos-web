'use client'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import OwnerNav from '@/components/OwnerNav'
import MobileNav from '@/components/MobileNav'

type Photo = {
  id: string
  shop_id: string
  barber_id: string | null
  photo_url: string
  caption: string | null
  sort_order: number
  created_at: string
}

type Barber = { barber_id: string | null; barber_name: string | null; alias: string | null }

export default function PortfolioPage() {
  const [shopName, setShopName] = useState('')
  const [photos, setPhotos] = useState<Photo[]>([])
  const [barbers, setBarbers] = useState<Barber[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [uploading, setUploading] = useState(false)
  const [caption, setCaption] = useState('')
  const [barberId, setBarberId] = useState('')
  const [actingId, setActingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editCaption, setEditCaption] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = createClient()

  async function load() {
    setLoading(true)
    setError('')
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }
    const res = await fetch('/api/shop/portfolio')
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Could not load portfolio')
      setLoading(false)
      return
    }
    setShopName(data.shop?.name || '')
    setPhotos(data.photos || [])

    // Barbers for the optional "credit this barber" picker.
    const { data: shopBarbers } = await supabase
      .from('shop_barbers')
      .select('barber_id, barber_name, alias')
      .eq('shop_id', data.shop?.id)
      .eq('active', true)
    setBarbers((shopBarbers || []).filter((b: Barber) => b.barber_id))
    setLoading(false)
  }

  useEffect(() => {
    // Mount-time data fetch; matches the pattern used across dashboard pages.
    // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
    load()
  }, [])

  async function upload(e: React.FormEvent) {
    e.preventDefault()
    const file = fileRef.current?.files?.[0]
    if (!file) {
      setError('Choose an image to upload.')
      return
    }
    setUploading(true)
    setError('')
    setNotice('')
    const form = new FormData()
    form.append('file', file)
    if (caption.trim()) form.append('caption', caption.trim())
    if (barberId) form.append('barber_id', barberId)
    const res = await fetch('/api/shop/portfolio', { method: 'POST', body: form })
    const data = await res.json()
    setUploading(false)
    if (!res.ok) {
      setError(data.error || 'Upload failed.')
      return
    }
    setPhotos((prev) => [...prev, data.photo])
    setCaption('')
    setBarberId('')
    if (fileRef.current) fileRef.current.value = ''
    setNotice('Photo added to your portfolio.')
  }

  async function remove(id: string) {
    if (!window.confirm('Remove this photo from the portfolio?')) return
    setActingId(id)
    setError('')
    const res = await fetch(`/api/shop/portfolio/${id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    setActingId(null)
    if (!res.ok) {
      setError(data.error || 'Could not remove photo.')
      return
    }
    setPhotos((prev) => prev.filter((p) => p.id !== id))
  }

  async function saveCaption(id: string) {
    setActingId(id)
    setError('')
    const res = await fetch(`/api/shop/portfolio/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caption: editCaption }),
    })
    const data = await res.json().catch(() => ({}))
    setActingId(null)
    if (!res.ok) {
      setError(data.error || 'Could not save caption.')
      return
    }
    setPhotos((prev) => prev.map((p) => (p.id === id ? data.photo : p)))
    setEditingId(null)
  }

  async function move(id: string, dir: -1 | 1) {
    const idx = photos.findIndex((p) => p.id === id)
    const swapIdx = idx + dir
    if (idx < 0 || swapIdx < 0 || swapIdx >= photos.length) return
    const a = photos[idx]
    const b = photos[swapIdx]
    setActingId(id)
    // Swap sort orders so the display order persists.
    const [r1, r2] = await Promise.all([
      fetch(`/api/shop/portfolio/${a.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sort_order: b.sort_order }),
      }),
      fetch(`/api/shop/portfolio/${b.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sort_order: a.sort_order }),
      }),
    ])
    setActingId(null)
    if (!r1.ok || !r2.ok) {
      setError('Could not reorder photos.')
      return
    }
    const next = [...photos]
    next[idx] = { ...a, sort_order: b.sort_order }
    next[swapIdx] = { ...b, sort_order: a.sort_order }
    next.sort((x, y) => x.sort_order - y.sort_order)
    setPhotos(next)
  }

  function barberNameFor(photo: Photo) {
    if (!photo.barber_id) return null
    const b = barbers.find((x) => x.barber_id === photo.barber_id)
    return b ? b.barber_name || b.alias : null
  }

  const initials = shopName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .substring(0, 2)
    .toUpperCase() || 'CH'

  return (
    <div className="min-h-screen bg-warm-50">
      <OwnerNav shopName={shopName} ownerName={''} initials={initials} />
      <div className="p-6 max-w-4xl mx-auto md:pb-0">
        <div className="mb-6">
          <h1 className="font-serif text-2xl text-charcoal-900 mb-1">Portfolio</h1>
          <p className="text-charcoal-500 text-sm">
            {shopName ? `${shopName} · ` : ''}Show off your best work — these photos appear in a
            swipeable gallery on your public booking page.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-4 mb-4">{error}</div>
        )}
        {notice && (
          <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-xl p-4 mb-4">{notice}</div>
        )}

        {/* Upload */}
        <form onSubmit={upload} className="bg-warm-100 border border-warm-200 rounded-xl p-5 mb-6">
          <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500 mb-3">
            Add a photo
          </div>
          <div className="flex flex-col md:flex-row gap-3">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="text-sm text-charcoal-700 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-od-green file:text-white hover:file:opacity-90"
            />
            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Caption (optional) — e.g. Skin fade, before & after"
              className="flex-1 text-sm border border-warm-200 rounded-lg px-3 py-2 bg-white text-charcoal-900 placeholder:text-charcoal-600"
              maxLength={120}
            />
          </div>
          <div className="flex flex-col md:flex-row gap-3 mt-3">
            <select
              value={barberId}
              onChange={(e) => setBarberId(e.target.value)}
              className="text-sm border border-warm-200 rounded-lg px-3 py-2 bg-white text-charcoal-900"
            >
              <option value="">Shop-wide (no specific barber)</option>
              {barbers.map((b) => (
                <option key={b.barber_id} value={b.barber_id || ''}>
                  {b.barber_name || b.alias}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={uploading}
              className="px-5 py-2 rounded-lg text-sm font-semibold text-white bg-od-green hover:opacity-90 disabled:opacity-50"
            >
              {uploading ? 'Uploading…' : 'Upload photo'}
            </button>
          </div>
          <p className="text-xs text-charcoal-600 mt-3">JPG, PNG, WEBP, or GIF · up to 10MB.</p>
        </form>

        {/* Grid */}
        {loading ? (
          <div className="text-center text-charcoal-500 text-sm py-12">Loading portfolio…</div>
        ) : photos.length === 0 ? (
          <div className="text-center border border-dashed border-warm-300 rounded-xl py-12 px-6">
            <div className="text-charcoal-900 font-semibold mb-1">No portfolio photos yet</div>
            <p className="text-charcoal-500 text-sm">
              Upload your best cuts — clients book with their eyes first.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {photos.map((p, i) => (
              <div key={p.id} className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden">
                <div className="aspect-square bg-warm-200">
                  <img src={p.photo_url} alt={p.caption || 'Portfolio photo'} className="w-full h-full object-cover" loading="lazy" />
                </div>
                <div className="p-3">
                  {editingId === p.id ? (
                    <div className="flex gap-2">
                      <input
                        value={editCaption}
                        onChange={(e) => setEditCaption(e.target.value)}
                        className="flex-1 text-xs border border-warm-200 rounded-lg px-2 py-1.5 bg-white text-charcoal-900"
                        maxLength={120}
                        placeholder="Caption"
                      />
                      <button
                        onClick={() => saveCaption(p.id)}
                        disabled={actingId === p.id}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white bg-od-green disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-xs px-2 py-1.5 text-charcoal-500"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="text-xs text-charcoal-700 truncate">
                        {p.caption || <span className="text-charcoal-600 italic">No caption</span>}
                      </div>
                      {barberNameFor(p) && (
                        <div className="text-[11px] text-charcoal-500 mt-0.5">{barberNameFor(p)}</div>
                      )}
                    </>
                  )}
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex gap-1">
                      <button
                        onClick={() => move(p.id, -1)}
                        disabled={i === 0 || actingId === p.id}
                        className="text-xs px-2 py-1 rounded-md border border-warm-200 text-charcoal-600 disabled:opacity-30"
                        aria-label="Move earlier"
                      >
                        ←
                      </button>
                      <button
                        onClick={() => move(p.id, 1)}
                        disabled={i === photos.length - 1 || actingId === p.id}
                        className="text-xs px-2 py-1 rounded-md border border-warm-200 text-charcoal-600 disabled:opacity-30"
                        aria-label="Move later"
                      >
                        →
                      </button>
                      {editingId !== p.id && (
                        <button
                          onClick={() => {
                            setEditingId(p.id)
                            setEditCaption(p.caption || '')
                          }}
                          className="text-xs px-2 py-1 rounded-md border border-warm-200 text-charcoal-600"
                        >
                          Caption
                        </button>
                      )}
                    </div>
                    <button
                      onClick={() => remove(p.id)}
                      disabled={actingId === p.id}
                      className="text-xs font-semibold text-red-600 disabled:opacity-50"
                    >
                      {actingId === p.id ? '…' : 'Remove'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* In-flow spacer above the fixed mobile nav (app-wide pattern). */}
        <div aria-hidden className="md:hidden h-[calc(4rem+env(safe-area-inset-bottom))]" />
      </div>
      <MobileNav />
    </div>
  )
}
