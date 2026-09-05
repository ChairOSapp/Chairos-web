'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import OwnerNav from '@/components/OwnerNav'
import StaffNav from '@/components/StaffNav'
import MobileNav from '@/components/MobileNav'
import { daysUntil } from '@/lib/billing'
import ServicesEditor from '@/components/ServicesEditor'
import { useVerticalLabels } from '@/lib/VerticalContext'

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const DEFAULT_HOURS = DAYS.map(day => ({
  day,
  open: day !== 'Sunday',
  from: '09:00',
  to: day === 'Saturday' || day === 'Sunday' ? '16:00' : '18:00',
}))

export default function ShopSettings() {
  const { staffLabel, staffLabelPlural, vertical } = useVerticalLabels()
  const [shop, setShop] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [myBarberRow, setMyBarberRow] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [deletionRequested, setDeletionRequested] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingHero, setUploadingHero] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'profile' | 'payments' | 'booking' | 'services' | 'advanced'>('profile')
  const [squareAccount, setSquareAccount] = useState<any>(null)
  const [disconnectingSquare, setDisconnectingSquare] = useState(false)
  const [barbersCollectOwnPayments, setBarbersCollectOwnPayments] = useState(false)
  const [requireCardToBook, setRequireCardToBook] = useState(false)
  const [depositsEnabled, setDepositsEnabled] = useState(false)
  const [depositType, setDepositType] = useState<'flat' | 'percent'>('percent')
  const [depositAmount, setDepositAmount] = useState('20')
  const [depositRefundWindowHours, setDepositRefundWindowHours] = useState('48')
  const [waitlistMinNoticeHours, setWaitlistMinNoticeHours] = useState('4')
  const [referralProgramEnabled, setReferralProgramEnabled] = useState(false)
  const [referralRewardType, setReferralRewardType] = useState<'percent_off' | 'flat_credit'>('percent_off')
  const [referralRewardValue, setReferralRewardValue] = useState('10')
  const [googlePlaceId, setGooglePlaceId] = useState('')
  const [metaPixelId, setMetaPixelId] = useState('')
  const [googleTagId, setGoogleTagId] = useState('')

  // Form state
  const [name, setName] = useState('')
  const [tagline, setTagline] = useState('')
  const [bio, setBio] = useState('')
  const [brandColor, setBrandColor] = useState('#b8861f')
  const [slug, setSlug] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [heroUrl, setHeroUrl] = useState('')
  const [hours, setHours] = useState<typeof DEFAULT_HOURS>(DEFAULT_HOURS)

  // Business tax info — used only by the unofficial 1099-style earnings
  // summary (app/api/reports/earnings-summary). Optional until a report is
  // generated, saved separately from the rest of shop settings.
  const [legalBusinessName, setLegalBusinessName] = useState('')
  const [businessAddress, setBusinessAddress] = useState('')
  const [ein, setEin] = useState('')
  const [savingTaxInfo, setSavingTaxInfo] = useState(false)
  const [taxInfoSuccess, setTaxInfoSuccess] = useState('')

  const logoRef = useRef<HTMLInputElement>(null)
  const heroRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const supabase = createClient()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setUserId(user.id)
    const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
    setProfile(prof)

    const { data: shops } = await supabase
      .from('shops').select('*').eq('owner_id', user.id)
      .order('created_at', { ascending: true }).limit(1)
    const shop = shops?.[0] || null
    if (!shop) { router.push('/onboarding'); return }

    setShop(shop)
    // Solo Chair (role='barber') sees the same top nav they see
    // everywhere else, not the owner's -- fetch their own shop_barbers
    // row for its name/color/photo.
    if (prof?.role === 'barber') {
      const { data: sb } = await supabase.from('shop_barbers').select('barber_name, alias, color, photo_url')
        .eq('shop_id', shop.id).eq('barber_id', user.id).maybeSingle()
      setMyBarberRow(sb)
    }
    setName(shop.name || '')
    setTagline(shop.tagline || '')
    setBio(shop.bio || '')
    setBrandColor(shop.brand_color || '#b8861f')
    setSlug(shop.slug || '')
    setPhone(shop.phone || '')
    setAddress(shop.address || '')
    setCity(shop.city || '')
    setLogoUrl(shop.logo_url || '')
    setHeroUrl(shop.hero_url || '')
    if (shop.hours) setHours(shop.hours)
    setBarbersCollectOwnPayments(!!shop.barbers_collect_own_payments)
    setRequireCardToBook(!!shop.require_card_to_book)
    setDepositsEnabled(!!shop.deposits_enabled)
    setDepositType(shop.deposit_type || 'percent')
    setDepositAmount(String(shop.deposit_amount ?? 20))
    setDepositRefundWindowHours(String(shop.deposit_refund_window_hours ?? 48))
    setWaitlistMinNoticeHours(String(shop.waitlist_min_notice_hours ?? 4))
    setReferralProgramEnabled(!!shop.referral_program_enabled)
    setReferralRewardType(shop.referral_reward_type || 'percent_off')
    setReferralRewardValue(String(shop.referral_reward_value ?? 10))
    setGooglePlaceId(shop.google_place_id || '')
    setMetaPixelId(shop.meta_pixel_id || '')
    setGoogleTagId(shop.google_tag_id || '')
    setLegalBusinessName(shop.legal_business_name || '')
    setBusinessAddress(shop.business_address || '')
    setEin(shop.ein || '')

    const { data: sq } = await supabase
      .from('square_accounts').select('square_merchant_id, square_location_id, connected_at').eq('user_id', user.id).maybeSingle()
    setSquareAccount(sq || null)

    // Handle Square OAuth return
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

  async function uploadFile(file: File, bucket: string, path: string, maxBytes: number): Promise<string | null> {
    if (file.size > maxBytes) {
      setError(`File too large. Maximum size is ${Math.round(maxBytes / 1024 / 1024)}MB`)
      return null
    }
    // getSession() refreshes an expired access token before we use it. Without
    // this, a session that went stale while the tab sat idle (backgrounded
    // mobile browser, sleeping laptop) sends the old JWT straight to Storage,
    // which just evaluates auth.uid() as null and rejects the RLS check —
    // surfacing as an opaque "new row violates row-level security policy".
    await supabase.auth.getSession()
    let { error } = await supabase.storage
      .from(bucket)
      .upload(path, file, { upsert: true })
    if (error?.message?.includes('row-level security')) {
      await supabase.auth.refreshSession()
      ;({ error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true }))
    }
    if (error) { setError(error.message); return null }
    const { data } = supabase.storage.from(bucket).getPublicUrl(path)
    // Append timestamp to bust CDN/browser cache on re-upload of same path
    return `${data.publicUrl}?t=${Date.now()}`
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingLogo(true)
    setError('')
    const url = await uploadFile(file, 'shop-assets', `${shop.id}/logo`, 2 * 1024 * 1024)
    if (url) {
      setLogoUrl(url)
      await supabase.from('shops').update({ logo_url: url }).eq('id', shop.id)
    }
    setUploadingLogo(false)
  }

  async function handleHeroUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingHero(true)
    setError('')
    const url = await uploadFile(file, 'shop-assets', `${shop.id}/hero`, 5 * 1024 * 1024)
    if (url) {
      setHeroUrl(url)
      await supabase.from('shops').update({ hero_url: url }).eq('id', shop.id)
    }
    setUploadingHero(false)
  }

  async function handleSquareDisconnect() {
    setDisconnectingSquare(true)
    await supabase.from('square_accounts').delete().eq('user_id', userId!)
    setSquareAccount(null)
    setDisconnectingSquare(false)
    setSuccess('Square account disconnected.')
    setTimeout(() => setSuccess(''), 3000)
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    setSuccess('')

    // Validate slug — lowercase, no spaces, alphanumeric and hyphens only
    if (slug && !/^[a-z0-9-]+$/.test(slug)) {
      setError('Slug can only contain lowercase letters, numbers, and hyphens')
      setSaving(false)
      return
    }

    // Check slug uniqueness if changed
    if (slug && slug !== shop.slug) {
      const { data: existing } = await supabase
        .from('shops').select('id').eq('slug', slug).maybeSingle()
      if (existing && existing.id !== shop.id) {
        setError('That URL is already taken. Try a different one.')
        setSaving(false)
        return
      }
    }

    const { error: saveErr } = await supabase.from('shops').update({
      name,
      tagline,
      bio,
      brand_color: brandColor,
      slug: slug || null,
      phone,
      address,
      city,
      logo_url: logoUrl,
      hero_url: heroUrl,
      hours,
      barbers_collect_own_payments: barbersCollectOwnPayments,
      require_card_to_book: requireCardToBook,
      google_place_id: googlePlaceId.trim() || null,
      meta_pixel_id: metaPixelId.trim() || null,
      google_tag_id: googleTagId.trim() || null,
      deposits_enabled: depositsEnabled,
      deposit_type: depositType,
      deposit_amount: parseFloat(depositAmount) || 0,
      deposit_refund_window_hours: parseInt(depositRefundWindowHours) || 0,
      waitlist_min_notice_hours: parseInt(waitlistMinNoticeHours) || 0,
      referral_program_enabled: referralProgramEnabled,
      referral_reward_type: referralRewardType,
      referral_reward_value: parseFloat(referralRewardValue) || 0,
    }).eq('id', shop.id)

    if (saveErr) { setError(saveErr.message); setSaving(false); return }
    setSuccess('Settings saved.')
    setSaving(false)
    setTimeout(() => setSuccess(''), 3000)
  }

  async function handleSaveTaxInfo() {
    setSavingTaxInfo(true)
    const { error: saveErr } = await supabase.from('shops').update({
      legal_business_name: legalBusinessName || null,
      business_address: businessAddress || null,
      ein: ein || null,
    }).eq('id', shop.id)
    setSavingTaxInfo(false)
    if (saveErr) { setError(saveErr.message); return }
    setTaxInfoSuccess('Saved.')
    setTimeout(() => setTaxInfoSuccess(''), 3000)
  }

  if (loading) return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center">
      <div className="text-od-green text-sm">Loading...</div>
    </div>
  )

  const initials = shop?.name?.split(' ').map((w: string) => w[0]).join('').substring(0,2).toUpperCase() || 'CH'

  return (
    <div className="min-h-screen bg-warm-50">
      {profile?.role === 'barber' ? (
        <StaffNav
          shopName={shop?.name || ''}
          barberName={myBarberRow?.barber_name || myBarberRow?.alias || profile?.full_name || 'You'}
          color={myBarberRow?.color || '#b8861f'}
          initial={(myBarberRow?.barber_name || myBarberRow?.alias || profile?.full_name || 'S')[0].toUpperCase()}
          photoUrl={myBarberRow?.photo_url || undefined}
          userId={userId || undefined}
        />
      ) : (
        <OwnerNav shopName={shop?.name} ownerName={''} initials={initials} userId={userId || undefined} />
      )}

      <div className="p-6 max-w-3xl mx-auto pb-20 md:pb-0">
        <div className="mb-8">
          <h1 className="font-serif text-2xl text-charcoal-900 mb-1">Shop Settings</h1>
          <p className="text-charcoal-500 text-sm">Customize how your shop appears to clients</p>
        </div>

        {error && <p className="text-red-400 text-sm bg-red-950 border border-red-900 rounded-lg p-3 mb-6">{error}</p>}
        {success && <p className="text-green-400 text-sm bg-green-950 border border-green-900 rounded-lg p-3 mb-6">{success}</p>}

        <div className="flex gap-1 bg-warm-200 rounded-lg p-1 mb-6 w-fit flex-wrap">
          {([
            { key: 'profile', label: 'Shop Profile' },
            { key: 'payments', label: 'Payments & Billing' },
            { key: 'booking', label: 'Booking Rules' },
            { key: 'services', label: 'Services' },
            { key: 'advanced', label: 'Advanced' },
          ] as { key: typeof tab; label: string }[]).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-md text-xs font-semibold transition-all ${tab === t.key ? 'bg-warm-300 text-charcoal-900' : 'text-charcoal-500'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'profile' && (<>

        {/* BRANDING */}
        <div className="bg-warm-100 border border-warm-200 rounded-xl p-6 mb-6">
          <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-5">Branding</div>

          {/* LOGO */}
          <div className="mb-6">
            <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-3">Shop Logo</label>
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-xl bg-warm-200 border border-warm-300 flex items-center justify-center overflow-hidden flex-shrink-0">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" />
                ) : (
                  <span className="font-serif text-2xl text-charcoal-600">{name[0] || '?'}</span>
                )}
              </div>
              <div>
                <button
                  onClick={() => logoRef.current?.click()}
                  disabled={uploadingLogo}
                  className="px-4 py-2 bg-warm-200 border border-warm-300 rounded-lg text-xs font-semibold text-charcoal-400 hover:border-od-green hover:text-od-green transition-colors disabled:opacity-50">
                  {uploadingLogo ? 'Uploading...' : 'Upload Logo'}
                </button>
                <input ref={logoRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                <p className="text-xs text-charcoal-600 mt-2">PNG or JPG. Square works best. Max 2MB.</p>
                {logoUrl && (
                  <button onClick={() => { setLogoUrl(''); supabase.from('shops').update({ logo_url: null }).eq('id', shop.id) }}
                    className="text-xs text-red-400 hover:text-red-300 mt-1 transition-colors">
                    Remove logo
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* HERO */}
          <div className="mb-6">
            <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-3">Hero / Banner Photo</label>
            <div className="w-full h-32 rounded-xl bg-warm-200 border border-warm-300 overflow-hidden mb-3 flex items-center justify-center relative">
              {heroUrl ? (
                <img src={heroUrl} alt="Hero" className="w-full h-full object-cover" />
              ) : (
                <span className="text-xs text-charcoal-600">No banner photo yet</span>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => heroRef.current?.click()}
                disabled={uploadingHero}
                className="px-4 py-2 bg-warm-200 border border-warm-300 rounded-lg text-xs font-semibold text-charcoal-400 hover:border-od-green hover:text-od-green transition-colors disabled:opacity-50">
                {uploadingHero ? 'Uploading...' : 'Upload Banner Photo'}
              </button>
              <input ref={heroRef} type="file" accept="image/*" onChange={handleHeroUpload} className="hidden" />
              {heroUrl && (
                <button onClick={() => { setHeroUrl(''); supabase.from('shops').update({ hero_url: null }).eq('id', shop.id) }}
                  className="px-4 py-2 bg-warm-200 border border-red-900 rounded-lg text-xs font-semibold text-red-400 hover:border-red-500 transition-colors">
                  Remove
                </button>
              )}
            </div>
            <p className="text-xs text-charcoal-600 mt-2">Wide photo of your shop. Shown at the top of your booking page. Max 5MB.</p>
          </div>

          {/* BRAND COLOR */}
          <div>
            <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-3">Brand Color</label>
            <div className="flex items-center gap-4">
              <input
                type="color"
                value={brandColor}
                onChange={e => setBrandColor(e.target.value)}
                className="w-12 h-12 rounded-lg border border-warm-300 bg-warm-200 cursor-pointer p-1"
              />
              <div>
                <div className="text-sm font-mono text-charcoal-900">{brandColor}</div>
                <div className="text-xs text-charcoal-500 mt-0.5">Used on your booking page buttons and accents</div>
              </div>
              <div className="flex gap-2 ml-auto">
                {['#b8861f','#2563eb','#16a34a','#dc2626','#7c3aed','#0891b2'].map(c => (
                  <button key={c} onClick={() => setBrandColor(c)}
                    className="w-7 h-7 rounded-full border-2 transition-all"
                    style={{ background: c, borderColor: brandColor === c ? '#fff' : 'transparent' }} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* SHOP INFO */}
        <div className="bg-warm-100 border border-warm-200 rounded-xl p-6 mb-6">
          <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-5">Shop Info</div>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Shop Name</label>
              <input value={name} onChange={e => setName(e.target.value)}
                className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Tagline</label>
              <input value={tagline} onChange={e => setTagline(e.target.value)}
                placeholder="e.g. Premium cuts in the heart of Jacksonville"
                className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">About Your Shop</label>
              <textarea value={bio} onChange={e => setBio(e.target.value)}
                rows={3} placeholder="Tell clients what makes your shop special..."
                className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Phone</label>
                <input value={phone} onChange={e => setPhone(e.target.value)}
                  className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors" />
              </div>
              <div>
                <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">City</label>
                <input value={city} onChange={e => setCity(e.target.value)}
                  className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Street Address</label>
              <input value={address} onChange={e => setAddress(e.target.value)}
                className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors" />
            </div>
          </div>
        </div>

        {/* CUSTOM URL */}
        <div className="bg-warm-100 border border-warm-200 rounded-xl p-6 mb-6">
          <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Custom Booking URL</div>
          <p className="text-xs text-charcoal-500 mb-4">Give your shop a clean URL instead of the shop code. Clients will be able to find you at this address.</p>
          <div className="flex items-center gap-0">
            <span className="bg-warm-200 border border-r-0 border-warm-300 rounded-l-lg px-4 py-3 text-xs text-charcoal-500 whitespace-nowrap">chairos.cc/shop/</span>
            <input
              value={slug}
              onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="precisehouse"
              className="flex-1 bg-warm-200 border border-warm-300 rounded-r-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors" />
          </div>
          <p className="text-xs text-charcoal-600 mt-2">Lowercase letters, numbers, and hyphens only. e.g. precise-house</p>
        </div>

        {/* PREVIEW */}
        <div className="bg-warm-100 border border-warm-200 rounded-xl p-6 mb-6">
          <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-4">Booking Page Preview</div>
          <div className="rounded-lg overflow-hidden border border-warm-300">
            {heroUrl && (
              <div className="h-24 overflow-hidden">
                <img src={heroUrl} alt="Hero" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="p-4" style={{ background: brandColor + '11' }}>
              <div className="flex items-center gap-3 mb-2">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" className="w-10 h-10 rounded-lg object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center font-serif text-lg"
                    style={{ background: brandColor + '33', color: brandColor }}>
                    {name[0] || '?'}
                  </div>
                )}
                <div>
                  <div className="font-serif text-charcoal-900 text-base">{name || 'Your Shop Name'}</div>
                  <div className="text-xs text-charcoal-400">{tagline || 'Your tagline appears here'}</div>
                </div>
              </div>
              <div className="text-xs text-charcoal-500 mb-3">{bio || 'Your shop description appears here'}</div>
              <button className="px-4 py-2 rounded-lg text-xs font-semibold text-black"
                style={{ background: brandColor }}>
                Book Appointment
              </button>
            </div>
          </div>
          <p className="text-xs text-charcoal-600 mt-3">
            Your booking page: <span className="text-od-green font-mono">
              {slug ? `chairos.cc/shop/${slug}` : `chairos.cc/book/${shop?.shop_code}`}
            </span>
          </p>
        </div>

        {/* HOURS */}
        <div className="bg-warm-100 border border-warm-200 rounded-xl p-6 mb-6">
          <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-5">Shop Hours</div>
          <div className="space-y-3">
            {hours.map((h, i) => (
              <div key={h.day} className="flex items-center gap-3">
                <div className="w-24 flex-shrink-0">
                  <button
                    onClick={() => setHours(prev => prev.map((d, j) => j === i ? { ...d, open: !d.open } : d))}
                    className={`w-full py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      h.open ? 'bg-od-green border-od-green text-white' : 'bg-warm-200 border-warm-300 text-charcoal-500'
                    }`}>
                    {h.day.slice(0, 3)}
                  </button>
                </div>
                {h.open ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="time"
                      value={h.from}
                      onChange={e => setHours(prev => prev.map((d, j) => j === i ? { ...d, from: e.target.value } : d))}
                      className="bg-warm-200 border border-warm-300 rounded-lg px-3 py-1.5 text-charcoal-900 text-xs outline-none focus:border-od-green w-28"
                    />
                    <span className="text-charcoal-600 text-xs">to</span>
                    <input
                      type="time"
                      value={h.to}
                      onChange={e => setHours(prev => prev.map((d, j) => j === i ? { ...d, to: e.target.value } : d))}
                      className="bg-warm-200 border border-warm-300 rounded-lg px-3 py-1.5 text-charcoal-900 text-xs outline-none focus:border-od-green w-28"
                    />
                  </div>
                ) : (
                  <div className="text-xs text-charcoal-600">Closed</div>
                )}
              </div>
            ))}
          </div>
        </div>

        </>)}

        {tab === 'payments' && (<>

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
              <div className="text-xs text-charcoal-500">Accept payments for appointments directly</div>
            </div>
            {squareAccount && (
              <span className="ml-auto text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full bg-od-green/10 text-od-green border border-od-green/20">
                Connected
              </span>
            )}
          </div>
          <div className="p-5">
            {/* Payment mode toggle */}
            <div className="flex items-start justify-between gap-4 pb-5 mb-5 border-b border-warm-200">
              <div>
                <div className="text-sm font-semibold text-charcoal-900 mb-0.5">{staffLabelPlural} collect their own tips & payments</div>
                <div className="text-xs text-charcoal-500">When on, payments go to each {staffLabel.toLowerCase()}'s Square account and tips stay with them. Turn off if you collect everything and pay {staffLabelPlural.toLowerCase()} out yourself.</div>
              </div>
              <button
                onClick={() => setBarbersCollectOwnPayments(v => !v)}
                style={{ background: barbersCollectOwnPayments ? '#4B5320' : '#d4c9b8' }}
                className="relative flex-shrink-0 w-11 h-6 rounded-full transition-colors">
                <span
                  style={{ transform: barbersCollectOwnPayments ? 'translateX(22px)' : 'translateX(2px)' }}
                  className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform block" />
              </button>
            </div>

            {/* Require card to book toggle */}
            <div className="flex items-start justify-between gap-4 pb-5 mb-5 border-b border-warm-200">
              <div>
                <div className="text-sm font-semibold text-charcoal-900 mb-0.5">Require card to book</div>
                <div className="text-xs text-charcoal-500">Clients must enter a card when booking online. They choose whether to save it for future visits or process it as one-time. Turn off to allow bookings without a card.</div>
              </div>
              <button
                onClick={() => setRequireCardToBook(v => !v)}
                style={{ background: requireCardToBook ? '#4B5320' : '#d4c9b8' }}
                className="relative flex-shrink-0 w-11 h-6 rounded-full transition-colors">
                <span
                  style={{ transform: requireCardToBook ? 'translateX(22px)' : 'translateX(2px)' }}
                  className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform block" />
              </button>
            </div>

            {squareAccount ? (
              <div>
                {squareAccount.square_merchant_id && (
                  <div className="text-xs text-charcoal-500 mb-4">
                    Merchant ID: <span className="font-mono text-charcoal-900">{squareAccount.square_merchant_id}</span>
                  </div>
                )}
                <p className="text-xs text-charcoal-500 mb-4">
                  Your Square account is linked. Appointment payments processed through Square will automatically update the payment status in ChairOS.
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
                  Connect your Square account to accept appointment payments directly. Payments will sync back to ChairOS and mark appointments as paid automatically.
                </p>
                <a
                  href="/api/square/connect?role=owner"
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

        {/* DEPOSITS */}
        {(vertical === 'tattoo' || vertical === 'salon') && (
          <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden mb-6">
            <div className="px-5 py-4 border-b border-warm-200">
              <div className="font-serif text-charcoal-900 text-sm">Deposits</div>
              <div className="text-xs text-charcoal-500">Collect a deposit at booking for services that require one</div>
            </div>
            <div className="p-5">
              {vertical === 'tattoo' ? (
                <div className="text-xs text-charcoal-500 bg-warm-200 rounded-lg p-3 mb-5">
                  Deposits are required for tattoo bookings and can't be turned off. Consultations skip the deposit by default — toggle that per service in Manage Services.
                </div>
              ) : (
                <div className="flex items-start justify-between gap-4 pb-5 mb-5 border-b border-warm-200">
                  <div>
                    <div className="text-sm font-semibold text-charcoal-900 mb-0.5">Require a deposit to book</div>
                    <div className="text-xs text-charcoal-500">Applies to services with deposits enabled (Manage Services). Consultations skip it by default.</div>
                  </div>
                  <button
                    onClick={() => setDepositsEnabled(v => !v)}
                    style={{ background: depositsEnabled ? '#4B5320' : '#d4c9b8' }}
                    className="relative flex-shrink-0 w-11 h-6 rounded-full transition-colors">
                    <span
                      style={{ transform: depositsEnabled ? 'translateX(22px)' : 'translateX(2px)' }}
                      className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform block" />
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 mb-5">
                <div>
                  <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Deposit Type</label>
                  <select value={depositType} onChange={e => setDepositType(e.target.value as 'flat' | 'percent')}
                    className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green">
                    <option value="percent">Percent of service price</option>
                    <option value="flat">Flat dollar amount</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">
                    Deposit Amount {depositType === 'percent' ? '(%)' : '($)'}
                  </label>
                  <input type="number" min="0" step={depositType === 'percent' ? '1' : '0.01'} value={depositAmount}
                    onChange={e => setDepositAmount(e.target.value)}
                    className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Full Refund Window (hours before appointment)</label>
                <input type="number" min="0" value={depositRefundWindowHours} onChange={e => setDepositRefundWindowHours(e.target.value)}
                  className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green" />
                <div className="text-xs text-charcoal-500 mt-2">Cancelling at least this many hours before the appointment refunds the deposit in full. Cancelling later forfeits it.</div>
              </div>
            </div>
          </div>
        )}

        </>)}

        {tab === 'booking' && (<>

        {/* WAITLIST */}
        <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-warm-200">
            <div className="font-serif text-charcoal-900 text-sm">Waitlist</div>
            <div className="text-xs text-charcoal-500">When a fully-booked appointment is cancelled, text the next waitlisted client the open slot</div>
          </div>
          <div className="p-5">
            <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Minimum Notice (hours before appointment)</label>
            <input type="number" min="1" value={waitlistMinNoticeHours} onChange={e => setWaitlistMinNoticeHours(e.target.value)}
              className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green" />
            <div className="text-xs text-charcoal-500 mt-2">A cancellation with less than this much notice never reaches out to the waitlist -- there's no realistic way for someone to make it in on a last-minute scramble text.</div>
          </div>
        </div>

        {/* REFERRAL PROGRAM */}
        <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-warm-200 flex items-start justify-between gap-4">
            <div>
              <div className="font-serif text-charcoal-900 text-sm">Referral Program</div>
              <div className="text-xs text-charcoal-500">Reward clients for bringing in new business</div>
            </div>
            <button
              onClick={() => setReferralProgramEnabled(v => !v)}
              style={{ background: referralProgramEnabled ? '#4B5320' : '#d4c9b8' }}
              className="relative flex-shrink-0 w-11 h-6 rounded-full transition-colors">
              <span
                style={{ transform: referralProgramEnabled ? 'translateX(22px)' : 'translateX(2px)' }}
                className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform block" />
            </button>
          </div>
          {referralProgramEnabled && (
            <div className="p-5">
              <p className="text-xs text-charcoal-500 mb-4">
                Every client gets their own referral link. When someone new books using it and completes their first visit, the referring client's reward is applied to their next booking automatically. They're also texted their own link after their first completed visit here.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Reward Type</label>
                  <select value={referralRewardType} onChange={e => setReferralRewardType(e.target.value as 'percent_off' | 'flat_credit')}
                    className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green">
                    <option value="percent_off">Percent off next visit</option>
                    <option value="flat_credit">Flat dollar credit</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">
                    Reward Value {referralRewardType === 'percent_off' ? '(%)' : '($)'}
                  </label>
                  <input type="number" min="0" step={referralRewardType === 'percent_off' ? '1' : '0.01'} value={referralRewardValue}
                    onChange={e => setReferralRewardValue(e.target.value)}
                    className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green" />
                </div>
              </div>
              <div className="text-xs text-charcoal-500 mt-4">
                Applies to whoever referred the new client only, not the new client's first visit itself.
              </div>
            </div>
          )}
        </div>

        {/* REVIEWS */}
        <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-warm-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-warm-200 border border-warm-300 flex items-center justify-center flex-shrink-0">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="16" height="16" className="text-charcoal-500">
                  <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
              </div>
              <div>
                <div className="font-serif text-charcoal-900 text-sm">Reviews</div>
                <div className="text-xs text-charcoal-500">Import from Google, manage visibility, assign to {staffLabelPlural.toLowerCase()}</div>
              </div>
            </div>
            <button
              onClick={() => router.push('/dashboard/reviews')}
              className="px-3 py-1.5 bg-od-green text-white rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity whitespace-nowrap">
              Manage Reviews
            </button>
          </div>
          <div className="p-5">
            <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Google Place ID</label>
            <input
              value={googlePlaceId}
              onChange={e => setGooglePlaceId(e.target.value)}
              placeholder="ChIJN1t_tDeuEmsRUsoyG83frY4"
              className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm font-mono outline-none focus:border-od-green transition-colors"
            />
            <p className="text-xs text-charcoal-500 mt-2">
              Save your Place ID here so you don't have to paste it each time you import. Find it at maps.google.com — search your shop, click Share, copy the ID from the URL (starts with "ChIJ").
            </p>
            {googlePlaceId && (
              <p className="text-xs text-od-green mt-2 font-semibold">
                ✓ Place ID saved — use "Import from Google" on the Reviews page to pull in new reviews.
              </p>
            )}
          </div>
        </div>

        </>)}

        {tab === 'advanced' && (<>

        {/* AD TRACKING */}
        <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-warm-200">
            <div className="font-serif text-charcoal-900 text-sm">Ad Tracking</div>
            <div className="text-xs text-charcoal-500">Track bookings from your Meta and Google ad campaigns. Only fires on your public booking page.</div>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Meta Pixel ID</label>
              <input
                value={metaPixelId}
                onChange={e => setMetaPixelId(e.target.value)}
                placeholder="123456789012345"
                className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm font-mono outline-none focus:border-od-green transition-colors"
              />
              <p className="text-xs text-charcoal-500 mt-2">
                From Meta Events Manager. Fires a PageView on your booking page and a Schedule event when a booking completes.
              </p>
            </div>
            <div>
              <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Google Tag ID</label>
              <input
                value={googleTagId}
                onChange={e => setGoogleTagId(e.target.value)}
                placeholder="AW-123456789 or G-XXXXXXXXXX"
                className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm font-mono outline-none focus:border-od-green transition-colors"
              />
              <p className="text-xs text-charcoal-500 mt-2">
                From Google Ads or Google Analytics. Fires a page_view on your booking page and a generate_lead event when a booking completes.
              </p>
            </div>
          </div>
        </div>

        </>)}

        <button onClick={handleSave} disabled={saving}
          className="w-full bg-od-green hover:bg-od-green-light text-white font-semibold py-3 rounded-lg text-sm transition-colors disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Settings'}
        </button>

        {tab === 'advanced' && (<>

        {/* BUSINESS TAX INFO */}
        <div className="bg-warm-100 border border-warm-200 rounded-xl p-6 mt-6">
          <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-1">Business Tax Info</div>
          <p className="text-xs text-charcoal-500 mb-4">
            Used only to fill in the payer section of the unofficial 1099-style earnings summaries you can generate for your {staffLabelPlural.toLowerCase()}. Optional until you generate your first report.
          </p>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Legal Business Name</label>
              <input type="text" value={legalBusinessName} onChange={e => setLegalBusinessName(e.target.value)}
                className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Business Address</label>
              <input type="text" value={businessAddress} onChange={e => setBusinessAddress(e.target.value)}
                className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">EIN</label>
              <input type="text" value={ein} onChange={e => setEin(e.target.value)} placeholder="XX-XXXXXXX"
                className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors" />
            </div>
          </div>
          <button onClick={handleSaveTaxInfo} disabled={savingTaxInfo}
            className="mt-4 px-4 py-2 bg-warm-200 border border-warm-300 rounded-lg text-xs font-semibold text-charcoal-900 hover:border-od-green transition-colors disabled:opacity-50">
            {savingTaxInfo ? 'Saving...' : 'Save Tax Info'}
          </button>
          {taxInfoSuccess && <span className="ml-3 text-xs text-od-green">{taxInfoSuccess}</span>}
        </div>

        </>)}

        {tab === 'payments' && (<>

        {/* BILLING */}
        <div className="bg-warm-100 border border-warm-200 rounded-xl p-6 mt-6">
          <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-4">Billing</div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-charcoal-900">
                {(() => {
                  const planLabel = profile?.plan_type === 'solo' ? 'Solo Chair Plan' : 'Shop Plan'
                  const planPrice = profile?.plan_type === 'solo' ? '$25/mo' : '$79/mo'
                  if (profile?.subscription_status === 'active') return `${planLabel} · ${planPrice}`
                  if (profile?.subscription_status === 'trialing') return `${planLabel} · Free Trial`
                  if (profile?.subscription_status === 'past_due') return `${planLabel} · Payment Failed`
                  if (profile?.subscription_status === 'cancelled') return `${planLabel} · Cancelled`
                  return planLabel
                })()}
              </div>
              <div className="text-xs text-charcoal-500 mt-0.5">
                {profile?.subscription_status === 'trialing' && profile?.trial_end && (
                  `Trial ends in ${daysUntil(profile.trial_end)} day${daysUntil(profile.trial_end) === 1 ? '' : 's'}`
                )}
                {profile?.subscription_status === 'active' && profile?.subscription_end_date && (
                  `Next charge ${new Date(profile.subscription_end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                )}
                {profile?.subscription_status === 'past_due' && 'Update your card to restore full access'}
                {profile?.subscription_status === 'cancelled' && profile?.subscription_end_date && (
                  `Access until ${new Date(profile.subscription_end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                )}
              </div>
            </div>
            {profile?.stripe_customer_id ? (
              <button
                onClick={() => router.push('/api/stripe/portal')}
                className="px-4 py-2 bg-warm-200 border border-warm-300 rounded-lg text-xs font-semibold text-charcoal-400 hover:border-od-green hover:text-od-green transition-colors whitespace-nowrap"
              >
                Manage Billing
              </button>
            ) : (
              <button
                onClick={() => router.push('/subscribe')}
                className="px-4 py-2 bg-od-green text-white rounded-lg text-xs font-semibold hover:opacity-80 transition-colors whitespace-nowrap"
              >
                Subscribe
              </button>
            )}
          </div>
        </div>

        {/* A Solo Chair (profile.role === 'barber') is the shop's only
            service provider by design -- the $25/mo solo plan has no
            per-seat billing for additional staff, so inviting one here
            would silently add a second barber the plan was never priced
            or built for. Only a Shop Owner sees this. */}
        {profile?.role !== 'barber' && (
          <div className="bg-warm-100 border border-warm-200 rounded-xl p-6 mt-6">
            <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-4">{staffLabelPlural} Invites</div>
            <div className="flex items-center justify-between">
              <div className="text-xs text-charcoal-500">All {staffLabelPlural.toLowerCase()} in your shop are covered by your plan</div>
              <button onClick={() => router.push('/dashboard/settings/invite')} className="btn-chairos whitespace-nowrap">Invite {staffLabelPlural}</button>
            </div>
          </div>
        )}

        </>)}

        {tab === 'services' && (<>

        {/* SERVICES */}
        {shop && (
          <div className="bg-warm-100 border border-warm-200 rounded-xl p-6 mt-6">
            <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-1">Services</div>
            <p className="text-xs text-charcoal-500 mb-4">Manage the services clients can book at your shop.</p>
            <ServicesEditor shopId={shop.id} />
          </div>
        )}

        </>)}

        {tab === 'advanced' && (<>

        {/* APPEARANCE */}
        <div className="bg-warm-100 border border-warm-200 rounded-xl p-6 mt-6">
          <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-4">Appearance</div>
          <div className="flex gap-3">
            {(['light', 'dark', 'system'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={theme === t ? 'btn-chairos' : 'btn-chairos-outline'}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          <p className="text-xs text-charcoal-500 mt-2">System follows your device setting. Default is System.</p>
        </div>

        {/* DANGER ZONE */}
        <div className="bg-warm-100 border border-red-900/40 rounded-xl p-6 mt-6">
          <div className="text-xs font-semibold tracking-widest uppercase text-red-400 mb-1">Danger Zone</div>
          <p className="text-xs text-charcoal-500 mb-4">
            Request deletion of your account and shop data. This isn't automatic — our team reviews every request
            (your shop has staff, clients, and billing history tied to it) and follows up by email.
          </p>
          <button
            onClick={async () => {
              if (deletionRequested) return
              if (!window.confirm('Request deletion of your ChairOS account and shop data? Our team will follow up by email to confirm before anything is removed.')) return
              const res = await fetch('/api/account/request-deletion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
              if (res.ok) setDeletionRequested(true)
            }}
            disabled={deletionRequested}
            className="px-4 py-2 bg-red-950 border border-red-900 rounded-lg text-xs font-semibold text-red-400 hover:bg-red-900/40 transition-colors disabled:opacity-60"
          >
            {deletionRequested ? 'Deletion requested — we\'ll follow up by email' : 'Request Account Deletion'}
          </button>
        </div>

        </>)}
      </div>

      <MobileNav />
    </div>
  )
}