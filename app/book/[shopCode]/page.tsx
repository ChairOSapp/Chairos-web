'use client'
import { useEffect, useState, useRef, Suspense } from 'react'
import { createClient } from '@/lib/supabase'
import { useParams, useSearchParams } from 'next/navigation'
import Turnstile, { type TurnstileHandle } from '@/components/Turnstile'

const CAPTCHA_ENABLED = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

function BookingPageInner() {
  const params = useParams()
  const shopCode = (params.shopCode as string)?.toUpperCase()
  const supabase = createClient()
  const searchParams = useSearchParams()

  const [shop, setShop] = useState<any>(null)
  const [barbers, setBarbers] = useState<any[]>([])
  const [services, setServices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [shopReviews, setShopReviews] = useState<any[]>([])
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  const [selectedBarber, setSelectedBarber] = useState<any>(null)
  const [selectedService, setSelectedService] = useState<any>(null)
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedTime, setSelectedTime] = useState('')
  const [availableSlots, setAvailableSlots] = useState<string[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [smsConsent, setSmsConsent] = useState(false)
  const [emailConsent, setEmailConsent] = useState(false)
  const [error, setError] = useState('')
  const [returningClient, setReturningClient] = useState<any>(null)
  const [captchaToken, setCaptchaToken] = useState('')
  const turnstileRef = useRef<TurnstileHandle>(null)
  // Public page — no logged-in user, so labels come from this shop's own
  // vertical (already loaded with the shop row), not useVerticalLabels()
  // which resolves via the current session and doesn't apply here.
  const [staffLabel, setStaffLabel] = useState('Barber')
  const [staffLabelLower, setStaffLabelLower] = useState('barber')

  // Square payment state
  const squareCardRef = useRef<any>(null)
  const [cardReady, setCardReady] = useState(false)
  const [cardLoading, setCardLoading] = useState(false)
  const [paymentError, setPaymentError] = useState('')
  // 'save' = store card for later checkout, 'charge' = one-time charge now
  const [cardMode, setCardMode] = useState<'save' | 'charge'>('save')

  // Mirrors the gate computed server-side in /api/square/create-deposit —
  // tattoo shops always require a deposit, salon shops only if the owner
  // enabled it, and Consultation (or any service with deposit_required off)
  // is always exempt.
  const requiresDeposit = !!shop && !!selectedService &&
    (shop.vertical === 'tattoo' || (shop.vertical === 'salon' && shop.deposits_enabled)) &&
    selectedService.deposit_required === true
  const depositAmountEstimate = requiresDeposit && selectedService?.price != null
    ? (shop.deposit_type === 'flat' ? Number(shop.deposit_amount) : Math.round(selectedService.price * (Number(shop.deposit_amount) / 100) * 100) / 100)
    : null

  useEffect(() => {
    async function load() {
      const { data: shop } = await supabase
        .from('shops').select('*').eq('shop_code', shopCode).maybeSingle()
      if (!shop) { setNotFound(true); setLoading(false); return }
      setShop(shop)

      const { data: verticalMeta } = await supabase
        .from('vertical_config').select('staff_label').eq('vertical', shop.vertical).maybeSingle()
      if (verticalMeta?.staff_label) {
        setStaffLabel(verticalMeta.staff_label)
        setStaffLabelLower(verticalMeta.staff_label.toLowerCase())
      }

      const { data: barbers } = await supabase
        .from('shop_barbers').select('*')
        .eq('shop_id', shop.id).eq('active', true)
      setBarbers(barbers || [])

      const barberParam = searchParams.get('barber')
      if (barberParam && barbers) {
        const preSelected = barbers.find((b: any) => b.id === barberParam)
        if (preSelected) {
          setSelectedBarber(preSelected)
          setStep(2)
        }
      }

      const { data: services } = await supabase
        .from('services').select('*')
        .eq('shop_id', shop.id).eq('active', true)
        .order('price', { ascending: true })
      setServices(services || [])

      // Fetch top reviews for the shop preview
      let reviewsData: any[] | null = null
      if (barberParam) {
        const { data: barberReviews } = await supabase
          .from('reviews')
          .select('*')
          .eq('shop_id', shop.id)
          .eq('visible', true)
          .eq('barber_id', barberParam)
          .order('rating', { ascending: false })
          .limit(3)
        if (barberReviews && barberReviews.length > 0) {
          reviewsData = barberReviews
        }
      }
      if (!reviewsData || reviewsData.length === 0) {
        const { data: shopLevelReviews } = await supabase
          .from('reviews')
          .select('*')
          .eq('shop_id', shop.id)
          .eq('visible', true)
          .order('rating', { ascending: false })
          .limit(3)
        reviewsData = shopLevelReviews || []
      }
      setShopReviews(reviewsData || [])

      setLoading(false)
    }
    load()
  }, [shopCode])

  // Initialize Square Web Payments SDK when user reaches step 4 and shop requires card
  useEffect(() => {
    if (step !== 4) return
    if (!shop?.require_card_to_book && !requiresDeposit) return
    if (squareCardRef.current) return // already initialized

    const appId = process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID
    const locationId = process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID
    if (!appId || !locationId) return

    setCardLoading(true)
    let isMounted = true

    async function initSquare() {
      try {
        const { payments } = await import('@square/web-sdk')
        if (!isMounted) return
        const paymentsInstance = await payments(appId!, locationId!)
        if (!isMounted) return
        if (!paymentsInstance) throw new Error('Square payments init returned null')
        const card = await paymentsInstance.card()
        if (!isMounted) return
        await card.attach('#square-card-container')
        if (!isMounted) return
        squareCardRef.current = card
        setCardReady(true)
      } catch (e: any) {
        if (!isMounted) return
        console.error('Square init error:', e)
        setPaymentError('Card form failed to load. You can still book and pay at the shop.')
      } finally {
        if (isMounted) setCardLoading(false)
      }
    }
    initSquare()

    return () => {
      isMounted = false
      if (squareCardRef.current) {
        squareCardRef.current.destroy?.().catch(() => {})
        squareCardRef.current = null
        setCardReady(false)
      }
    }
  }, [step])

  // Real server-side availability, buffer-aware — replaces a fixed time
  // list that showed every slot regardless of existing bookings.
  useEffect(() => {
    if (!selectedDate || !selectedService) { setAvailableSlots([]); return }
    let cancelled = false
    setLoadingSlots(true)
    setSelectedTime('')
    const params = new URLSearchParams({ shopCode, date: selectedDate, serviceId: selectedService.id })
    if (selectedBarber?.barber_id) params.set('barberId', selectedBarber.barber_id)
    fetch(`/api/book/availability?${params.toString()}`)
      .then(r => r.json())
      .then(data => { if (!cancelled) setAvailableSlots(data.slots || []) })
      .catch(() => { if (!cancelled) setAvailableSlots([]) })
      .finally(() => { if (!cancelled) setLoadingSlots(false) })
    return () => { cancelled = true }
  }, [selectedDate, selectedService, selectedBarber, shopCode])

  async function checkReturningClient(phone: string) {
    if (phone.replace(/\D/g, '').length < 10) return
    // Anonymous callers can't read the clients table directly (it's PII,
    // scoped to shop owner/staff) -- this RPC returns only what the
    // booking flow needs, keyed by an exact phone match.
    const { data } = await supabase
      .rpc('find_client_for_booking', { p_phone: phone.replace(/\D/g, ''), p_shop_id: shop.id })
    const client = data?.[0]
    if (!client?.client_id) return
    setReturningClient(client)

    if (client.locked_barber_id) {
      const matchedBarber = barbers.find(b => b.id === client.locked_barber_id)
      if (matchedBarber) setSelectedBarber(matchedBarber)
    }
  }

  async function handleBook() {
    if (!clientName || !clientPhone) { setError('Name and phone are required'); return }
    if (clientPhone && !smsConsent) { setError('Please consent to SMS messages to receive your booking confirmation'); return }
    if (CAPTCHA_ENABLED && !captchaToken) { setError('Please complete the verification check'); return }
    setSubmitting(true)
    setError('')
    setPaymentError('')

    // Turnstile tokens are single-use -- any failure between here and the
    // appointment actually being created leaves the user retrying the same
    // button, which would resubmit a token /api/book/verify-captcha (or
    // Cloudflare) already consumed and reject as "timeout-or-duplicate".
    // Force a fresh challenge on every such early-exit.
    function resetCaptcha() {
      if (CAPTCHA_ENABLED) {
        setCaptchaToken('')
        turnstileRef.current?.reset()
      }
    }

    if (CAPTCHA_ENABLED) {
      const captchaRes = await fetch('/api/book/verify-captcha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: captchaToken }),
      })
      if (!captchaRes.ok) {
        setError('Verification failed, please try again')
        setSubmitting(false)
        resetCaptcha()
        return
      }
    }

    // Tokenize card if the shop requires it, or a deposit must be collected
    let sourceId: string | null = null
    if ((shop?.require_card_to_book || requiresDeposit) && squareCardRef.current) {
      const result = await squareCardRef.current.tokenize()
      if (result.status === 'OK') {
        sourceId = result.token
      } else {
        const msg = result.errors?.[0]?.message || 'Card error'
        setPaymentError(msg)
        setSubmitting(false)
        resetCaptcha()
        return
      }
    }

    // If a card was required but the SDK never produced a token, fail
    if ((shop?.require_card_to_book || requiresDeposit) && !sourceId) {
      setPaymentError('Card form not ready. Please refresh and try again.')
      setSubmitting(false)
      resetCaptcha()
      return
    }

    let paymentSucceeded = false

    // Look up or create client record. clients' SELECT policy is
    // owner/staff-scoped (it holds PII), so an anonymous booker can't
    // read back a row they just inserted -- hence the lookup RPC, and
    // generating the id client-side so the insert never needs a
    // RETURNING/select-after-insert that RLS would block. A plain
    // update also works fine as anon (verified directly), but
    // INSERT ... ON CONFLICT DO UPDATE does not: Postgres needs an
    // implicit SELECT-visibility check to detect the conflict, which
    // the owner/staff-scoped SELECT policy blocks for anon -- so this
    // branches into an explicit insert-or-update instead of a upsert.
    const normalizedPhone = clientPhone.replace(/\D/g, '')
    let clientId: string | null = null
    const { data: rpcData } = await supabase
      .rpc('find_client_for_booking', { p_phone: normalizedPhone, p_shop_id: shop.id })
    const existingClient = rpcData?.[0]

    const consentNow = new Date().toISOString()
    const clientFields: Record<string, any> = {
      full_name: clientName,
      email: clientEmail || null,
    }
    if (smsConsent && !existingClient?.sms_consent) {
      clientFields.sms_consent = true
      clientFields.sms_consent_at = consentNow
    }
    if (emailConsent && clientEmail && !existingClient?.email_consent) {
      clientFields.email_consent = true
      clientFields.email_consent_at = consentNow
    }

    if (existingClient?.client_id) {
      clientId = existingClient.client_id
      await supabase.from('clients').update(clientFields).eq('id', clientId)
    } else {
      const newId = crypto.randomUUID()
      const { error: newClientErr } = await supabase
        .from('clients')
        .insert({ id: newId, phone: normalizedPhone, ...clientFields })
      if (newClientErr) { setError('Failed to create client record. Please try again.'); setSubmitting(false); resetCaptcha(); return }
      clientId = newId
    }

    // Record shop membership for this client (new or returning) — non-fatal
    if (clientId && shop?.id) {
      fetch('/api/book/membership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, shopId: shop.id }),
      }).catch(() => {})
    }

    const [time, period] = selectedTime.split(' ')
    const [hours, minutes] = time.split(':')
    let h = parseInt(hours)
    if (period === 'PM' && h !== 12) h += 12
    if (period === 'AM' && h === 12) h = 0
    const time24 = `${h.toString().padStart(2,'0')}:${minutes}:00`

    // Create appointment first so we have an ID for Square payment.
    // appointments' SELECT policy is barber-scoped (auth.uid() = barber_id),
    // so an anonymous booking -- barber_id is often null ("Any Barber"), and
    // there's no auth.uid() at all -- can never read back a row it just
    // inserted. Generating the id client-side (appointments.id already
    // defaults to gen_random_uuid()) avoids ever needing a
    // RETURNING/select-after-insert that RLS would block.
    const newApptId = crypto.randomUUID()
    const { error: bookErr } = await supabase.from('appointments').insert({
      id: newApptId,
      shop_id: shop.id,
      barber_id: selectedBarber?.barber_id || null,
      service_id: selectedService.id,
      client_id: clientId,
      client_name: clientName,
      client_phone: clientPhone,
      client_email: clientEmail || null,
      date: selectedDate,
      time: time24,
      price: selectedService.price,
      status: 'pending',
      notes: notes || null,
      payment_status: 'unpaid',
    })

    if (bookErr) { setError(bookErr.message || 'Booking failed'); setSubmitting(false); resetCaptcha(); return }

    if (sourceId && requiresDeposit) {
      // Deposit path: charges the deposit amount (not the full price) and,
      // on success, the server flips the appointment straight to
      // 'confirmed'. On failure the appointment stays 'pending' with its
      // 15-minute hold — the client can retry, or the hold expires on its
      // own via the scheduled job.
      try {
        const depRes = await fetch('/api/square/create-deposit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sourceId, appointmentId: newApptId, publicShopCode: shop.shop_code }),
        })
        const depData = await depRes.json()
        if (!depRes.ok || depData.error) {
          setPaymentError(depData.error || 'Deposit payment failed. Your slot is held for 15 minutes — try again or contact the shop.')
        } else {
          paymentSucceeded = true
        }
      } catch {
        setPaymentError('Deposit payment failed. Your slot is held for 15 minutes — try again or contact the shop.')
      }
    } else if (sourceId && cardMode === 'charge') {
      // Charge card immediately if one-time mode (need appointmentId for Square)
      try {
        const payRes = await fetch('/api/square/create-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sourceId, appointmentId: newApptId, publicShopCode: shop.shop_code }),
        })
        const payData = await payRes.json()
        if (!payRes.ok || payData.error) {
          setPaymentError(payData.error || 'Payment failed. Please pay at the shop.')
        } else {
          paymentSucceeded = true
        }
      } catch {
        setPaymentError('Payment failed. Please pay at the shop.')
      }
    } else if (sourceId && cardMode === 'save' && clientId) {
      // Save card on file if client chose save mode (non-blocking)
      try {
        await fetch('/api/square/save-card', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sourceId, clientId, shopId: shop.id }),
        })
      } catch {
        // Card save failure is non-fatal — appointment is already created
      }
    }

    // Notify owner
    const barberLabel = selectedBarber?.barber_name || selectedBarber?.alias || `Any ${staffLabelLower}`
    const dateLabel = new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    await supabase.from('notifications').insert({
      user_id: shop.owner_id,
      shop_id: shop.id,
      type: 'booking',
      title: 'New booking',
      body: `${clientName} booked ${selectedService.name} with ${barberLabel} on ${dateLabel} at ${selectedTime}`,
      read: false
    })

    // Notify barber if assigned
    if (selectedBarber?.barber_id) {
      await supabase.from('notifications').insert({
        user_id: selectedBarber.barber_id,
        shop_id: shop.id,
        type: 'booking',
        title: 'New appointment',
        body: `${clientName} booked ${selectedService.name} on ${dateLabel} at ${selectedTime}`,
        read: false
      })
    }

    // SMS confirmation to client (only if consented)
    if (smsConsent) {
      const dateFormatted = new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric'
      })
      const barberName = selectedBarber?.barber_name || selectedBarber?.alias || `your ${staffLabelLower}`
      try {
        await fetch('/api/sms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: clientPhone,
            message: `You're booked at ${shop.name}!\n\nService: ${selectedService.name}\n${staffLabel}: ${barberName}\nDate: ${dateFormatted}\nTime: ${selectedTime}\n\nSee you soon! Reply STOP to opt out.`
          })
        })
      } catch {
        // SMS failure is non-fatal
      }
    }

    setSuccess(true)
    setSubmitting(false)
  }

  const today = new Date().toISOString().split('T')[0]
  const COLORS = ['#b8861f','#4a7fb5','#3aab6e','#e07850','#9b6db5','#c06060']
  const brand = shop?.brand_color || '#b8861f'
  const brandLight = brand + '18'
  const brandMid = brand + '33'

  if (loading) return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-od-green border-t-transparent animate-spin" />
    </div>
  )

  if (notFound) return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center p-4">
      <div className="text-center">
        <h1 className="font-serif text-3xl text-od-green mb-4">ChairOS</h1>
        <p className="text-charcoal-400">Shop not found. Check your link and try again.</p>
      </div>
    </div>
  )

  if (success) return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        {shop.logo_url ? (
          <img src={shop.logo_url} alt={shop.name} className="w-16 h-16 rounded-xl object-cover mx-auto mb-4" />
        ) : (
          <div className="w-16 h-16 rounded-xl flex items-center justify-center font-serif text-2xl mx-auto mb-4"
            style={{ background: brandMid, color: brand }}>
            {shop.name[0]}
          </div>
        )}
        <h1 className="font-serif text-2xl text-charcoal-900 mb-6">{shop.name}</h1>
        <div className="bg-warm-100 border border-warm-200 rounded-xl p-8">
          <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ background: brand + '20', border: `2px solid ${brand}40` }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={brand} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <h2 className="font-serif text-xl text-charcoal-900 mb-2">You're booked.</h2>
          <p className="text-charcoal-400 text-sm mb-6">
            {selectedService.name} with {selectedBarber?.barber_name || selectedBarber?.alias || `any ${staffLabelLower}`} on{' '}
            {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} at {selectedTime}.
          </p>
          {paymentError && (
            <div className="bg-amber-950/40 border border-amber-800 rounded-lg p-3 mb-4 text-left">
              <p className="text-amber-400 text-xs">{paymentError}</p>
            </div>
          )}
          <div className="bg-warm-200 rounded-lg p-4 mb-6 text-left space-y-2">
            {[
              { label: 'Service', value: selectedService.name },
              { label: 'Price', value: `$${selectedService.price}`, colored: true },
              { label: 'Duration', value: `${selectedService.duration_minutes} mins` },
              { label: staffLabel, value: selectedBarber?.barber_name || selectedBarber?.alias || 'Any Available' },
            ].map((row, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-charcoal-400">{row.label}</span>
                <span style={row.colored ? { color: brand } : {}} className={row.colored ? 'font-mono font-semibold' : 'text-charcoal-900'}>
                  {row.value}
                </span>
              </div>
            ))}
          </div>
          <p className="text-charcoal-600 text-xs">
            {smsConsent ? `Confirmation text sent to ${clientPhone}.` : 'Booking confirmed.'} Powered by ChairOS.
          </p>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-warm-50">

      {shop.hero_url && (
        <div className="w-full h-48 md:h-64 overflow-hidden relative">
          <img src={shop.hero_url} alt={shop.name} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 to-black/60" />
        </div>
      )}

      <div style={{ background: shop.hero_url ? 'transparent' : '#0a0a0a' }}
        className={`px-6 py-5 border-b border-warm-200 ${shop.hero_url ? '-mt-20 relative z-10' : ''}`}>
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          {shop.logo_url ? (
            <img src={shop.logo_url} alt={shop.name}
              className="w-14 h-14 rounded-xl object-cover flex-shrink-0 shadow-lg border border-white/10" />
          ) : (
            <div className="w-14 h-14 rounded-xl flex items-center justify-center font-serif text-xl font-bold flex-shrink-0 shadow-lg"
              style={{ background: brandMid, color: brand, border: `2px solid ${brand}40` }}>
              {shop.name[0]}
            </div>
          )}
          <div className="flex-1">
            <h1 className="font-serif text-xl text-charcoal-900">{shop.name}</h1>
            {shop.tagline && <p className="text-xs mt-0.5" style={{ color: brand }}>{shop.tagline}</p>}
            {(shop.address || shop.city) && (
              <p className="text-charcoal-500 text-xs mt-0.5">
                {[shop.address, shop.city].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        </div>
        {shop.bio && (
          <div className="max-w-2xl mx-auto mt-3">
            <p className="text-charcoal-400 text-xs leading-relaxed">{shop.bio}</p>
          </div>
        )}
      </div>

      <div className="bg-warm-100 border-b border-warm-200 px-6 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-2">
          {[staffLabel, 'Service', 'Date & Time', 'Info & Pay'].map((label, i) => (
            <div key={i} className="flex items-center gap-2 flex-1 last:flex-none">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all"
                style={{
                  background: step > i+1 ? '#22c55e' : step === i+1 ? brand : '#262626',
                  color: step > i+1 || step === i+1 ? '#000' : '#6b7280'
                }}>
                {step > i+1 ? '✓' : i+1}
              </div>
              <span className="text-xs hidden sm:block transition-colors"
                style={{ color: step === i+1 ? brand : step > i+1 ? '#22c55e' : '#4b5563' }}>
                {label}
              </span>
              {i < 3 && <div className={`flex-1 h-px ${step > i+1 ? 'bg-green-500' : 'bg-warm-200'}`} />}
            </div>
          ))}
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-6">

        {shopReviews.length > 0 && (
          <div className="mb-6">
            <div className="bg-warm-100 border border-warm-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold text-charcoal-900">
                  ★ {(shopReviews.reduce((sum: number, r: any) => sum + (r.rating || 0), 0) / shopReviews.length).toFixed(1)} · {shopReviews.length} review{shopReviews.length !== 1 ? 's' : ''}
                </div>
                {shop?.slug && (
                  <a href={`/shop/${shop.slug}/reviews`} className="text-xs text-od-green font-semibold">
                    See all →
                  </a>
                )}
              </div>
              <div className="space-y-3">
                {shopReviews.map((r: any) => (
                  <div key={r.id} className="border-t border-warm-200 pt-3 first:border-0 first:pt-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-charcoal-900">{r.reviewer_name || 'Anonymous'}</span>
                      <span className="text-xs text-amber-500">{'★'.repeat(Math.max(0, Math.min(5, r.rating || 0)))}{'☆'.repeat(5 - Math.max(0, Math.min(5, r.rating || 0)))}</span>
                    </div>
                    {r.body && <p className="text-xs text-charcoal-600 line-clamp-2">{r.body}</p>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {error && <p className="text-red-400 text-sm bg-red-950 border border-red-900 rounded-lg p-3 mb-4">{error}</p>}

        {step === 1 && (
          <div>
            <h2 className="font-serif text-xl text-charcoal-900 mb-1">Choose your {staffLabelLower}</h2>
            <p className="text-charcoal-500 text-sm mb-6">Pick who you want or select any available {staffLabelLower}.</p>
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div
                onClick={() => { setSelectedBarber(null); setStep(2) }}
                className="bg-warm-100 border-2 border-warm-200 rounded-xl p-4 cursor-pointer transition-all text-center hover:border-warm-400"
                onMouseEnter={e => (e.currentTarget.style.borderColor = brand)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = '#262626')}>
                <div className="w-14 h-14 rounded-full bg-warm-200 flex items-center justify-center mx-auto mb-3">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                </div>
                <div className="text-sm font-semibold text-charcoal-900">Any {staffLabel}</div>
                <div className="text-xs text-charcoal-500 mt-1">First available</div>
              </div>
              {barbers.map((b, i) => (
                <div key={b.id}
                  onClick={() => { setSelectedBarber(b); setStep(2) }}
                  className="bg-warm-100 border-2 border-warm-200 rounded-xl p-4 cursor-pointer transition-all text-center"
                  onMouseEnter={e => (e.currentTarget.style.borderColor = brand)}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = '#262626')}>
                  {b.photo_url ? (
                    <img src={b.photo_url} alt={b.barber_name || b.alias}
                      className="w-14 h-14 rounded-full object-cover mx-auto mb-3 border-2"
                      style={{ borderColor: b.color || COLORS[i % COLORS.length] }} />
                  ) : (
                    <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3 font-serif text-xl font-bold"
                      style={{
                        background: (b.color || COLORS[i % COLORS.length]) + '22',
                        border: `2px solid ${b.color || COLORS[i % COLORS.length]}`,
                        color: b.color || COLORS[i % COLORS.length]
                      }}>
                      {(b.barber_name || b.alias || '?')[0].toUpperCase()}
                    </div>
                  )}
                  <div className="text-sm font-semibold text-charcoal-900">{b.barber_name || b.alias}</div>
                  {b.bio && <div className="text-xs text-charcoal-500 mt-1 line-clamp-2">{b.bio}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="font-serif text-xl text-charcoal-900 mb-1">Choose a service</h2>
            <p className="text-charcoal-500 text-sm mb-6">Select what you'd like done today.</p>
            <div className="space-y-2 mb-6">
              {services.map((s) => (
                <div key={s.id}
                  onClick={() => { setSelectedService(s); setStep(3) }}
                  className="bg-warm-100 border-2 rounded-xl p-4 cursor-pointer transition-all flex items-center justify-between"
                  style={{ borderColor: selectedService?.id === s.id ? brand : '#262626' }}
                  onMouseEnter={e => { if (selectedService?.id !== s.id) e.currentTarget.style.borderColor = '#404040' }}
                  onMouseLeave={e => { if (selectedService?.id !== s.id) e.currentTarget.style.borderColor = '#262626' }}>
                  <div>
                    <div className="text-sm font-semibold text-charcoal-900">{s.name}</div>
                    <div className="text-xs text-charcoal-500 mt-0.5">{s.description} · {s.duration_minutes} mins</div>
                  </div>
                  <div className="font-serif text-lg ml-4 flex-shrink-0 font-semibold" style={{ color: brand }}>${s.price}</div>
                </div>
              ))}
            </div>
            <button onClick={() => setStep(1)} className="text-sm text-charcoal-500 hover:text-charcoal-900 transition-colors">← Back</button>
          </div>
        )}

        {step === 3 && (
          <div>
            <h2 className="font-serif text-xl text-charcoal-900 mb-1">Pick a date & time</h2>
            <p className="text-charcoal-500 text-sm mb-6">Choose when you'd like to come in.</p>
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Date</label>
                <input type="date" value={selectedDate} min={today}
                  onChange={e => setSelectedDate(e.target.value)}
                  className="w-full bg-warm-100 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none transition-colors"
                  onFocus={e => e.target.style.borderColor = brand}
                  onBlur={e => e.target.style.borderColor = '#404040'} />
              </div>
              {selectedDate && (
                <div>
                  <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Time</label>
                  {loadingSlots ? (
                    <p className="text-charcoal-500 text-xs py-3">Checking availability…</p>
                  ) : availableSlots.length === 0 ? (
                    <p className="text-charcoal-500 text-xs py-3">No times available this day — try another date.</p>
                  ) : (
                  <div className="grid grid-cols-4 gap-2">
                    {availableSlots.map(t => (
                      <button key={t} onClick={() => setSelectedTime(t)}
                        className="py-2 rounded-lg text-xs font-medium transition-all border"
                        style={{
                          background: selectedTime === t ? brand : '#171717',
                          borderColor: selectedTime === t ? brand : '#404040',
                          color: selectedTime === t ? '#000' : '#9ca3af'
                        }}>
                        {t}
                      </button>
                    ))}
                  </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="text-sm text-charcoal-500 hover:text-charcoal-900 transition-colors">← Back</button>
              <button
                onClick={() => { if (!selectedDate || !selectedTime) { setError('Please select a date and time'); return }; setError(''); setStep(4) }}
                className="ml-auto font-semibold px-6 py-2.5 rounded-lg text-sm transition-colors text-black"
                style={{ background: brand }}>
                Continue →
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div>
            <h2 className="font-serif text-xl text-charcoal-900 mb-1">Your info & payment</h2>
            <p className="text-charcoal-500 text-sm mb-6">No account needed. Just your name, number, and card.</p>
            <div className="bg-warm-100 border border-warm-200 rounded-xl p-4 mb-6 space-y-2">
              <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500 mb-3">Booking Summary</div>
              {[
                { label: staffLabel, value: selectedBarber?.barber_name || selectedBarber?.alias || 'Any Available' },
                { label: 'Service', value: selectedService?.name },
                { label: 'Date', value: new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) },
                { label: 'Time', value: selectedTime },
              ].map((row, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-charcoal-400">{row.label}</span>
                  <span className="text-charcoal-900">{row.value}</span>
                </div>
              ))}
              <div className="flex justify-between text-sm border-t border-warm-200 pt-2 mt-2">
                <span className="text-charcoal-400">Total</span>
                <span className="font-mono font-semibold" style={{ color: brand }}>${selectedService?.price}</span>
              </div>
              {requiresDeposit && depositAmountEstimate != null && (
                <div className="flex justify-between text-sm">
                  <span className="text-charcoal-400">Deposit due now</span>
                  <span className="font-mono font-semibold" style={{ color: brand }}>${depositAmountEstimate}</span>
                </div>
              )}
            </div>
            <div className="space-y-4 mb-6">
              {[
                { label: 'Full Name *', value: clientName, set: setClientName, type: 'text', placeholder: 'Your name' },
                { label: 'Phone Number *', value: clientPhone, set: setClientPhone, type: 'tel', placeholder: '(555) 000-0000' },
                { label: 'Email (optional)', value: clientEmail, set: setClientEmail, type: 'email', placeholder: 'For confirmation email' },
                { label: 'Notes (optional)', value: notes, set: setNotes, type: 'text', placeholder: `Any requests for your ${staffLabelLower}` },
              ].map(f => (
                <div key={f.label}>
                  <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">{f.label}</label>
                  <input type={f.type} value={f.value} onChange={e => { f.set(e.target.value); if (f.label === 'Phone Number *') checkReturningClient(e.target.value) }} placeholder={f.placeholder}
                    className="w-full bg-warm-100 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none transition-colors"
                    onFocus={e => e.target.style.borderColor = brand}
                    onBlur={e => e.target.style.borderColor = '#404040'} />
                  {f.label === 'Phone Number *' && returningClient && (
                    <div className="bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 flex items-center gap-3 mt-2">
                      <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                      <div>
                        <div className="text-xs font-semibold text-green-400">Welcome back, {returningClient.full_name?.split(' ')[0]}!</div>
                        <div className="text-xs text-charcoal-500 mt-0.5">
                          {returningClient.total_visits} visit{returningClient.total_visits !== 1 ? 's' : ''}, your {staffLabelLower} has been pre-selected
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* SQUARE CARD FORM — shown when the shop requires a card, or this booking requires a deposit */}
            {(shop?.require_card_to_book || requiresDeposit) && (
              <div className="mb-6">
                <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-2">
                  {requiresDeposit ? 'Deposit — required to hold your slot' : 'Card'}
                </label>

                {/* Save vs. charge toggle — not shown for deposit bookings, which always charge the deposit now */}
                {!requiresDeposit && (
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {[
                      { key: 'save', label: 'Save for later', sub: 'Pay at checkout' },
                      { key: 'charge', label: 'Charge now', sub: `$${selectedService?.price} today` },
                    ].map(opt => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setCardMode(opt.key as 'save' | 'charge')}
                        className={`p-3 rounded-xl border text-left text-sm transition-colors ${
                          cardMode === opt.key
                            ? 'border-od-green bg-od-green/10 text-charcoal-900'
                            : 'border-warm-300 bg-warm-100 text-charcoal-500 hover:border-warm-400'
                        }`}
                      >
                        <div className="font-semibold">{opt.label}</div>
                        <div className="text-xs opacity-70 mt-0.5">{opt.sub}</div>
                      </button>
                    ))}
                  </div>
                )}

                <div className="bg-neutral-900 border border-neutral-700 rounded-xl p-4">
                  {cardLoading && (
                    <div className="flex items-center gap-2 py-3 text-neutral-500 text-sm">
                      <div className="w-4 h-4 rounded-full border-2 border-neutral-600 border-t-amber-500 animate-spin flex-shrink-0" />
                      Loading card form...
                    </div>
                  )}
                  <div id="square-card-container" className={cardLoading ? 'hidden' : ''} />
                  {!cardLoading && !cardReady && !paymentError && (
                    <p className="text-neutral-500 text-xs py-2">Card form unavailable — you can pay at the shop.</p>
                  )}
                </div>
                {paymentError && (
                  <p className="text-amber-400 text-xs mt-2">{paymentError}</p>
                )}
                <p className="text-neutral-600 text-xs mt-2">
                  {requiresDeposit
                    ? `A $${depositAmountEstimate} deposit is charged now to hold this slot. Your slot is held for 15 minutes — if payment doesn't go through in that window, it's released. The rest is due at the shop.`
                    : cardMode === 'save'
                    ? 'Your card is saved securely by Square and charged at checkout.'
                    : `Your card is charged $${selectedService?.price} now. Tip is added at the shop.`}
                  {' '}We do not store your full card number.
                </p>
              </div>
            )}

            {/* Consent checkboxes */}
            <div className="space-y-3 mb-6">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={smsConsent}
                  onChange={e => setSmsConsent(e.target.checked)}
                  className="mt-0.5 w-4 h-4 flex-shrink-0 accent-od-green"
                />
                <span className="text-xs text-charcoal-500 leading-relaxed">
                  I consent to receive SMS appointment confirmations and reminders from {shop.name}. Message & data rates may apply. Reply STOP to opt out. View our{' '}
                  <a href="/privacy" className="underline hover:text-charcoal-300">Privacy Policy</a>.
                </span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={emailConsent}
                  onChange={e => setEmailConsent(e.target.checked)}
                  className="mt-0.5 w-4 h-4 flex-shrink-0 accent-od-green"
                />
                <span className="text-xs text-charcoal-500 leading-relaxed">
                  I'd like to receive email updates from {shop.name} (optional).
                </span>
              </label>
            </div>

            {CAPTCHA_ENABLED && (
              <div className="mb-4">
                <Turnstile ref={turnstileRef} onVerify={setCaptchaToken} onExpire={() => setCaptchaToken('')} />
              </div>
            )}

            <div className="flex gap-3 items-center">
              <button onClick={() => setStep(3)} className="text-sm text-charcoal-500 hover:text-charcoal-900 transition-colors">← Back</button>
              <button onClick={handleBook} disabled={submitting || !clientName || !clientPhone || (!!clientPhone && !smsConsent) || (CAPTCHA_ENABLED && !captchaToken)}
                className="ml-auto font-semibold px-8 py-3 rounded-lg text-sm transition-colors text-black disabled:opacity-50"
                style={{ background: brand }}>
                {submitting ? 'Processing...' : requiresDeposit ? `Confirm & Pay Deposit $${depositAmountEstimate}` : `Confirm & Pay $${selectedService?.price}`}
              </button>
            </div>
            <p className="text-charcoal-600 text-xs text-center mt-6">Powered by ChairOS</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default function BookingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-warm-50 flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-od-green border-t-transparent animate-spin" />
      </div>
    }>
      <BookingPageInner />
    </Suspense>
  )
}
