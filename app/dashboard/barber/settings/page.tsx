'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import BarberNav from '@/components/BarberNav'
import BarberMobileNav from '@/components/BarberMobileNav'
import { Suspense } from 'react'

function BarberSettingsInner() {
  const [profile, setProfile] = useState<any>(null)
  const [shopBarber, setShopBarber] = useState<any>(null)
  const [shop, setShop] = useState<any>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [squareAccount, setSquareAccount] = useState<any>(null)
  const [disconnectingSquare, setDisconnectingSquare] = useState(false)

  const [fullName, setFullName] = useState('')
  const [alias, setAlias] = useState('')
  const [bio, setBio] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [squareConnected, setSquareConnected] = useState(false)
  const [squareMerchantId, setSquareMerchantId] = useState<string | null>(null)
  const [disconnectingSquare, setDisconnectingSquare] = useState(false)

  const photoRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  useEffect(() => { loadData() }, [])

  useEffect(() => {
    if (searchParams.get('square_connected') === '1') {
      setSuccess('Square account connected successfully.')
      loadData()
    }
    if (searchParams.get('square_error')) {
      setError(`Square connection failed: ${searchParams.get('square_error')}`)
    }
  }, [searchParams])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setUserId(user.id)

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()
    setProfile(profile)
    setFullName(profile?.full_name || '')

    const { data: shopBarber } = await supabase
      .from('shop_barbers')
      .select('*, shops(*)')
      .eq('barber_id', user.id)
      .eq('active', true)
      .maybeSingle()

    if (!shopBarber) { router.push('/join'); return }
    setShopBarber(shopBarber)
    setShop(shopBarber.shops)
    setAlias(shopBarber.alias || '')
    setBio(shopBarber.bio || '')
    setPhotoUrl(shopBarber.photo_url || '')
    setSquareConnected(!!shopBarber.square_access_token)
    setSquareMerchantId(shopBarber.square_merchant_id || null)

    const params = new URLSearchParams(window.location.search)
    if (params.get('square_connected') === '1') {
      setSuccess('Square account connected successfully.')
      window.history.replaceState({}, '', window.location.pathname)
    }
    if (params.get('square_error')) {
      setError(`Square connection failed: ${params.get('square_error')}`)
      window.history.replaceState({}, '', window.location.pathname)
    }

    setLoading(false)
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { setError('Photo must be under 2MB'); return }
    setUploadingPhoto(true)
    setError('')

    const path = `barbers/${shopBarber.id}/photo`
    const { error: uploadErr } = await supabase.storage
      .from('shop-assets')
      .upload(path, file, { upsert: true })

    if (uploadErr) { setError(uploadErr.message); setUploadingPhoto(false); return }

    const { data } = supabase.storage.from('shop-assets').getPublicUrl(path)
    const { error: updateErr } = await supabase.from('shop_barbers').update({ photo_url: data.publicUrl }).eq('id', shopBarber.id)
    if (updateErr) { setError(updateErr.message); setUploadingPhoto(false); return }
    setPhotoUrl(data.publicUrl)
    setUploadingPhoto(false)
  }

  async function handleSquareDisconnect() {
    setDisconnectingSquare(true)
    try {
      await fetch('/api/square/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'barber' }),
      })
      setSquareConnected(false)
      setSquareMerchantId(null)
      setSuccess('Square account disconnected.')
    } finally {
      setDisconnectingSquare(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    setSuccess('')

    const { error: profileErr } = await supabase
      .from('profiles')
      .update({ full_name: fullName })
      .eq('id', profile.id)

    if (profileErr) { setError(profileErr.message); setSaving(false); return }

    const { error: barberErr } = await supabase
      .from('shop_barbers')
      .update({ alias, bio })
      .eq('id', shopBarber.id)

    if (barberErr) { setError(barberErr.message); setSaving(false); return }

    setSuccess('Profile updated.')
    setSaving(false)
    setTimeout(() => setSuccess(''), 3000)
  }

  async function handleDisconnectSquare() {
    setDisconnectingSquare(true)
    await supabase.from('square_accounts').delete().eq('user_id', userId!)
    setSquareAccount(null)
    setDisconnectingSquare(false)
    setSuccess('Square account disconnected.')
    setTimeout(() => setSuccess(''), 3000)
  }

  if (loading) return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center">
      <div className="text-od-green text-sm">Loading...</div>
    </div>
  )

  const color = shopBarber?.color || '#b8861f'
  const initial = (fullName || shopBarber?.barber_name || 'B')[0].toUpperCase()

  return (
    <div className="min-h-screen bg-warm-50">
      <BarberNav
        shopName={shop?.name || ''}
        barberName={shopBarber?.barber_name || shopBarber?.alias || ''}
        color={shopBarber?.color || '#b8861f'}
        initial={initial}
        photoUrl={shopBarber?.photo_url || undefined}
        userId={userId || undefined}
      />

      <div className="p-6 max-w-2xl mx-auto pb-20 md:pb-0">
        <div className="mb-8">
          <h1 className="font-serif text-2xl text-charcoal-900 mb-1">My Profile</h1>
          <p className="text-charcoal-500 text-sm">{shop?.name} · How clients see you</p>
        </div>

        {error && <p className="text-red-400 text-sm bg-red-950 border border-red-900 rounded-lg p-3 mb-6">{error}</p>}
        {success && <p className="text-green-400 text-sm bg-green-950 border border-green-900 rounded-lg p-3 mb-6">{success}</p>}

        {/* PHOTO */}
        <div className="bg-warm-100 border border-warm-200 rounded-xl p-6 mb-6">
          <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-5">Profile Photo</div>
          <div className="flex items-center gap-5">
            <div className="relative flex-shrink-0">
              {photoUrl ? (
                <img src={photoUrl} alt="Profile"
                  className="w-24 h-24 rounded-full object-cover border-4"
                  style={{ borderColor: color }} />
              ) : (
                <div className="w-24 h-24 rounded-full flex items-center justify-center font-serif text-3xl font-bold border-4"
                  style={{ background: color + '22', borderColor: color, color }}>
                  {initial}
                </div>
              )}
            </div>
            <div>
              <p className="text-sm text-charcoal-900 font-medium mb-1">{fullName || shopBarber?.barber_name}</p>
              <p className="text-xs text-charcoal-500 mb-3">{shop?.name}</p>
              <button
                onClick={() => photoRef.current?.click()}
                disabled={uploadingPhoto}
                className="px-4 py-2 bg-warm-200 border border-warm-300 rounded-lg text-xs font-semibold text-charcoal-400 hover:border-od-green hover:text-od-green transition-colors disabled:opacity-50">
                {uploadingPhoto ? 'Uploading...' : 'Upload Photo'}
              </button>
              <input ref={photoRef} type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
              <p className="text-xs text-charcoal-600 mt-2">Square photo works best. Max 2MB.</p>
              {photoUrl && (
                <button
                  onClick={async () => {
                    setPhotoUrl('')
                    await supabase.from('shop_barbers').update({ photo_url: null }).eq('id', shopBarber.id)
                  }}
                  className="text-xs text-red-400 hover:text-red-300 mt-1 transition-colors block">
                  Remove photo
                </button>
              )}
            </div>
          </div>
        </div>

        {/* PROFILE INFO */}
        <div className="bg-warm-100 border border-warm-200 rounded-xl p-6 mb-6">
          <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-5">Profile Info</div>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Full Name</label>
              <input value={fullName} onChange={e => setFullName(e.target.value)}
                placeholder="Your full name"
                className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">
                Chair Name / Specialty
              </label>
              <input value={alias} onChange={e => setAlias(e.target.value)}
                placeholder="e.g. Fade King, The Surgeon"
                className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors" />
              <p className="text-xs text-charcoal-600 mt-1">Shown on the booking page under your name</p>
            </div>
            <div>
              <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Bio</label>
              <textarea value={bio} onChange={e => setBio(e.target.value)}
                rows={3}
                placeholder="Tell clients about your style, specialties, and experience..."
                className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors resize-none" />
              <p className="text-xs text-charcoal-600 mt-1">Shown on the shop profile page under your card</p>
            </div>
          </div>
        </div>

        {/* PREVIEW */}
        <div className="bg-warm-100 border border-warm-200 rounded-xl p-6 mb-6">
          <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-4">Booking Page Preview</div>
          <div className="flex flex-col items-center text-center bg-warm-200 rounded-xl p-5 w-40 mx-auto">
            {photoUrl ? (
              <img src={photoUrl} alt="Preview"
                className="w-14 h-14 rounded-full object-cover mb-3 border-2"
                style={{ borderColor: color }} />
            ) : (
              <div className="w-14 h-14 rounded-full flex items-center justify-center font-serif text-xl font-bold mb-3 border-2"
                style={{ background: color + '22', borderColor: color, color }}>
                {initial}
              </div>
            )}
            <div className="text-sm font-semibold text-charcoal-900">{fullName || shopBarber?.barber_name || 'Your Name'}</div>
            {alias && <div className="text-xs mt-0.5" style={{ color }}>{alias}</div>}
            {bio && <div className="text-xs text-charcoal-500 mt-1 line-clamp-2">{bio}</div>}
          </div>
        </div>

        {/* SQUARE PAYMENTS */}
        <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-warm-200 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-warm-200 border border-warm-300 flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="16" height="16" className="text-charcoal-500">
                <rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>
              </svg>
            </div>
            <div>
              <div className="font-serif text-charcoal-900 text-sm">Square Payments</div>
              <div className="text-xs text-charcoal-500">Accept payments for your appointments directly</div>
            </div>
            {squareConnected && (
              <span className="ml-auto text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full bg-od-green/10 text-od-green border border-od-green/20">
                Connected
              </span>
            )}
          </div>
          <div className="p-5">
            {squareConnected ? (
              <div>
                {squareMerchantId && (
                  <div className="text-xs text-charcoal-500 mb-4">
                    Merchant ID: <span className="font-mono text-charcoal-900">{squareMerchantId}</span>
                  </div>
                )}
                <p className="text-xs text-charcoal-500 mb-4">
                  Your Square account is linked. Payments you process through Square will automatically mark appointments as paid in ChairOS.
                </p>
                <button
                  onClick={handleSquareDisconnect}
                  disabled={disconnectingSquare}
                  className="px-4 py-2 rounded-lg border border-red-200 text-red-500 text-xs font-semibold hover:bg-red-50 transition-colors disabled:opacity-50">
                  {disconnectingSquare ? 'Disconnecting...' : 'Disconnect Square'}
                </button>
              </div>
            ) : (
              <div>
                <p className="text-xs text-charcoal-500 mb-4">
                  Connect your Square account to receive appointment payments directly. Payments will sync back to ChairOS and mark appointments as paid automatically.
                </p>
                <a
                  href="/api/square/connect?role=barber"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-charcoal-900 text-white text-xs font-semibold hover:opacity-90 transition-opacity">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                    <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
                  </svg>
                  Connect Square Account
                </a>
                <p className="text-xs text-charcoal-400 mt-3">You'll be redirected to Square to authorize. Your access token is stored securely.</p>
              </div>
            )}
          </div>
        </div>

        <button onClick={handleSave} disabled={saving}
          className="w-full bg-od-green hover:bg-od-green-light text-white font-semibold py-3 rounded-lg text-sm transition-colors disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Profile'}
        </button>
      </div>
      <BarberMobileNav />
    </div>
  )
}

export default function BarberSettings() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="text-amber-500 text-sm">Loading...</div>
      </div>
    }>
      <BarberSettingsInner />
    </Suspense>
  )
}
