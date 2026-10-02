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
import SquareHistorySync from '@/components/SquareHistorySync'
import { useVerticalLabels } from '@/lib/VerticalContext'
import { NOTIFICATION_EVENT_TYPES, defaultChannels } from '@/lib/notificationEvents'

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const DEFAULT_HOURS = DAYS.map(day => ({
  day,
  open: day !== 'Sunday',
  from: '09:00',
  to: day === 'Saturday' || day === 'Sunday' ? '16:00' : '18:00',
}))

// Normalize a pasted phone number to E.164-ish form so the voice webhook
// can match the Twilio "To" number against the stored value.
function normalizeVoiceNumber(raw: string): string | null {
  const digits = (raw || '').replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (digits.length === 10) return `+1${digits}`
  return digits ? `+${digits}` : null
}

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
  // Payout handles for QR checkout (Venmo / Cash App / Zelle). Clients scan
  // a QR code at POS and pay the owner directly in the wallet app.
  const [venmoHandle, setVenmoHandle] = useState('')
  const [cashappHandle, setCashappHandle] = useState('')
  const [zelleHandle, setZelleHandle] = useState('')
  const [requireCardToBook, setRequireCardToBook] = useState(false)
  const [requireConsentForm, setRequireConsentForm] = useState(false)
  const [depositsEnabled, setDepositsEnabled] = useState(false)
  const [depositType, setDepositType] = useState<'flat' | 'percent'>('percent')
  const [depositAmount, setDepositAmount] = useState('20')
  const [depositRefundWindowHours, setDepositRefundWindowHours] = useState('48')
  const [waitlistMinNoticeHours, setWaitlistMinNoticeHours] = useState('4')
  // Booking rules (Task 1): how far ahead clients can book, and the
  // late-cancel window. Stored as columns on shops, like the deposit and
  // waitlist knobs above.
  const [minAdvanceMinutes, setMinAdvanceMinutes] = useState('120')
  const [maxAdvanceDays, setMaxAdvanceDays] = useState('90')
  const [cancellationWindowHours, setCancellationWindowHours] = useState('24')
  const [cancellationPolicy, setCancellationPolicy] = useState('')
  const [slotIntervalMinutes, setSlotIntervalMinutes] = useState('30')
  const [dateExceptions, setDateExceptions] = useState<any[]>([])
  const [newExceptionDate, setNewExceptionDate] = useState('')
  const [newExceptionNote, setNewExceptionNote] = useState('')
  // Notification channel preferences (Task 3): per event type, push and/or
  // in-app. Stored as a jsonb map; a missing key means the type's defaults.
  const [notifChannels, setNotifChannels] = useState<Record<string, string[]>>({})
  const [digestEmail, setDigestEmail] = useState(false)
  const [savingNotifs, setSavingNotifs] = useState(false)
  const [missedCallTextbackEnabled, setMissedCallTextbackEnabled] = useState(false)
  const [twilioVoiceNumber, setTwilioVoiceNumber] = useState('')
  // Platform-owned missed-call text-back add-on ($10/mo): ChairOS provisions
  // the Twilio number, the shop just forwards unanswered calls to it.
  const [missedCallAddonActive, setMissedCallAddonActive] = useState(false)
  const [missedCallNumber, setMissedCallNumber] = useState('')
  const [addonBusy, setAddonBusy] = useState(false)
  const [provisioning, setProvisioning] = useState(false)
  const [addonError, setAddonError] = useState('')
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
  const [contactEmail, setContactEmail] = useState('')
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
    setContactEmail(shop.contact_email || '')
    setAddress(shop.address || '')
    setCity(shop.city || '')
    setLogoUrl(shop.logo_url || '')
    setHeroUrl(shop.hero_url || '')
    if (shop.hours) setHours(shop.hours)
    setBarbersCollectOwnPayments(!!shop.barbers_collect_own_payments)
    setVenmoHandle(shop.venmo_handle || '')
    setCashappHandle(shop.cashapp_handle || '')
    setZelleHandle(shop.zelle_handle || '')
    setRequireCardToBook(!!shop.require_card_to_book)
    setRequireConsentForm(!!shop.require_consent_form)
    setDepositsEnabled(!!shop.deposits_enabled)
    setDepositType(shop.deposit_type || 'percent')
    setDepositAmount(String(shop.deposit_amount ?? 20))
    setDepositRefundWindowHours(String(shop.deposit_refund_window_hours ?? 48))
    setWaitlistMinNoticeHours(String(shop.waitlist_min_notice_hours ?? 4))
    setMinAdvanceMinutes(String(shop.min_advance_minutes ?? 120))
    setMaxAdvanceDays(String(shop.max_advance_days ?? 90))
    setCancellationWindowHours(String(shop.cancellation_window_hours ?? 24))
    setCancellationPolicy(shop.cancellation_policy ?? '')
    setSlotIntervalMinutes(String(shop.slot_interval_minutes ?? 30))
    const { data: exc } = await supabase
      .from('shop_date_exceptions')
      .select('*')
      .eq('shop_id', shop.id)
      .order('date', { ascending: true })
    setDateExceptions(exc || [])
    const { data: notifPrefs } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()
    if (notifPrefs) {
      setNotifChannels((notifPrefs.channels as Record<string, string[]>) || {})
      setDigestEmail(!!notifPrefs.digest_email)
    }
    setMissedCallTextbackEnabled(!!shop.missed_call_textback_enabled)
    setTwilioVoiceNumber(shop.twilio_voice_number || '')
    setMissedCallAddonActive(!!shop.missed_call_addon_active)
    setMissedCallNumber(shop.missed_call_number || '')
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

  // Uploading straight from the browser to Storage using the client's own
  // session token turned out to be unreliable -- a session that goes stale
  // (backgrounded mobile tab, long-idle session) doesn't always get refreshed
  // in time, and the request lands as an opaque "new row violates row-level
  // security policy" instead of an upload. Routed through a server route
  // (app/api/shop/upload-asset) that verifies ownership once and writes with
  // the service role key, which isn't subject to the browser session at all.
  async function uploadAsset(file: File, kind: 'logo' | 'hero'): Promise<string | null> {
    const body = new FormData()
    body.append('file', file)
    body.append('kind', kind)
    const res = await fetch('/api/shop/upload-asset', { method: 'POST', body })
    // A dead session (refresh token itself expired/revoked, not just the
    // access token) gets caught upstream by proxy.ts, which redirects to
    // /login -- fetch() follows that silently and lands on 200 + login-page
    // HTML rather than our JSON, so res.ok alone can't be trusted here.
    if (res.redirected || !res.headers.get('content-type')?.includes('application/json')) {
      setError('Your session has expired. Please refresh the page and log in again.')
      return null
    }
    const json = await res.json().catch(() => ({ error: 'Upload failed' }))
    if (!res.ok) { setError(json.error || 'Upload failed'); return null }
    return json.url as string
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingLogo(true)
    setError('')
    const url = await uploadAsset(file, 'logo')
    if (url) {
      setLogoUrl(url)
    }
    setUploadingLogo(false)
  }

  async function handleHeroUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingHero(true)
    setError('')
    const url = await uploadAsset(file, 'hero')
    if (url) {
      setHeroUrl(url)
      await supabase.from('shops').update({ hero_url: url }).eq('id', shop.id)
    }
    setUploadingHero(false)
  }

  async function handleSquareDisconnect() {
    if (!window.confirm('Disconnect your Square account? You will no longer be able to take card payments in ChairOS until you reconnect.')) return
    setDisconnectingSquare(true)
    setError('')
    const { error } = await supabase.from('square_accounts').delete().eq('user_id', userId!)
    setDisconnectingSquare(false)
    if (error) { setError(error.message || 'Could not disconnect Square. Please try again.'); return }
    setSquareAccount(null)
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
      contact_email: contactEmail.trim() || null,
      address,
      city,
      logo_url: logoUrl,
      hero_url: heroUrl,
      hours,
      barbers_collect_own_payments: barbersCollectOwnPayments,
      venmo_handle: venmoHandle.trim() || null,
      cashapp_handle: cashappHandle.trim() || null,
      zelle_handle: zelleHandle.trim() || null,
      require_card_to_book: requireCardToBook,
      require_consent_form: requireConsentForm,
      google_place_id: googlePlaceId.trim() || null,
      meta_pixel_id: metaPixelId.trim() || null,
      google_tag_id: googleTagId.trim() || null,
      deposits_enabled: depositsEnabled,
      deposit_type: depositType,
      deposit_amount: parseFloat(depositAmount) || 0,
      deposit_refund_window_hours: parseInt(depositRefundWindowHours) || 0,
      waitlist_min_notice_hours: parseInt(waitlistMinNoticeHours) || 0,
      min_advance_minutes: Math.max(0, parseInt(minAdvanceMinutes) || 0),
      max_advance_days: Math.max(1, parseInt(maxAdvanceDays) || 90),
      cancellation_window_hours: Math.max(0, parseInt(cancellationWindowHours) || 0),
      cancellation_policy: cancellationPolicy.trim() || null,
      slot_interval_minutes: Math.max(5, parseInt(slotIntervalMinutes) || 30),
      twilio_voice_number: normalizeVoiceNumber(twilioVoiceNumber),
      missed_call_textback_enabled: missedCallTextbackEnabled,
      referral_program_enabled: referralProgramEnabled,
      referral_reward_type: referralRewardType,
      referral_reward_value: parseFloat(referralRewardValue) || 0,
    }).eq('id', shop.id)

    if (saveErr) { setError(saveErr.message); setSaving(false); return }
    setSuccess('Settings saved.')
    setSaving(false)
    setTimeout(() => setSuccess(''), 3000)
  }

  async function addDateException() {
    if (!newExceptionDate || !shop) return
    const { data, error } = await supabase.from('shop_date_exceptions').insert({
      shop_id: shop.id,
      date: newExceptionDate,
      is_closed: true,
      note: newExceptionNote.trim() || null,
    }).select().single()
    if (error) { setError(error.message); return }
    setDateExceptions(prev => [...prev, data].sort((a, b) => a.date.localeCompare(b.date)))
    setNewExceptionDate('')
    setNewExceptionNote('')
    setSuccess('Closed date added — no one can book that day.')
    setTimeout(() => setSuccess(''), 3000)
  }

  async function removeDateException(id: string) {
    const { error } = await supabase.from('shop_date_exceptions').delete().eq('id', id)
    if (error) { setError(error.message); return }
    setDateExceptions(prev => prev.filter(e => e.id !== id))
  }

  function effNotifChannels(key: string): string[] {
    const v = notifChannels[key]
    return Array.isArray(v) ? v : defaultChannels(key)
  }

  function toggleNotifChannel(key: string, ch: 'push' | 'in_app') {
    setNotifChannels(prev => {
      const cur = effNotifChannels(key)
      const next = cur.includes(ch) ? cur.filter(c => c !== ch) : [...cur, ch]
      return { ...prev, [key]: next }
    })
  }

  async function saveNotifPrefs() {
    if (!userId) return
    setSavingNotifs(true)
    const { error } = await supabase.from('notification_preferences').upsert({
      user_id: userId,
      channels: notifChannels,
      digest_email: digestEmail,
      updated_at: new Date().toISOString(),
    })
    setSavingNotifs(false)
    if (error) { setError(error.message); return }
    setSuccess('Notification preferences saved.')
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

  // ---- Missed-call text-back add-on ($10/mo) ----
  function formatPhoneDisplay(e164: string) {
    const d = e164.replace(/\D/g, '')
    if (d.length === 11 && d.startsWith('1')) return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`
    return e164
  }

  async function addMissedCallAddon() {
    setAddonBusy(true)
    setAddonError('')
    try {
      const res = await fetch('/api/stripe/addon/missed-call', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not add the add-on.')
      setMissedCallAddonActive(true)
    } catch (err: any) {
      setAddonError(err.message || 'Something went wrong.')
    } finally {
      setAddonBusy(false)
    }
  }

  async function removeMissedCallAddon() {
    if (!window.confirm('Remove the missed-call text-back? Your forwarding number will be released.')) return
    setAddonBusy(true)
    setAddonError('')
    try {
      const res = await fetch('/api/stripe/addon/missed-call', { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not remove the add-on.')
      setMissedCallAddonActive(false)
      setMissedCallNumber('')
      setMissedCallTextbackEnabled(false)
    } catch (err: any) {
      setAddonError(err.message || 'Something went wrong.')
    } finally {
      setAddonBusy(false)
    }
  }

  async function provisionMissedCallNumber() {
    setProvisioning(true)
    setAddonError('')
    try {
      const res = await fetch('/api/voice/provision-number', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not get a number.')
      setMissedCallNumber(data.number)
    } catch (err: any) {
      setAddonError(err.message || 'Something went wrong.')
    } finally {
      setProvisioning(false)
    }
  }

  // Bring-your-own-Twilio block for shops that wired their own number
  // before the platform add-on existed — keeps working unchanged.
  const byoVoiceBlock = (
    <div>
      <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Your Twilio voice number</label>
      <input type="tel" value={twilioVoiceNumber} onChange={e => setTwilioVoiceNumber(e.target.value)} placeholder="+1 (555) 123-4567"
        className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green" />
      <div className="text-xs text-charcoal-500 mt-2">
        The Twilio phone number clients call. In your Twilio console, set this number&rsquo;s <span className="font-semibold">Status Callback URL</span> to:
        <div className="font-mono bg-warm-200 rounded px-2 py-1 mt-1 break-all">{typeof window !== 'undefined' ? window.location.origin : ''}/api/voice/missed-call</div>
        <div className="mt-1">If this number rings your staff through Twilio {"<Dial>"}, paste the same URL as the Dial action. Only missed calls get a text — answered calls are ignored, one text per caller every 4 hours, and anyone who replied STOP never gets one.</div>
      </div>
    </div>
  )

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

      <div className="p-6 max-w-3xl mx-auto md:pb-0">
        <div className="mb-8">
          <h1 className="font-serif text-2xl text-charcoal-900 mb-1">Shop Settings</h1>
          <p className="text-charcoal-500 text-sm">How your shop shows up for clients</p>
        </div>

        {error && <p className="text-red-400 text-sm bg-red-950 border border-red-900 rounded-lg p-3 mb-6">{error}</p>}
        {success && <p className="text-green-400 text-sm bg-green-950 border border-green-900 rounded-lg p-3 mb-6">{success}</p>}

        <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
          <div className="flex gap-1 bg-warm-200 rounded-lg p-1 w-fit flex-wrap">
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

          {/* Theme toggle stays visible regardless of tab -- it's the only
              place in the app to control light/dark/system, so it can't be
              buried behind a tab click the way the rarer settings can. */}
          <div className="flex gap-1 bg-warm-200 rounded-lg p-1 w-fit">
            {(['light', 'dark', 'system'] as const).map(t => (
              <button key={t} onClick={() => setTheme(t)}
                className={`px-3 py-2 rounded-md text-xs font-semibold transition-all ${theme === t ? 'bg-warm-300 text-charcoal-900' : 'text-charcoal-500'}`}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
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
                  className="btn-chairos-outline">
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
                className="btn-chairos-outline">
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
              <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Contact Email</label>
              <input value={contactEmail} onChange={e => setContactEmail(e.target.value)} type="email" placeholder="hello@yourshop.com"
                className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors" />
              <p className="text-xs text-charcoal-500 mt-1">Shown on your public booking page so clients can reach you.</p>
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
          <p className="text-xs text-charcoal-500 mb-4">A clean link instead of the shop code — clients can find you here.</p>
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

        {/* NOTIFICATIONS */}
        <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-warm-200">
            <div className="font-serif text-charcoal-900 text-sm">Notifications</div>
            <div className="text-xs text-charcoal-500">Choose which alerts reach you, and where. Turning both off for a type mutes it.</div>
          </div>
          <div className="p-6">
            <div className="flex items-center justify-between gap-4 pb-4 mb-2 border-b border-warm-200">
              <div>
                <div className="text-sm font-medium text-charcoal-900">Daily digest email</div>
                <div className="text-xs text-charcoal-500 mt-0.5">One evening email summarizing the day&apos;s unread alerts.</div>
              </div>
              <button
                onClick={() => setDigestEmail(v => !v)}
                aria-label="Daily digest email"
                className={`w-11 h-6 rounded-full relative transition-colors flex-shrink-0 ${digestEmail ? 'bg-od-green' : 'bg-warm-300'}`}>
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${digestEmail ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            </div>
            <div className="divide-y divide-warm-200">
              {NOTIFICATION_EVENT_TYPES.map(e => {
                const cur = effNotifChannels(e.key)
                return (
                  <div key={e.key} className="flex items-center justify-between gap-4 py-3">
                    <div className="text-sm text-charcoal-900">{e.label}</div>
                    <div className="flex gap-2">
                      {(['push', 'in_app'] as const).map(ch => (
                        <button
                          key={ch}
                          onClick={() => toggleNotifChannel(e.key, ch)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                            cur.includes(ch)
                              ? 'bg-od-green border-od-green text-white'
                              : 'bg-warm-200 border-warm-300 text-charcoal-500'
                          }`}>
                          {ch === 'push' ? 'Push' : 'In-app'}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
            <button
              onClick={saveNotifPrefs}
              disabled={savingNotifs}
              className="btn-chairos mt-4">
              {savingNotifs ? 'Saving...' : 'Save notification preferences'}
            </button>
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
                <div className="text-xs text-charcoal-500">On: each {staffLabel.toLowerCase()}&rsquo;s money goes to their own Square account, tips included. Off: it all comes to you and you pay them out.</div>
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
                <div className="text-xs text-charcoal-500">Clients enter a card when they book — they can save it or just pay once. Turn this off to let people book with no card.</div>
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

            {/* Require consent form toggle */}
            <div className="flex items-start justify-between gap-4 pb-5 mb-5 border-b border-warm-200">
              <div>
                <div className="text-sm font-semibold text-charcoal-900 mb-0.5">Require signed consent form to book</div>
                <div className="text-xs text-charcoal-500">Clients must sign your consent form before a booking can be confirmed. You can also have them sign in person on your phone. Turn this off to let people book with no consent form.</div>
              </div>
              <button
                onClick={() => setRequireConsentForm(v => !v)}
                style={{ background: requireConsentForm ? '#4B5320' : '#d4c9b8' }}
                className="relative flex-shrink-0 w-11 h-6 rounded-full transition-colors">
                <span
                  style={{ transform: requireConsentForm ? 'translateX(22px)' : 'translateX(2px)' }}
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
                  Your Square account is linked. Payments taken in Square update ChairOS on their own.
                </p>
                <SquareHistorySync shopId={shop.id} />
                <div className="mt-4">
                <button
                  onClick={handleSquareDisconnect}
                  disabled={disconnectingSquare}
                  className="px-4 py-2 rounded-lg border border-red-200 dark:border-red-900 text-red-500 dark:text-red-400 text-xs font-semibold hover:bg-red-50 dark:hover:bg-red-950 transition-colors disabled:opacity-50">
                  {disconnectingSquare ? 'Disconnecting...' : 'Disconnect Square'}
                </button>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-xs text-charcoal-500 mb-4">
                  Connect Square to take appointment payments. They sync back and mark appointments paid on their own.
                </p>
                <a
                  href="/api/square/connect?role=owner"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-charcoal-900 text-white text-xs font-semibold hover:opacity-90 transition-opacity">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                    <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
                  </svg>
                  Connect Square Account
                </a>
                <p className="text-xs text-charcoal-400 mt-3">We&apos;ll send you to Square to connect. Your credentials stay private.</p>
              </div>
            )}
          </div>
        </div>

        {/* GET PAID — digital wallets for QR checkout */}
        <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-warm-200 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-warm-200 border border-warm-300 flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="16" height="16" className="text-charcoal-500">
                <rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><path d="M7 15h4"/>
              </svg>
            </div>
            <div>
              <div className="font-serif text-charcoal-900 text-sm">Get paid</div>
              <div className="text-xs text-charcoal-500">Clients scan a QR code at checkout to pay you directly</div>
            </div>
          </div>
          <div className="p-5">
            <p className="text-xs text-charcoal-500 mb-4">
              Add your wallet handles and checkout will show a QR code the client scans to pay you in that app. No card reader needed — you tap &ldquo;Mark paid&rdquo; once you see the money land.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Venmo username</label>
                <input
                  value={venmoHandle}
                  onChange={e => setVenmoHandle(e.target.value)}
                  placeholder="@your-username"
                  className="w-full bg-white border border-warm-300 rounded-lg px-3 py-2.5 text-sm text-charcoal-900 outline-none focus:border-od-green transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Cash App tag</label>
                <input
                  value={cashappHandle}
                  onChange={e => setCashappHandle(e.target.value)}
                  placeholder="$yourtag"
                  className="w-full bg-white border border-warm-300 rounded-lg px-3 py-2.5 text-sm text-charcoal-900 outline-none focus:border-od-green transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Zelle email or phone</label>
                <input
                  value={zelleHandle}
                  onChange={e => setZelleHandle(e.target.value)}
                  placeholder="you@email.com"
                  className="w-full bg-white border border-warm-300 rounded-lg px-3 py-2.5 text-sm text-charcoal-900 outline-none focus:border-od-green transition-colors"
                />
                <p className="text-xs text-charcoal-400 mt-1.5">Whatever your bank has registered for Zelle — the client sends to this in their banking app.</p>
              </div>
            </div>
            <p className="text-xs text-charcoal-400 mt-4">Leave any blank you don&apos;t use. Hit Save at the bottom when you&apos;re done.</p>
          </div>
        </div>

        {/* DEPOSITS */}
        {(vertical === 'tattoo' || vertical === 'salon') && (
          <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden mb-6">
            <div className="px-5 py-4 border-b border-warm-200">
              <div className="font-serif text-charcoal-900 text-sm">Deposits</div>
              <div className="text-xs text-charcoal-500">Take a deposit at booking for services that need one</div>
            </div>
            <div className="p-5">
              <div className="flex items-start justify-between gap-4 pb-5 mb-5 border-b border-warm-200">
                <div>
                  <div className="text-sm font-semibold text-charcoal-900 mb-0.5">Require a deposit to book</div>
                  <div className="text-xs text-charcoal-500">Only for services where you&apos;ve switched deposits on (Manage Services). Nothing is charged until you turn this on.</div>
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
                <div className="text-xs text-charcoal-500 mt-2">Cancel at least this far ahead and the deposit comes back in full. Cancel later and it&apos;s gone.</div>
              </div>
            </div>
          </div>
        )}

        </>)}

        {tab === 'booking' && (<>

        {/* BOOKING RULES */}
        <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-warm-200">
            <div className="font-serif text-charcoal-900 text-sm">Booking Rules</div>
            <div className="text-xs text-charcoal-500">How far ahead clients can book, and how late they can cancel</div>
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Minimum advance notice (minutes)</label>
              <input type="number" min="0" step="15" value={minAdvanceMinutes} onChange={e => setMinAdvanceMinutes(e.target.value)}
                className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green" />
              <div className="text-xs text-charcoal-500 mt-2">Nobody can grab a slot starting sooner than this. Stops same-hour ambush bookings.</div>
            </div>
            <div>
              <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Booking window (days out)</label>
              <input type="number" min="1" value={maxAdvanceDays} onChange={e => setMaxAdvanceDays(e.target.value)}
                className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green" />
              <div className="text-xs text-charcoal-500 mt-2">How far ahead the calendar opens. Keeps the schedule from filling up a year out.</div>
            </div>
            <div>
              <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Late-cancel window (hours)</label>
              <input type="number" min="0" value={cancellationWindowHours} onChange={e => setCancellationWindowHours(e.target.value)}
                className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green" />
              <div className="text-xs text-charcoal-500 mt-2">Cancelling inside this window flags the booking as a late cancel on your calendar.</div>
            </div>
            <div>
              <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Slot spacing (minutes)</label>
              <input type="number" min="5" step="5" value={slotIntervalMinutes} onChange={e => setSlotIntervalMinutes(e.target.value)}
                className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green" />
              <div className="text-xs text-charcoal-500 mt-2">Times offered on the booking page — every 15 or 30 minutes, your call.</div>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Cancellation policy</label>
              <textarea value={cancellationPolicy} onChange={e => setCancellationPolicy(e.target.value)} rows={4}
                placeholder="e.g. Cancellations within 24 hours of your appointment will be charged 50% of the service price. No-shows will be charged the full amount."
                className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green resize-y" />
              <div className="text-xs text-charcoal-500 mt-2">Shown to clients on the booking page before they confirm. Keep it plain and direct.</div>
            </div>
          </div>
        </div>

        {/* DATA EXPORT */}
        <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-warm-200">
            <div className="font-serif text-charcoal-900 text-sm">Export Your Data</div>
            <div className="text-xs text-charcoal-500">Download your client list and appointment history as CSV files. Your data, your call.</div>
          </div>
          <div className="p-5 flex flex-col sm:flex-row gap-3">
            <a href="/api/shop/export?type=clients" download
              className="btn-chairos-outline text-center">
              Download Clients CSV
            </a>
            <a href="/api/shop/export?type=appointments" download
              className="btn-chairos-outline text-center">
              Download Appointments CSV
            </a>
          </div>
          <div className="px-5 pb-5">
            <div className="border-t border-warm-200 pt-4 mt-1">
              <div className="text-xs font-semibold text-charcoal-700 mb-1">Delete my account and all data</div>
              <div className="text-xs text-charcoal-500 mb-3">
                This requests permanent deletion of your shop, clients, appointments, and all associated data.
                Requests are completed within 30 days. This cannot be undone.
              </div>
              <button
                onClick={async () => {
                  if (!shop?.id) return
                  const reason = prompt('Why are you leaving? (optional)')
                  if (!confirm('Are you sure? This will permanently delete your shop and all its data. This cannot be undone.')) return
                  try {
                    const res = await fetch('/api/shop/deletion-request', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ shopId: shop.id, reason }),
                    })
                    const data = await res.json()
                    alert(data.ok ? data.message : (data.error || 'Could not submit request'))
                  } catch {
                    alert('Could not submit request. Try again.')
                  }
                }}
                className="text-xs px-4 py-2 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 transition-colors">
                Request Account Deletion
              </button>
            </div>
          </div>
        </div>

        {/* CLOSED DATES */}
        <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-warm-200">
            <div className="font-serif text-charcoal-900 text-sm">Closed Dates</div>
            <div className="text-xs text-charcoal-500">One-off days you're closed — vacations, holidays, sick days. No one can book these dates.</div>
          </div>
          <div className="p-5">
            {dateExceptions.length > 0 && (
              <div className="space-y-2 mb-4">
                {dateExceptions.map(e => (
                  <div key={e.id} className="flex items-center justify-between bg-warm-200 rounded-lg px-3 py-2">
                    <div>
                      <div className="text-sm font-medium text-charcoal-900">
                        {new Date(e.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                      {e.note && <div className="text-xs text-charcoal-500">{e.note}</div>}
                    </div>
                    <button onClick={() => removeDateException(e.id)} className="text-charcoal-600 hover:text-red-400 transition-colors text-lg leading-none px-2">×</button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-2">
              <input type="date" value={newExceptionDate} onChange={e => setNewExceptionDate(e.target.value)}
                className="bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green" />
              <input value={newExceptionNote} onChange={e => setNewExceptionNote(e.target.value)} placeholder="Note (optional) — e.g. Christmas"
                className="flex-1 bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green" />
              <button onClick={addDateException} disabled={!newExceptionDate}
                className="btn-chairos">
                Add
              </button>
            </div>
          </div>
        </div>

        {/* WAITLIST */}
        <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-warm-200">
            <div className="font-serif text-charcoal-900 text-sm">Waitlist</div>
            <div className="text-xs text-charcoal-500">When someone cancels, text the next person on the waitlist about the open slot</div>
          </div>
          <div className="p-5">
            <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Minimum Notice (hours before appointment)</label>
            <input type="number" min="1" value={waitlistMinNoticeHours} onChange={e => setWaitlistMinNoticeHours(e.target.value)}
              className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green" />
            <div className="text-xs text-charcoal-500 mt-2">Cancellations inside this window don&apos;t ping the waitlist — nobody&apos;s making it in on that little notice.</div>
          </div>
        </div>

        {/* MISSED CALL TEXT-BACK */}
        <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-warm-200 flex items-start justify-between gap-4">
            <div>
              <div className="font-serif text-charcoal-900 text-sm">Missed Call Text-Back</div>
              <div className="text-xs text-charcoal-500">When you miss a call, automatically text the caller a link to book</div>
            </div>
            {(missedCallAddonActive || twilioVoiceNumber) && (
              <button
                onClick={() => setMissedCallTextbackEnabled(v => !v)}
                style={{ background: missedCallTextbackEnabled ? '#4B5320' : '#d4c9b8' }}
                className="relative flex-shrink-0 w-11 h-6 rounded-full transition-colors">
                <span
                  style={{ transform: missedCallTextbackEnabled ? 'translateX(22px)' : 'translateX(2px)' }}
                  className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform block" />
              </button>
            )}
          </div>

          {addonError && (
            <div className="px-5 pt-4">
              <p className="text-red-400 text-xs bg-red-950 border border-red-900 rounded-lg p-3">{addonError}</p>
            </div>
          )}

          {!missedCallAddonActive && !twilioVoiceNumber && (
            <div className="p-5">
              <p className="text-sm text-charcoal-700 mb-2">Never lose a booking to a missed call. When you can&rsquo;t pick up, we text the caller a link to book online — automatically.</p>
              <p className="text-xs text-charcoal-500 mb-4">We provide the phone number, so there&rsquo;s nothing technical to set up. You just forward your unanswered calls to it. <span className="font-semibold text-charcoal-700">$10/month</span>, added to your subscription — one recovered haircut pays for months of it. Cancel anytime.</p>
              <button onClick={addMissedCallAddon} disabled={addonBusy}
                className="bg-od-green hover:bg-od-green-light text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50">
                {addonBusy ? 'Adding…' : 'Add it for $10/mo'}
              </button>
            </div>
          )}

          {!missedCallAddonActive && !!twilioVoiceNumber && missedCallTextbackEnabled && (
            <div className="p-5">
              {byoVoiceBlock}
            </div>
          )}

          {missedCallAddonActive && (
            <div className="p-5">
              {missedCallTextbackEnabled ? (
                missedCallNumber ? (
                  <>
                    <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Forward unanswered calls to</div>
                    <div className="font-mono text-2xl text-charcoal-900 mb-4">{formatPhoneDisplay(missedCallNumber)}</div>
                    <ol className="text-sm text-charcoal-600 space-y-2 list-decimal list-inside mb-4">
                      <li>On your business phone, turn on <span className="font-semibold">conditional call forwarding</span> — the kind that only kicks in when you don&rsquo;t answer.</li>
                      <li>Enter the number above as the forwarding number.</li>
                      <li>Test it: call your shop from another phone, let it ring out, and check the text comes through.</li>
                    </ol>
                    <p className="text-xs text-charcoal-500">Texts come from this number, so callers recognize it. One text per caller every 4 hours, and anyone who replies STOP never gets another.</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-charcoal-700 mb-4">You&rsquo;re subscribed. Grab your number and you&rsquo;re one step from done.</p>
                    <button onClick={provisionMissedCallNumber} disabled={provisioning}
                      className="bg-od-green hover:bg-od-green-light text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50">
                      {provisioning ? 'Getting your number…' : 'Get my forwarding number'}
                    </button>
                  </>
                )
              ) : (
                <p className="text-sm text-charcoal-500">Flip the switch above to turn it on. You&rsquo;ll get a forwarding number in the next step.</p>
              )}

              {twilioVoiceNumber && (
                <div className="mt-5 pt-4 border-t border-warm-200">
                  <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-3">Advanced: your own Twilio number</div>
                  {byoVoiceBlock}
                </div>
              )}

              <button onClick={removeMissedCallAddon} disabled={addonBusy}
                className="text-xs text-charcoal-500 underline underline-offset-2 hover:text-charcoal-700 mt-5 disabled:opacity-50">
                Remove the add-on
              </button>
            </div>
          )}
        </div>

        {/* REFERRAL PROGRAM */}
        <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-warm-200 flex items-start justify-between gap-4">
            <div>
              <div className="font-serif text-charcoal-900 text-sm">Referral Program</div>
              <div className="text-xs text-charcoal-500">Thank clients for sending new people your way</div>
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
                Every client gets their own referral link. When someone new books with it and finishes their first visit, the referrer&apos;s reward applies to their next booking automatically. They also get their link texted to them after their first visit here.
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
                <div className="text-xs text-charcoal-500">Pull in Google reviews, choose what shows, and credit the right {staffLabelPlural.toLowerCase()}</div>
              </div>
            </div>
            <button
              onClick={() => router.push('/dashboard/reviews')}
              className="btn-chairos whitespace-nowrap">
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
            <div className="text-xs text-charcoal-500">See which ads turn into bookings. Only runs on your public booking page.</div>
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
          className="btn-chairos w-full">
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
            className="btn-chairos-outline mt-4">
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

        {/* Team seats: extra owners/admins. Base plan includes 1 owner seat;
            additional seats are billed per seat (school package includes 5). */}
        {profile?.role !== 'barber' && (
          <div className="bg-warm-100 border border-warm-200 rounded-xl p-6 mt-6">
            <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-4">Team & Admin Seats</div>
            <div className="flex items-center justify-between">
              <div className="text-xs text-charcoal-500">Add co-owners or admins. Extra seats beyond your plan&apos;s included count are billed per seat.</div>
              <button onClick={() => router.push('/dashboard/settings/team')} className="btn-chairos whitespace-nowrap">Manage Team</button>
            </div>
          </div>
        )}

        {/* Portfolio: before/after photos shown in a swipeable gallery on the
            public booking page. */}
        {profile?.role !== 'barber' && (
          <div className="bg-warm-100 border border-warm-200 rounded-xl p-6 mt-6">
            <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-4">Portfolio</div>
            <div className="flex items-center justify-between">
              <div className="text-xs text-charcoal-500">Show off your best work — clients book with their eyes first.</div>
              <button onClick={() => router.push('/dashboard/settings/portfolio')} className="btn-chairos whitespace-nowrap">Manage Portfolio</button>
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