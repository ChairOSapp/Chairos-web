'use client'
import { useEffect, useState, useRef, Suspense } from 'react'
import { createClient } from '@/lib/supabase'
import { useParams, useSearchParams } from 'next/navigation'

const TIMES = [
  '8:00 AM','8:30 AM','9:00 AM','9:30 AM','10:00 AM','10:30 AM',
  '11:00 AM','11:30 AM','12:00 PM','12:30 PM','1:00 PM','1:30 PM',
  '2:00 PM','2:30 PM','3:00 PM','3:30 PM','4:00 PM','4:30 PM',
  '5:00 PM','5:30 PM','6:00 PM','6:30 PM','7:00 PM','7:30 PM','8:00 PM'
]

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
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  const [selectedBarber, setSelectedBarber] = useState<any>(null)
  const [selectedService, setSelectedService] = useState<any>(null)
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedTime, setSelectedTime] = useState('')
  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [smsConsent, setSmsConsent] = useState(false)
  const [emailConsent, setEmailConsent] = useState(false)
  const [error, setError] = useState('')
  const [returningClient, setReturningClient] = useState<any>(null)

  // Square payment state
  const squareCardRef = useRef<any>(null)
  const [cardReady, setCardReady] = useState(false)
  const [cardLoading, setCardLoading] = useState(false)
  const [paymentError, setPaymentError] = useState('')

  useEffect(() => {
    async function load() {
      const { data: shop } = await supabase
        .from('shops').select('*').eq('shop_code', shopCode).maybeSingle()
      if (!shop) { setNotFound(true); setLoading(false); return }
      setShop(shop)

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

      setLoading(false)
    }
    load()
  }, [shopCode])

  // Initialize Square Web Payments SDK when user reaches step 4
  useEffect(() => {
    if (step !== 4) return
    if (squareCardRef.current) return // already initialized

    const appId = process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID
    const locationId = process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID
    if (!appId || !locationId) return

    setCardLoading(true)

    async function initSquare() {
      try {
        const { payments } = await import('@square/web-sdk')
        const paymentsInstance = await payments(appId!, locationId!)
        if (!paymentsInstance) throw new Error('Square payments init returned null')
        const card = await paymentsInstance.card()
        await card.attach('#square-card-container')
        squareCardRef.current = card
        setCardReady(true)
      } catch (e: any) {
        console.error('Square init error:', e)
        setPaymentError('Card form failed to load. You can still book and pay at the shop.')
      } finally {
        setCardLoading(false)
      }
    }
    initSquare()

    return () => {
      if (squareCardRef.current) {
        squareCardRef.current.destroy?.().catch(() => {})
        squareCardRef.current = null
        setCardReady(false)
      }
    }
  }, [step])

  async function checkReturningClient(phone: string) {
    if (phone.replace(/\D/g, '').length < 10) return
    const { data: client } = await supabase
      .from('clients')
      .select('*, client_locks(*, shop_barbers(*))')
      .eq('phone', phone.replace(/\D/g, ''))
      .maybeSingle()
    if (!client) return
    setReturningClient(client)

    const lock = client.client_locks?.find((l: any) => l.locked && l.shop_barbers?.shop_id === shop.id)
    if (lock?.shop_barbers) {
      const matchedBarber = barbers.find(b => b.id === lock.shop_barber_id)
      if (matchedBarber) setSelectedBarber(matchedBarber)
    }
  }

  async function handleBook() {
    if (!clientName || !clientPhone) { setError('Name and phone are required'); return }
    if (clientPhone && !smsConsent) { setError('Please consent to SMS messages to receive your booking confirmation'); return }
    setSubmitting(true)
    setError('')
    setPaymentError('')

    // Tokenize card first (before any DB writes) if Square is ready
    let sourceId: string | null = null
    if (squareCardRef.current) {
      const result = await squareCardRef.current.tokenize()
      if (result.status === 'OK') {
        sourceId = result.token
      } else {
        const msg = result.errors?.[0]?.message || 'Card error'
        setPaymentError(msg)
        setSubmitting(false)
        return
      }
    }

    const [time, period] = selectedTime.split(' ')
    const [hours, minutes] = time.split(':')
    let h = parseInt(hours)
    if (period === 'PM' && h !== 12) h += 12
    if (period === 'AM' && h === 12) h = 0
    const time24 = `${h.toString().padStart(2,'0')}:${minutes}:00`

    const consentNow = new Date().toISOString()

    // Upsert client record with consent (never overwrite existing consent=true with false)
    const cleanPhone = clientPhone.replace(/\D/g, '')
    const { data: existingClient } = await supabase
      .from('clients')
      .select('id, sms_consent, email_consent')
      .eq('phone', cleanPhone)
      .maybeSingle()

    const clientUpsert: Record<string, any> = {
      phone: cleanPhone,
      full_name: clientName,
      email: clientEmail || null,
    }
    if (smsConsent && !existingClient?.sms_consent) {
      clientUpsert.sms_consent = true
      clientUpsert.sms_consent_at = consentNow
    }
    if (emailConsent && clientEmail && !existingClient?.email_consent) {
      clientUpsert.email_consent = true
      clientUpsert.email_consent_at = consentNow
    }
    await supabase.from('clients').upsert(clientUpsert, { onConflict: 'phone', ignoreDuplicates: false })

    const { data: newAppt, error: bookErr } = await supabase.from('appointments').insert({
      shop_id: shop.id,
      barber_id: selectedBarber?.barber_id || null,
      service_id: selectedService.id,
      client_name: clientName,
      client_phone: clientPhone,
      client_email: clientEmail || null,
      date: selectedDate,
      time: time24,
      price: selectedService.price,
      status: 'pending',
      notes: notes || null,
      payment_status: sourceId ? 'unpaid' : 'unpaid',
    }).select('id').single()

    if (bookErr || !newAppt) { setError(bookErr?.message || 'Booking failed'); setSubmitting(false); return }

    // Charge card if tokenized
    if (sourceId) {
      try {
        const payRes = await fetch('/api/square/create-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sourceId, appointmentId: newAppt.id }),
        })
        const payData = await payRes.json()
        if (!payRes.ok || payData.error) {
          setPaymentError(payData.error || 'Payment failed. Your booking is confirmed — pay at the shop.')
        }
      } catch {
        setPaymentError('Payment failed. Your booking is confirmed — pay at the shop.')
      }
    }

    // Notify owner
    const barberLabel = selectedBarber?.barber_name || selectedBarber?.alias || 'Any barber'
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
      const barberName = selectedBarber?.barber_name || selectedBarber?.alias || 'your barber'
      try {
        await fetch('/api/sms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: clientPhone,
            message: `✂️ You're booked at ${shop.name}!\n\nService: ${selectedService.name}\nBarber: ${barberName}\nDate: ${dateFormatted}\nTime: ${selectedTime}\n\nSee you soon! Reply STOP to opt out.`
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
            {selectedService.name} with {selectedBarber?.barber_name || selectedBarber?.alias || 'any barber'} on{' '}
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
              { label: 'Barber', value: selectedBarber?.barber_name || selectedBarber?.alias || 'Any Available' },
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
          {['Barber', 'Service', 'Date & Time', 'Info & Pay'].map((label, i) => (
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

        {error && <p className="text-red-400 text-sm bg-red-950 border border-red-900 rounded-lg p-3 mb-4">{error}</p>}

        {step === 1 && (
          <div>
            <h2 className="font-serif text-xl text-charcoal-900 mb-1">Choose your barber</h2>
            <p className="text-charcoal-500 text-sm mb-6">Pick who you want or select any available barber.</p>
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
                <div className="text-sm font-semibold text-charcoal-900">Any Barber</div>
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
                  <div className="grid grid-cols-4 gap-2">
                    {TIMES.map(t => (
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
                { label: 'Barber', value: selectedBarber?.barber_name || selectedBarber?.alias || 'Any Available' },
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
            </div>
            <div className="space-y-4 mb-6">
              {[
                { label: 'Full Name *', value: clientName, set: setClientName, type: 'text', placeholder: 'Your name' },
                { label: 'Phone Number *', value: clientPhone, set: setClientPhone, type: 'tel', placeholder: '(555) 000-0000' },
                { label: 'Email (optional)', value: clientEmail, set: setClientEmail, type: 'email', placeholder: 'For confirmation email' },
                { label: 'Notes (optional)', value: notes, set: setNotes, type: 'text', placeholder: 'Any requests for your barber' },
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
                          {returningClient.total_visits} visit{returningClient.total_visits !== 1 ? 's' : ''} — your barber has been pre-selected
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* SQUARE CARD FORM */}
            <div className="mb-6">
              <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-2">Payment</label>
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
                Your card is charged ${selectedService?.price} when you confirm. Secured by Square.
              </p>
            </div>

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

            <div className="flex gap-3 items-center">
              <button onClick={() => setStep(3)} className="text-sm text-charcoal-500 hover:text-charcoal-900 transition-colors">← Back</button>
              <button onClick={handleBook} disabled={submitting || !clientName || !clientPhone || (!!clientPhone && !smsConsent)}
                className="ml-auto font-semibold px-8 py-3 rounded-lg text-sm transition-colors text-black disabled:opacity-50"
                style={{ background: brand }}>
                {submitting ? 'Processing...' : `Confirm & Pay $${selectedService?.price}`}
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
