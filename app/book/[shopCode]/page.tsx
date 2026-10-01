'use client'
import { useEffect, useState, useRef, Suspense } from 'react'
import * as Sentry from '@sentry/nextjs'
import { createClient } from '@/lib/supabase'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import Turnstile, { type TurnstileHandle } from '@/components/Turnstile'
import { initMetaPixel, initGoogleTag, trackMetaEvent, trackGoogleEvent } from '@/lib/tracking'
import { timeStrToMinutes } from '@/lib/availability'
import AddToCalendarButton from '@/components/AddToCalendarButton'
import { DAY_NAMES, findApplicablePricing, promoActiveOn, isPromoRule, ruleLabel, type PricingRule } from '@/lib/pricing'
import { squareCardInputStyle } from '@/lib/squareCard'
import { describeSquareInitError, type SquareInitStep } from '@/lib/squareInitDiag'
import { StepPanel, Pressable } from '@/components/motion'

const CAPTCHA_ENABLED = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

function BookingPageInner() {
  const params = useParams()
  const shopCode = (params.shopCode as string)?.toUpperCase()
  const router = useRouter()
  const supabase = createClient()
  const searchParams = useSearchParams()

  const [shop, setShop] = useState<any>(null)
  const [barbers, setBarbers] = useState<any[]>([])
  const [services, setServices] = useState<any[]>([])
  const [pricingRules, setPricingRules] = useState<PricingRule[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [shopReviews, setShopReviews] = useState<any[]>([])
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  // Name of the staff member the server assigned when the client booked
  // "any barber" (POST /api/book/create resolves it server-side).
  const [confirmedBarberName, setConfirmedBarberName] = useState<string | null>(null)

  const [selectedBarber, setSelectedBarber] = useState<any>(null)
  const [selectedService, setSelectedService] = useState<any>(null)
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedTime, setSelectedTime] = useState('')
  const [availableSlots, setAvailableSlots] = useState<string[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  // Appointment waitlist -- distinct from the main booking flow's contact
  // step, since a visitor can hit a fully-booked day before ever reaching
  // step 4. Self-contained state so joining doesn't require finishing (or
  // even continuing) the regular booking flow.
  const [wlTime, setWlTime] = useState('')
  const [wlName, setWlName] = useState('')
  const [wlPhone, setWlPhone] = useState('')
  const [wlSubmitting, setWlSubmitting] = useState(false)
  const [wlJoined, setWlJoined] = useState(false)
  const [wlPosition, setWlPosition] = useState<number | null>(null)
  const [wlError, setWlError] = useState('')
  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [smsConsent, setSmsConsent] = useState(false)
  // Card-on-file consent: unchecked by default, required whenever the
  // client chooses "Save for later". Stored-credential rules require an
  // explicit opt-in before a card goes on file.
  const [cardConsent, setCardConsent] = useState(false)
  const [emailConsent, setEmailConsent] = useState(false)
  const [error, setError] = useState('')
  const [returningClient, setReturningClient] = useState<any>(null)
  const [activeReward, setActiveReward] = useState<{ id: string; type: string; value: number } | null>(null)
  const refCode = searchParams.get('ref')
  const [captchaToken, setCaptchaToken] = useState('')
  // Reused across the whole visit so the abandoned-booking sweep has one
  // row to update rather than a new one on every field change. If we
  // arrived via a recovery-text link (?session=...), reuse that same
  // session id so restored selections keep updating the original row
  // instead of forking a second one.
  const [sessionId] = useState(() => searchParams.get('session') || crypto.randomUUID())
  const [prefillLoaded, setPrefillLoaded] = useState(!searchParams.get('session'))
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
  // Bumped by the in-app "Try again" button to re-run card initialization
  // (there is no page refresh inside the iOS wrapper).
  const [cardRetryKey, setCardRetryKey] = useState(0)
  // Dedicated payment-failed state: the appointment was created and is
  // held (~15 min), but the charge didn't go through. pendingApptId +
  // failedChargeKind let "Retry payment" re-attempt ONLY the charge
  // against the same appointment -- never a duplicate booking.
  const [paymentFailed, setPaymentFailed] = useState(false)
  const [pendingApptId, setPendingApptId] = useState<string | null>(null)
  const [failedChargeKind, setFailedChargeKind] = useState<'deposit' | 'charge' | null>(null)
  const [retrying, setRetrying] = useState(false)
  // What this booking actually did about money, so the success screen can
  // state the payment truth ("Deposit paid $25", "Due at the shop $55")
  // instead of letting "You're booked" imply a charge happened. Set in
  // doBook / retryPayment right where each payment branch settles.
  const [paidSummary, setPaidSummary] = useState<{ kind: 'deposit' | 'charge' | 'save' | 'none', amount: number } | null>(null)
  // Synchronous double-submit guards -- React state updates don't settle
  // between two rapid taps, so `submitting`/`retrying` alone can't stop a
  // double-tap from running the booking twice (two bookingKeys -> two
  // appointments, two charges). Refs are checked synchronously instead.
  const bookBusyRef = useRef(false)
  const retryBusyRef = useRef(false)
  const waitlistBusyRef = useRef(false)
  // Bumped to force a fresh availability read (e.g. after a slot-taken
  // 409 sends the customer back to the time picker).
  const [slotsRefreshKey, setSlotsRefreshKey] = useState(0)
  // Why the current day has no slots: 'closed' | 'no_hours' | 'full' --
  // so the page can explain instead of just showing the waitlist.
  const [slotsReason, setSlotsReason] = useState<string | null>(null)
  const [slotsMaxAdvance, setSlotsMaxAdvance] = useState<number | null>(null)
  // Waitlist target date -- defaults to the picked date until the customer
  // chooses a different one (e.g. "an earlier date").
  const [wlDate, setWlDate] = useState('')
  // Opt-in waitlist section under the time grid ("want an earlier time?").
  const [showWaitlistOption, setShowWaitlistOption] = useState(false)
  // Whether the confirmation SMS actually sent -- the success screen must
  // not claim "text sent" when the send failed.
  const [smsSent, setSmsSent] = useState(false)
  // Turnstile widget state -- a failed script load must offer a retry
  // instead of leaving Confirm permanently disabled.
  const [captchaLoadFailed, setCaptchaLoadFailed] = useState(false)
  const [captchaRetryKey, setCaptchaRetryKey] = useState(0)
  // 'save' = store card for later checkout, 'charge' = one-time charge now
  const [cardMode, setCardMode] = useState<'save' | 'charge'>('save')

  // Mirrors the gate computed server-side in /api/square/create-deposit —
  // deposits happen only when the shop owner enabled them in Settings →
  // Payments AND the service has deposits switched on. No vertical gets
  // silent always-on deposits.
  const requiresDeposit = !!shop && !!selectedService &&
    shop.deposits_enabled === true &&
    selectedService.deposit_required === true

  // Card-on-file disclosure shown with the opt-in checkbox. Kept as a
  // constant so the exact agreed-to text is what gets stored server-side.
  const cardConsentText = `I agree to save my card with ${shop?.name || 'this shop'} for faster checkout. ${shop?.name || 'The shop'} may charge this card for deposits and appointment payments. My card is stored securely by Square. The shop never sees my full card number. I can remove my card anytime.`

  // Every peak/off-peak and promo pricing_rules match for the selected
  // service+date+time applies at once -- a promo and a recurring surcharge
  // on the same slot both take effect (see findApplicablePricing).
  const pricingResult = selectedService?.price != null && selectedDate && selectedTime
    ? findApplicablePricing(pricingRules, {
        serviceId: selectedService.id,
        price: selectedService.price,
        dateStr: selectedDate,
        dayName: DAY_NAMES[new Date(selectedDate + 'T12:00:00').getDay()],
        timeMinutes: timeStrToMinutes(selectedTime),
      })
    : null
  const priceAfterRule = selectedService?.price != null
    ? (pricingResult ? pricingResult.finalPrice : selectedService.price)
    : null

  // A referral reward (checked via checkReturningClient once the phone
  // matches an existing client) discounts the price before the deposit
  // is calculated off it, so someone with a $10-off reward on a required
  // deposit pays a deposit against the discounted total, not the sticker price.
  const finalPrice = priceAfterRule != null
    ? (activeReward
        ? Math.max(0, Math.round(
            (activeReward.type === 'percent_off'
              ? priceAfterRule * (1 - activeReward.value / 100)
              : priceAfterRule - activeReward.value) * 100
          ) / 100)
        : priceAfterRule)
    : null

  const depositAmountEstimate = requiresDeposit && finalPrice != null
    ? (shop.deposit_type === 'flat' ? Number(shop.deposit_amount) : Math.round(finalPrice * (Number(shop.deposit_amount) / 100) * 100) / 100)
    : null

  // Mirrors doBook()'s validation so the Confirm button enables exactly
  // when the submission can pass validation (no permanent-disabled state).
  const contactValid =
    clientName.trim().length > 0 &&
    clientPhone.replace(/\D/g, '').length >= 10 &&
    (!clientEmail || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail.trim()))

  // Display-safe amounts: a null service price or an uncomputable deposit
  // must never render as "$null".
  const depositDisplay = requiresDeposit && depositAmountEstimate != null && depositAmountEstimate > 0
    ? `$${depositAmountEstimate}`
    : null
  const chargeDisplay = finalPrice != null ? `$${finalPrice}` : null

  // What the Confirm button will actually do about money when tapped --
  // the label must match this exactly. chargeDisplay is just the price
  // and is set for every priced service, so it must NOT drive the label
  // on its own: "Confirm & Pay $55" on a pay-at-the-shop booking is what
  // made a customer believe they'd paid when no charge happened.
  const willChargeDeposit = requiresDeposit && !!depositDisplay
  const willChargeNow = !willChargeDeposit && !!shop?.require_card_to_book && cardMode === 'charge' && (finalPrice ?? 0) > 0
  const willSaveCard = !willChargeDeposit && !willChargeNow && !!shop?.require_card_to_book && cardMode === 'save'

  // Hero info: average rating (reviews are already loaded) and today's
  // hours from the shop's weekly schedule, so the header earns its space.
  const avgRating = shopReviews.length > 0
    ? shopReviews.reduce((s: number, r: any) => s + (r.rating || 0), 0) / shopReviews.length
    : null
  const todayHoursLabel = (() => {
    const hours = shop?.hours
    if (!Array.isArray(hours)) return null
    const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long' })
    const entry = (hours as Array<{ day: string; open: boolean; from: string; to: string }>).find(h => h.day === dayName)
    if (!entry) return null
    return entry.open ? `Open today ${entry.from} – ${entry.to}` : 'Closed today'
  })()

  // Plain-language booking rules for the customer, from the shop's
  // settings — shown under the date picker so expectations are set
  // before they pick a time.
  const rulesLine = (() => {
    if (!shop) return null
    const parts: string[] = []
    const minAdv = shop.min_advance_minutes ?? 120
    if (minAdv > 0) parts.push(`Book at least ${minAdv >= 60 ? `${Math.round(minAdv / 60)}h` : `${minAdv}min`} ahead`)
    const maxDays = shop.max_advance_days ?? 90
    if (maxDays > 0) parts.push(`Up to ${maxDays} days out`)
    const cancelWin = shop.cancellation_window_hours ?? 24
    if (cancelWin > 0) parts.push(`Please cancel at least ${cancelWin}h ahead`)
    return parts.length ? parts.join(' · ') : null
  })()
  const maxBookableDate = (() => {
    const days = shop?.max_advance_days ?? 90
    const d = new Date()
    d.setDate(d.getDate() + days)
    return d.toLocaleDateString('en-CA')
  })()

  useEffect(() => {
    async function load() {
      const { data: shop } = await supabase
        .from('shops_public').select('*').eq('shop_code', shopCode).maybeSingle()
      if (!shop) { setNotFound(true); setLoading(false); return }
      setShop(shop)
      // Default the date picker to the next day the shop is actually open,
      // so the first thing a customer sees isn't "no times available" on a
      // closed day. A recovered booking session below still wins when it
      // sets its own date.
      if (Array.isArray(shop.hours)) {
        for (let i = 0; i < 14; i++) {
          const d = new Date()
          d.setDate(d.getDate() + i)
          const iso = d.toLocaleDateString('en-CA')
          const dayName = DAY_NAMES[new Date(iso + 'T12:00:00').getDay()]
          const entry = (shop.hours as Array<{ day: string; open: boolean }>).find(h => h.day === dayName)
          if (entry?.open) { setSelectedDate(iso); break }
        }
      }
      initMetaPixel(shop.meta_pixel_id)
      initGoogleTag(shop.google_tag_id)

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

      const { data: pricingRules } = await supabase
        .from('pricing_rules').select('*')
        .eq('shop_id', shop.id).eq('active', true)
      setPricingRules((pricingRules || []) as PricingRule[])

      // Restore selections from an abandoned-booking recovery link
      // (?session=...) -- the deposit-required recovery text sends people
      // here instead of a reply-to-book flow, since a deposit still needs
      // real payment info.
      const sessionParam = searchParams.get('session')
      if (sessionParam) {
        try {
          const res = await fetch(`/api/book/session?sessionId=${encodeURIComponent(sessionParam)}`)
          if (res.ok) {
            const { session } = await res.json()
            const matchedBarber = session.barber_id ? (barbers || []).find((b: any) => b.barber_id === session.barber_id) : null
            const matchedService = (services || []).find((s: any) => s.id === session.service_id)
            if (matchedBarber) setSelectedBarber(matchedBarber)
            if (matchedService) setSelectedService(matchedService)
            setSelectedDate(session.date || '')
            setSelectedTime('')
            setClientName(session.client_name || '')
            setClientPhone(session.client_phone || '')
            setClientEmail(session.client_email || '')
            // Land on the date/time step rather than jumping straight to
            // payment -- the original slot may no longer be free, and
            // re-selecting a time re-runs the real availability check.
            if (matchedService) setStep(3)
          }
        } catch {
          // Prefill is a convenience, not a hard requirement -- fall back
          // to a normal empty booking flow on any failure.
        } finally {
          setPrefillLoaded(true)
        }
      }

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

    // Per-shop widget config: tokenize against the same Square location the
    // server will charge. Public endpoint — the shop code authorizes it.
    const appId = process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID
    if (!appId) return

    setCardLoading(true)
    let isMounted = true

    async function initSquare() {
      let step: SquareInitStep = 'config-fetch'
      try {
        const cfgParams = new URLSearchParams({ shopCode })
        if (selectedBarber?.barber_id) cfgParams.set('barberId', selectedBarber.barber_id)
        const cfgRes = await fetch(`/api/square/widget-config?${cfgParams}`)
        if (!isMounted) return
        if (!cfgRes.ok) {
          const errData = await cfgRes.json().catch(() => ({}))
          if (errData.code === 'square_not_connected' || errData.code === 'square_reconnect_required') {
            throw new Error('SQUARE_NOT_CONNECTED')
          }
          throw new Error('init_failed')
        }
        const { locationId } = await cfgRes.json()
        if (!locationId) throw new Error('init_failed')
        step = 'sdk-import'
        const { payments } = await import('@square/web-sdk')
        if (!isMounted) return
        step = 'payments-init'
        const paymentsInstance = await payments(appId!, locationId)
        if (!isMounted) return
        if (!paymentsInstance) throw new Error('Square payments init returned null')
        step = 'card-create'
        const card = await paymentsInstance.card({ style: squareCardInputStyle(true) })
        if (!isMounted) return
        step = 'card-attach'
        await card.attach('#square-card-container')
        if (!isMounted) return
        squareCardRef.current = card
        setCardReady(true)
      } catch (e: any) {
        if (!isMounted) return
        console.error('Square init error:', describeSquareInitError(step, e), e)
        Sentry.captureException(e, { tags: { area: 'booking_square_card_init' } })
        setPaymentError(
          String(e?.message) === 'SQUARE_NOT_CONNECTED'
            ? 'This shop isn\u2019t taking card payments online right now. You can continue and pay at the shop.'
            : 'Card form failed to load. Check your connection and try again. No charge was made. You can also continue and pay at the shop.'
        )
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
  }, [step, cardRetryKey])

  // In-app recovery for a failed Square init -- the iOS wrapper has no
  // page refresh, so the card section offers this instead.
  function retryCardInit() {
    setPaymentError('')
    setCardRetryKey(k => k + 1)
  }

  // Real server-side availability, buffer-aware — replaces a fixed time
  // list that showed every slot regardless of existing bookings.
  useEffect(() => {
    if (!selectedDate || !selectedService) { setAvailableSlots([]); setSlotsReason(null); setSlotsMaxAdvance(null); return }
    let cancelled = false
    setLoadingSlots(true)
    setSelectedTime('')
    const params = new URLSearchParams({ shopCode, date: selectedDate, serviceId: selectedService.id })
    if (selectedBarber?.barber_id) params.set('barberId', selectedBarber.barber_id)
    // Customer's timezone, so the server's past-slot filter is evaluated
    // in the right zone (shops carry no timezone column; UTC would hide
    // still-bookable slots for western-hemisphere shops).
    params.set('tz', Intl.DateTimeFormat().resolvedOptions().timeZone)
    fetch(`/api/book/availability?${params.toString()}`)
      .then(r => r.json())
      .then(data => { if (!cancelled) { setAvailableSlots(data.slots || []); setSlotsReason(data.reason || null); setSlotsMaxAdvance(data.maxAdvanceDays ?? null) } })
      .catch(() => { if (!cancelled) { setAvailableSlots([]); setSlotsReason(null); setSlotsMaxAdvance(null) } })
      .finally(() => { if (!cancelled) setLoadingSlots(false) })
    return () => { cancelled = true }
  }, [selectedDate, selectedService, selectedBarber, shopCode, slotsRefreshKey])

  // A fresh date/barber pick invalidates any "joined the waitlist" state
  // left over from a previous fully-booked day.
  function resetWaitlistJoinState() {
    setWlJoined(false)
    setWlPosition(null)
    setWlError('')
    setWlTime('')
    setWlDate('')
    setShowWaitlistOption(false)
  }

  async function joinWaitlist() {
    // Synchronous guard: `wlSubmitting` state alone can't stop a same-tick
    // double-tap from joining twice.
    if (waitlistBusyRef.current || wlSubmitting) return
    // The waitlist entry targets its own date -- the picked booking date by
    // default, or a different (e.g. earlier) date the customer chose.
    const wlTargetDate = wlDate || selectedDate
    if (!wlName.trim() || !wlPhone.trim() || !wlTime || !wlTargetDate) {
      setWlError('Name, phone, date, and a desired time are required')
      return
    }
    waitlistBusyRef.current = true
    setWlSubmitting(true)
    setWlError('')
    try {
      const res = await fetch('/api/book/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopId: shop.id,
          barberId: selectedBarber?.barber_id || null,
          serviceId: selectedService.id,
          date: wlTargetDate,
          time: wlTime,
          clientName: wlName,
          clientPhone: wlPhone,
        }),
      })
      const result = await res.json()
      if (!res.ok) { setWlError(result.error || 'Could not join the waitlist'); return }
      setWlJoined(true)
      setWlPosition(result.position ?? null)
    } catch {
      setWlError('Could not join the waitlist right now')
    } finally {
      setWlSubmitting(false)
      waitlistBusyRef.current = false
    }
  }

  // Plain-language reason a day has no bookable slots, from the
  // availability API's reason code.
  function noSlotsCopy() {
    const dayLabel = selectedDate
      ? new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' })
      : 'this day'
    if (slotsReason === 'closed') return `They're closed on ${dayLabel}s — pick another day above, or join the waitlist and we'll text you if a spot opens up.`
    if (slotsReason === 'no_hours') return `This shop hasn't set their booking hours yet — join the waitlist and we'll text you as soon as booking opens.`
    if (slotsReason === 'too_far') return `This shop only books ${slotsMaxAdvance ?? 90} days out — pick an earlier date.`
    return `No times available this day — try another date, or join the waitlist for a specific time and we'll text you if it opens up.`
  }

  // Shared waitlist form, rendered both when a day has no bookable slots
  // and as an opt-in "want an earlier time?" section under the time grid.
  // The entry targets its own date (the picked date unless the customer
  // chooses a different one), so it works as an earlier-date request too.
  function renderWaitlistForm() {
    const targetDate = wlDate || selectedDate
    return (
      <>
        {wlJoined ? (
          <div className="bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-xs text-charcoal-900">
            You&apos;re on the waitlist{wlPosition ? ` (#${wlPosition} in line)` : ''} for {wlTime} on {targetDate ? new Date(targetDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}. We&apos;ll text you at {wlPhone} if it opens up.
          </div>
        ) : (
          <div className="bg-warm-100 border border-warm-200 rounded-lg p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-1.5">Date</label>
                <input type="date" value={targetDate} min={today} onChange={e => setWlDate(e.target.value)}
                  className="w-full min-w-0 bg-warm-200 border border-warm-300 rounded-lg px-3 py-2 text-charcoal-900 text-base outline-none" onFocus={e => e.target.style.borderColor = brand} onBlur={e => e.target.style.borderColor = ''} />
              </div>
              <div>
                <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-1.5">Desired Time</label>
                <input type="time" value={wlTime} onChange={e => setWlTime(e.target.value)}
                  className="w-full min-w-0 bg-warm-200 border border-warm-300 rounded-lg px-3 py-2 text-charcoal-900 text-base outline-none" onFocus={e => e.target.style.borderColor = brand} onBlur={e => e.target.style.borderColor = ''} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-1.5">Phone</label>
              <input type="tel" value={wlPhone} onChange={e => setWlPhone(e.target.value)} placeholder="(555) 000-0000"
                className="w-full min-w-0 bg-warm-200 border border-warm-300 rounded-lg px-3 py-2 text-charcoal-900 text-base outline-none" onFocus={e => e.target.style.borderColor = brand} onBlur={e => e.target.style.borderColor = ''} />
            </div>
            <div>
              <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-1.5">Name</label>
              <input type="text" value={wlName} onChange={e => setWlName(e.target.value)} placeholder="Your name"
                className="w-full bg-warm-200 border border-warm-300 rounded-lg px-3 py-2 text-charcoal-900 text-base outline-none" onFocus={e => e.target.style.borderColor = brand} onBlur={e => e.target.style.borderColor = ''} />
            </div>
            {wlError && <p className="text-red-400 text-xs">{wlError}</p>}
            <button onClick={joinWaitlist} disabled={wlSubmitting}
              className="w-full font-semibold px-4 py-3 rounded-lg text-sm transition-colors disabled:opacity-50"
              style={{ background: brand, color: onBrand }}>
              {wlSubmitting ? 'Joining…' : `Join Waitlist for ${selectedService?.name || 'this service'}`}
            </button>
          </div>
        )}
      </>
    )
  }

  // Captures the in-progress booking as soon as there's enough to recover
  // -- name, phone, and a selected service/date/time -- so the abandoned-
  // booking sweep has real data to text about instead of nothing.
  // Debounced so it doesn't fire on every keystroke, and skipped while a
  // recovery-link prefill is still loading so it can't overwrite the
  // session with a half-populated state.
  useEffect(() => {
    if (!prefillLoaded || !shop || success) return
    if (!clientName || clientPhone.replace(/\D/g, '').length < 10) return
    if (!selectedService || !selectedDate || !selectedTime) return

    const timer = setTimeout(() => {
      const [time, period] = selectedTime.split(' ')
      const [hours, minutes] = time.split(':')
      let h = parseInt(hours)
      if (period === 'PM' && h !== 12) h += 12
      if (period === 'AM' && h === 12) h = 0
      const time24 = `${h.toString().padStart(2, '0')}:${minutes}:00`

      fetch('/api/book/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          shopId: shop.id,
          barberId: selectedBarber?.barber_id || null,
          serviceId: selectedService.id,
          date: selectedDate,
          time: time24,
          clientName,
          clientPhone,
          clientEmail: clientEmail || null,
        }),
      }).catch(() => {})
    }, 800)

    return () => clearTimeout(timer)
  }, [prefillLoaded, shop, success, clientName, clientPhone, clientEmail, selectedService, selectedDate, selectedTime, selectedBarber, sessionId])

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

    // Referral reward, if this client referred someone who's since
    // completed their first visit here -- no PII in the return, safe
    // for this anonymous flow.
    const { data: rewardRows } = await supabase
      .rpc('get_active_referral_reward', { p_client_id: client.client_id, p_shop_id: shop.id })
    const reward = rewardRows?.[0]
    setActiveReward(reward ? { id: reward.reward_id, type: reward.reward_type, value: reward.reward_value } : null)
  }

  // Maps raw gateway/SDK messages to plain language a customer can act on.
  function friendlyPaymentError(raw: string): string {
    // The server sanitizes gateway errors before they reach us, but this
    // mapping never echoes raw text: a backend slip must not leak payment
    // processor internals onto the customer's screen.
    const msg = (raw || '').toLowerCase()
    if (msg.includes('no price set')) return 'This service doesn\u2019t have a price set yet \u2014 please call the shop to finish booking.'
    if (msg.includes('declined')) return 'Your card was declined. Double-check the card details or try a different card.'
    if (msg.includes('insufficient')) return 'Your card doesn’t have enough available for this payment. Try a different card.'
    if (msg.includes('expired')) return 'Your card is expired. Try a different card.'
    if (msg.includes('cvv') || msg.includes('cvc') || msg.includes('security code')) return 'The security code (CVV) looks wrong. Check it and try again.'
    if (msg.includes('invalid') && msg.includes('card')) return 'The card details don’t look right. Check the number and try again.'
    return 'Payment didn’t go through. Try again or use a different card.'
  }

  // Charges the deposit for an already-created appointment. Returns a
  // result object instead of throwing. Safe to retry: on a clean decline
  // the server deletes the pending deposit row so the attempt starts
  // fresh; on an ambiguous failure the server reuses the same pending
  // row (and its Square idempotency key) so the retry dedupes instead of
  // charging twice; if the first attempt actually went through, the server
  // reports the existing paid deposit as success.
  async function chargeDepositFor(apptId: string, srcId: string): Promise<{ ok: boolean; message: string }> {
    try {
      const depRes = await fetch('/api/square/create-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId: srcId, appointmentId: apptId, publicShopCode: shop.shop_code }),
      })
      const depData = await depRes.json()
      if (!depRes.ok || depData.error) {
        return { ok: false, message: friendlyPaymentError(depData.error || 'Deposit payment failed') }
      }
      return { ok: true, message: '' }
    } catch {
      return { ok: false, message: 'Deposit payment failed. Please check your connection and try again.' }
    }
  }

  // Immediate full-price charge for an already-created appointment. Safe
  // to retry: the server rejects with 409 if the appointment is already
  // paid, and Square dedupes on the appointment-derived idempotency key.
  async function chargeNowFor(apptId: string, srcId: string): Promise<{ ok: boolean; message: string }> {
    try {
      const payRes = await fetch('/api/square/create-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId: srcId, appointmentId: apptId, publicShopCode: shop.shop_code }),
      })
      const payData = await payRes.json()
      if (!payRes.ok || payData.error) {
        return { ok: false, message: friendlyPaymentError(payData.error || 'Payment failed') }
      }
      return { ok: true, message: '' }
    } catch {
      return { ok: false, message: 'Payment failed — please check your connection and try again.' }
    }
  }

  // Post-booking side effects: client SMS, analytics. Owner/barber
  // notifications are sent server-side in /api/book/create. Runs only
  // once the booking is fully settled (paid, or no payment required) --
  // never on the payment-failed path.
  async function finalizeBooking(appointmentId: string) {
    if (smsConsent) {
      // Anonymous confirmation: the server composes the message from the
      // appointment itself (shop/service/date/time) -- the client never
      // sends message text, so this can't be abused as an SMS relay.
      // Only a 2xx from /api/sms counts as "sent" -- the success screen
      // must not claim a text went out when the send failed.
      let smsOk = false
      try {
        const res = await fetch('/api/sms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: clientPhone, appointmentId }),
        })
        smsOk = res.ok
      } catch {
        // SMS failure is non-fatal
      }
      setSmsSent(smsOk)
    }

    trackMetaEvent('Schedule', { content_name: selectedService.name, value: finalPrice, currency: 'USD' })
    trackGoogleEvent('generate_lead', { value: finalPrice, currency: 'USD' })
  }

  // Re-attempts ONLY the charge against the already-created (held)
  // appointment -- never creates a second appointment. Square nonces are
  // single-use, so a fresh token is minted for every attempt.
  async function retryPayment() {
    // Synchronous guard: `retrying` state alone can't stop a same-tick
    // double-tap from charging twice.
    if (!pendingApptId || !failedChargeKind || retryBusyRef.current || retrying) return
    retryBusyRef.current = true
    const apptId = pendingApptId
    setRetrying(true)
    setPaymentError('')
    try {
      let srcId: string | null = null
      if (squareCardRef.current) {
        const result = await squareCardRef.current.tokenize()
        if (result.status === 'OK') {
          srcId = result.token
        } else {
          setPaymentError(friendlyPaymentError(result.errors?.[0]?.message || 'Card error'))
          return
        }
      }
      if (!srcId) {
        setPaymentError('Card form isn’t ready — tap "Try again" by the card form to reload it.')
        return
      }
      const result = failedChargeKind === 'deposit'
        ? await chargeDepositFor(pendingApptId, srcId)
        : await chargeNowFor(pendingApptId, srcId)
      if (!result.ok) {
        setPaymentError(result.message)
        return
      }
      // Paid -- finish the booking exactly as the first attempt would have.
      setPaymentFailed(false)
      setPendingApptId(null)
      setFailedChargeKind(null)
      setPaidSummary({
        kind: failedChargeKind,
        amount: failedChargeKind === 'deposit' ? (depositAmountEstimate ?? 0) : (finalPrice ?? 0),
      })
      await finalizeBooking(apptId)
      setSuccess(true)
    } finally {
      setRetrying(false)
      retryBusyRef.current = false
    }
  }

  // Resets the funnel for a fresh booking (success-screen "Book another").
  // Contact details carry over; everything else starts clean.
  function resetBookingFlow() {
    setSelectedBarber(null)
    setSelectedService(null)
    setSelectedDate('')
    setSelectedTime('')
    setAvailableSlots([])
    setNotes('')
    setError('')
    setPaymentError('')
    setPaymentFailed(false)
    setPendingApptId(null)
    setFailedChargeKind(null)
    setConfirmedBarberName(null)
    setReturningClient(null)
    setActiveReward(null)
    setPaidSummary(null)
    setCaptchaToken('')
    setCaptchaLoadFailed(false)
    setSuccess(false)
    setStep(1)
    window.scrollTo(0, 0)
  }

  // Wrapper: synchronous double-submit guard + guaranteed `submitting`
  // reset. The ref check must run first -- React state updates don't settle
  // between two rapid taps, so `submitting` alone can't stop a double-tap
  // from running the whole booking flow twice (two bookingKeys -> two
  // appointments, two charges). The finally guarantees the button is
  // never left permanently disabled, whatever throws inside doBook.
  async function handleBook() {
    if (bookBusyRef.current) return
    bookBusyRef.current = true
    setSubmitting(true)
    try {
      await doBook()
    } finally {
      setSubmitting(false)
      bookBusyRef.current = false
    }
  }

  async function doBook() {
    // Details validation: the server also validates, but catching it here
    // keeps the customer on step 4 with a readable message instead of a
    // rejected booking (and keeps invalid client rows from being written).
    if (!clientName.trim()) { setError('Please enter your name.'); return }
    if (clientPhone.replace(/\D/g, '').length < 10) { setError('Please enter a valid 10-digit phone number.'); return }
    if (clientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail.trim())) { setError('Please enter a valid email address, or leave it blank.'); return }
    if (CAPTCHA_ENABLED && !captchaToken) { setError('Please tick the box below to show you’re not a robot.'); return }
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
        setError('That didn’t go through — try once more.')
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
        setPaymentError(friendlyPaymentError(msg))
        resetCaptcha()
        return
      }
    }

    // If a card was required but the SDK never produced a token, fail.
    // The card section below offers an in-app "Try again" (no page refresh
    // exists inside the iOS wrapper).
    if ((shop?.require_card_to_book || requiresDeposit) && !sourceId) {
      setPaymentError('Card form isn’t ready yet — tap "Try again" below to reload it.')
      resetCaptcha()
      return
    }

    // Deposit configuration sanity: a required deposit that can't be
    // computed to a positive cent amount (service has no price yet,
    // misconfigured flat deposit of $0, service total $0 with a percent
    // deposit, ...) must not reach Square. Block with a plain message that
    // tells the customer what to do instead of an opaque failure.
    if (requiresDeposit && (depositAmountEstimate == null || depositAmountEstimate <= 0)) {
      setError('This service doesn’t have a price set yet — please call the shop to finish booking.')
      resetCaptcha()
      return
    }

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
        .insert({ id: newId, phone: normalizedPhone, source: 'online_booking', ...clientFields })
      if (newClientErr) { setError('Something went wrong saving your info. Try again.'); resetCaptcha(); return }
      clientId = newId

      // Attribute the referral, if any — non-fatal, and only for a
      // genuinely new client (an existing client reusing a ?ref= link
      // isn't "referred" by it).
      if (refCode && shop?.id) {
        fetch('/api/book/referral', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId: newId, shopId: shop.id, refCode }),
        }).catch(() => {})
      }
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

    // Create the appointment via POST /api/book/create (service-side).
    // The server recomputes the price from services.price + pricing_rules
    // (+ a server-validated referral reward), re-validates the slot
    // in-request, and enforces idempotency via bookingKey -- the browser
    // sends NO price fields, so the client can no longer dictate what a
    // booking costs. One fresh key per logical attempt; the wrapper's
    // bookBusyRef guarantees only one attempt runs at a time, so a
    // double-tap can't mint two keys and create two appointments.
    const bookingKey = crypto.randomUUID()
    let newApptId: string
    try {
      const createRes = await fetch('/api/book/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopCode: shop.shop_code,
          serviceId: selectedService.id,
          barberId: selectedBarber?.barber_id || null,
          date: selectedDate,
          time: time24,
          clientName,
          clientPhone,
          clientEmail: clientEmail || null,
          notes: notes || null,
          rewardCode: activeReward?.id || null,
          idempotencyKey: bookingKey,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      })
      const createData = await createRes.json()
      if (!createRes.ok || !createData.appointmentId) {
        if (createData?.code === 'slot_taken') {
          // Someone grabbed the slot between the availability read and the
          // submit: take the customer back to the time picker with FRESH
          // slots instead of stranding them on the details step.
          setSlotsRefreshKey(k => k + 1)
          setStep(3)
          setError('That time was just taken — here are the latest openings. Pick a new time and confirm again.')
        } else {
          setError(createData.error || 'Couldn’t finish your booking — give it another try.')
        }
        resetCaptcha()
        return
      }
      newApptId = createData.appointmentId
      // When the client booked "any barber", the server assigned a specific
      // staff member -- show their name on the confirmation screen.
      if (!selectedBarber && createData.barberName) {
        setConfirmedBarberName(createData.barberName)
      }
    } catch {
      setError('Couldn’t finish your booking — give it another try.')
      resetCaptcha()
      return
    }

    // The claimed referral reward (if any) is validated and redeemed
    // inside /api/book/create -- no separate client-side call.

    // Mark the recovery session completed so the abandoned-booking sweep
    // never fires a recovery text for a booking that already went through — non-fatal
    fetch('/api/book/session/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, appointmentId: newApptId }),
    }).catch(() => {})

    if (sourceId && requiresDeposit) {
      // Deposit path: charges the deposit amount (not the full price) and,
      // on success, the server flips the appointment straight to
      // 'confirmed'. On failure the appointment stays 'pending' with its
      // 15-minute hold -- show the dedicated retry state, NOT success.
      const result = await chargeDepositFor(newApptId, sourceId)
      if (!result.ok) {
        setPendingApptId(newApptId)
        setFailedChargeKind('deposit')
        setPaymentFailed(true)
        setPaymentError(result.message)
        return
      }
      setPaidSummary({ kind: 'deposit', amount: depositAmountEstimate ?? 0 })
    } else if (sourceId && cardMode === 'charge' && (finalPrice ?? 0) > 0) {
      // Charge card immediately if one-time mode (need appointmentId for Square).
      // A $0 total (free service or a reward covering everything) skips
      // Square entirely -- charging $0 would fail at the gateway.
      const result = await chargeNowFor(newApptId, sourceId)
      if (!result.ok) {
        setPendingApptId(newApptId)
        setFailedChargeKind('charge')
        setPaymentFailed(true)
        setPaymentError(result.message)
        return
      }
      setPaidSummary({ kind: 'charge', amount: finalPrice ?? 0 })
    } else if (sourceId && cardMode === 'save' && clientId) {
      // Save card on file if client chose save mode -- and only claim it
      // worked if the server said so. Requires the explicit card-on-file
      // opt-in; without it we stop before any card is stored.
      if (!cardConsent) {
        setError('To save your card for later, please agree to the card-on-file terms above.')
        return
      }
      const saveRes = await fetch('/api/square/save-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId, clientId, shopId: shop.id, consent: true, consentText: cardConsentText }),
      }).catch(() => null)
      if (!saveRes?.ok) {
        setError('We couldn’t save your card for later — please bring it to your appointment.')
        setPaidSummary({ kind: 'none', amount: 0 })
      } else {
        setPaidSummary({ kind: 'save', amount: 0 })
      }
    } else {
      // No card was taken now (pay at the shop, or a $0 total) -- record
      // that explicitly so the success screen can't imply a charge.
      setPaidSummary({ kind: 'none', amount: 0 })
    }

    // Fully settled (paid, or no payment required) -- notify everyone,
    // send the client confirmation, then show the success screen.
    await finalizeBooking(newApptId)
    setSuccess(true)
  }

  // Customer's local date for the date picker's minimum -- a UTC date is
  // the wrong day near midnight for western-hemisphere customers.
  const today = new Date().toLocaleDateString('en-CA')

  // ---- Shop brand system ----
  // Normalize any stored value to #rrggbb; garbage falls back to ChairOS gold.
  const normalizeHex = (h: string) => {
    const m = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec((h || '').trim())
    if (!m) return '#b8861f'
    const c = m[1]
    return '#' + (c.length === 3 ? c.split('').map(x => x + x).join('') : c).toLowerCase()
  }
  // Relative luminance of the brand color, so text on brand-colored
  // surfaces stays readable no matter what the shop picked.
  const brandLuminance = (hex: string) => {
    const c = hex.replace('#', '')
    const [r, g, b] = [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16) / 255)
      .map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const brand = normalizeHex(shop?.brand_color || '#b8861f')
  const onBrand = brandLuminance(brand) > 0.18 ? '#000000' : '#ffffff'
  const brandLight = brand + '18'
  const brandMid = brand + '33'
  // Fallback avatar palette leads with the shop's brand color.
  const COLORS = [brand,'#4a7fb5','#3aab6e','#e07850','#9b6db5','#c06060']

  // Browser tab should say the shop's name, not ours.
  useEffect(() => {
    if (shop?.name) document.title = `${shop.name} — Book online`
  }, [shop?.name])

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
            {selectedService.name} with {selectedBarber?.barber_name || selectedBarber?.alias || confirmedBarberName || `any ${staffLabelLower}`} on{' '}
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
              { label: 'Price', value: `$${finalPrice}`, colored: true },
              { label: 'Duration', value: `${selectedService.duration_minutes} mins` },
              { label: staffLabel, value: selectedBarber?.barber_name || selectedBarber?.alias || confirmedBarberName || 'Any Available' },
            ].map((row, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-charcoal-400">{row.label}</span>
                <span style={row.colored ? { color: brand } : {}} className={row.colored ? 'font-mono font-semibold' : 'text-charcoal-900'}>
                  {row.value}
                </span>
              </div>
            ))}
            {pricingResult?.appliedRules.map(ar => (
              <div key={ar.rule.id} className="flex justify-between text-sm">
                <span className="text-charcoal-400">{ar.label}</span>
                <span className="font-mono font-semibold" style={{ color: brand }}>{ar.displayValue}</span>
              </div>
            ))}
            {activeReward && (
              <div className="flex justify-between text-sm">
                <span className="text-charcoal-400">Referral reward</span>
                <span className="font-mono font-semibold" style={{ color: brand }}>
                  -{activeReward.type === 'percent_off' ? `${activeReward.value}%` : `$${activeReward.value}`}
                </span>
              </div>
            )}
            {/* Payment truth: never let "You're booked" imply a charge that
                didn't happen. */}
            {paidSummary?.kind === 'deposit' && (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-charcoal-400">Deposit paid</span>
                  <span className="font-mono font-semibold" style={{ color: brand }}>${paidSummary.amount}</span>
                </div>
                {(finalPrice ?? 0) > paidSummary.amount && (
                  <div className="flex justify-between text-sm">
                    <span className="text-charcoal-400">Due at the shop</span>
                    <span className="font-mono font-semibold text-charcoal-900">${(finalPrice ?? 0) - paidSummary.amount}</span>
                  </div>
                )}
              </>
            )}
            {paidSummary?.kind === 'charge' && (
              <div className="flex justify-between text-sm">
                <span className="text-charcoal-400">Paid today</span>
                <span className="font-mono font-semibold" style={{ color: brand }}>${paidSummary.amount}</span>
              </div>
            )}
            {(paidSummary?.kind === 'save' || paidSummary?.kind === 'none') && (finalPrice ?? 0) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-charcoal-400">{paidSummary.kind === 'save' ? 'Card on file — due at the shop' : 'Due at the shop'}</span>
                <span className="font-mono font-semibold text-charcoal-900">${finalPrice}</span>
              </div>
            )}
          </div>
          <div className="mb-6 flex justify-center">
            <AddToCalendarButton
              name={`${selectedService.name} at ${shop.name}`}
              startDate={selectedDate}
              startTime={(() => { const m = timeStrToMinutes(selectedTime); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` })()}
              endTime={(() => { const m = timeStrToMinutes(selectedTime) + (selectedService.duration_minutes ?? 30); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` })()}
              timeZone={typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC'}
              location={[shop.address, shop.city].filter(Boolean).join(', ') || undefined}
              description={`Booked via ChairOS${selectedBarber?.barber_name || selectedBarber?.alias ? ` with ${selectedBarber.barber_name || selectedBarber.alias}` : ''}.`}
            />
          </div>
          <p className="text-charcoal-600 text-xs">
            {smsConsent && smsSent ? `Confirmation text sent to ${clientPhone}.` : 'Booking confirmed.'} Powered by ChairOS.
          </p>
        </div>
        <div className="flex flex-col gap-2 mt-4">
          <button onClick={resetBookingFlow}
            className="w-full font-semibold px-4 py-3 rounded-lg text-sm transition-colors"
            style={{ background: brand, color: onBrand }}>
            Book another appointment
          </button>
          <a href="/my"
            className="w-full font-semibold px-4 py-3 rounded-lg text-sm text-center bg-warm-100 border border-warm-300 text-charcoal-900 transition-colors hover:border-warm-400">
            <span className="block">Your client portal →</span>
            <span className="block font-normal text-xs text-charcoal-500 mt-0.5">Manage bookings, keep a card on file &amp; track loyalty — sign in with your phone number.</span>
          </a>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-warm-50">

      {shop.hero_url && (
        <div className="w-full h-36 md:h-44 overflow-hidden relative">
          <img src={shop.hero_url} alt={shop.name} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/30 to-black/75" />
        </div>
      )}

      {/* When a hero photo exists, the info block is taller than the photo
          overlap -- its lower rows sit on the light page, not the photo.
          So the info rides on its own dark card: white text stays readable
          no matter how short the photo is. Without a photo, the full-bleed
          dark band plays the same role. */}
      <div className={shop.hero_url ? 'px-6 -mt-16 relative z-10' : 'px-6 py-5 border-b border-warm-200'}
        style={shop.hero_url ? undefined : { background: `linear-gradient(135deg, color-mix(in srgb, ${brand} 38%, #0a0a0a), #0a0a0a)` }}>
        <div className={shop.hero_url ? 'max-w-2xl mx-auto rounded-2xl px-5 py-4 shadow-xl border border-white/10' : 'max-w-2xl mx-auto'}
          style={shop.hero_url ? { background: 'linear-gradient(135deg, #1b1b1f, #0a0a0a)' } : undefined}>
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-4">
            {shop.logo_url ? (
              <img src={shop.logo_url} alt={shop.name}
                className="w-16 h-16 rounded-2xl object-cover flex-shrink-0 shadow-lg border border-white/10" />
            ) : (
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center font-serif text-2xl font-bold flex-shrink-0 shadow-lg"
                style={{ background: brandMid, color: `color-mix(in srgb, ${brand} 55%, white)`, border: `2px solid ${brand}40` }}>
                {shop.name[0]}
              </div>
            )}
            <div className="flex-1 min-w-0">
              {/* This header sits on a fixed-dark backdrop -- solid near-black
                  when there's no hero photo, or a photo darkened with a black
                  gradient (below) when there is. Text here can't use the
                  theme-reactive charcoal-* classes (dark-in-light-mode) or the
                  raw brand color unblended -- either can end up dark-on-dark
                  for a light-mode visitor or a shop with a dark brand color. */}
              <h1 className="font-serif text-xl text-white leading-tight">{shop.name}</h1>
              {avgRating != null && (
                <p className="text-xs mt-1 text-white/80">
                  <span className="text-amber-400">★</span> {avgRating.toFixed(1)} · {shopReviews.length} review{shopReviews.length !== 1 ? 's' : ''}
                </p>
              )}
              {shop.tagline && (
                <p className="text-xs mt-0.5 truncate" style={{ color: `color-mix(in srgb, ${brand} 55%, white)` }}>{shop.tagline}</p>
              )}
            </div>
          </div>
          {(shop.address || shop.city || shop.phone || todayHoursLabel) && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3">
              {(shop.address || shop.city) && (
                <span className="inline-flex items-center gap-1.5 text-white/60 text-xs">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                  </svg>
                  {[shop.address, shop.city].filter(Boolean).join(' · ')}
                </span>
              )}
              {shop.phone && (
                <a href={`tel:${shop.phone.replace(/\D/g, '')}`}
                  className="inline-flex items-center gap-1.5 text-xs text-white underline decoration-white/30 underline-offset-2">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.85a16 16 0 0 0 6.29 6.29l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                  </svg>
                  {shop.phone}
                </a>
              )}
              {todayHoursLabel && (
                <span className="inline-flex items-center gap-1.5 text-white/60 text-xs">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                  </svg>
                  {todayHoursLabel}
                </span>
              )}
            </div>
          )}
        </div>
        {shop.bio && (
          <div className="max-w-2xl mx-auto mt-3">
            <p className="text-white/50 text-xs leading-relaxed">{shop.bio}</p>
          </div>
        )}
        </div>
      </div>

      <div className="bg-warm-100 border-b border-warm-200 px-6 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-2">
          {[staffLabel, 'Service', 'Date & Time', 'Info & Pay'].map((label, i) => (
            <div key={i} className="flex items-center gap-2 flex-1 last:flex-none">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all"
                style={{
                  background: step > i+1 ? '#22c55e' : step === i+1 ? brand : '#262626',
                  color: step > i+1 ? '#000' : step === i+1 ? onBrand : '#6b7280'
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
                  ★ {(avgRating ?? 0).toFixed(1)} · {shopReviews.length} review{shopReviews.length !== 1 ? 's' : ''}
                </div>
                {shop?.slug && (
                  <a href={`/shop/${shop.slug}/reviews`} className="text-xs font-semibold" style={{ color: brand }}>
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
          <StepPanel>
            <h2 className="font-serif text-xl text-charcoal-900 mb-1">Choose your {staffLabelLower}</h2>
            <p className="text-charcoal-500 text-sm mb-6">Pick who you&apos;d like at {shop.name} — or grab the first available {staffLabelLower}.</p>
            <div className="grid grid-cols-2 gap-3 mb-6">
              <Pressable
                onClick={() => { setSelectedBarber(null); resetWaitlistJoinState(); setStep(2) }}
                className="bg-warm-100 border-2 border-warm-200 rounded-xl p-4 cursor-pointer transition-all text-center hover:border-warm-400"
                onMouseEnter={e => (e.currentTarget.style.borderColor = brand)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = '')}>
                <div className="w-14 h-14 rounded-full bg-warm-200 flex items-center justify-center mx-auto mb-3">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                </div>
                <div className="text-sm font-semibold text-charcoal-900">Any {staffLabel}</div>
                <div className="text-xs text-charcoal-500 mt-1">First available</div>
              </Pressable>
              {barbers.map((b, i) => (
                <Pressable key={b.id}
                  onClick={() => { setSelectedBarber(b); resetWaitlistJoinState(); setStep(2) }}
                  className="bg-warm-100 border-2 border-warm-200 rounded-xl p-4 cursor-pointer transition-all text-center"
                  onMouseEnter={e => (e.currentTarget.style.borderColor = brand)}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = '')}>
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
                </Pressable>
              ))}
            </div>
            <button
              onClick={() => { if (shop?.slug) router.push(`/shop/${shop.slug}`); else router.back() }}
              className="text-sm text-charcoal-500 hover:text-charcoal-900 transition-colors">← Back</button>
          </StepPanel>
        )}

        {step === 2 && (
          <StepPanel>
            <h2 className="font-serif text-xl text-charcoal-900 mb-1">Choose a service</h2>
            <p className="text-charcoal-500 text-sm mb-6">What are you in for today?</p>
            <div className="space-y-2 mb-6">
              {services.length === 0 && (
                <div className="bg-warm-100 border border-warm-200 rounded-xl p-6 text-center">
                  <p className="text-sm font-semibold text-charcoal-900 mb-1">No services listed yet</p>
                  <p className="text-xs text-charcoal-500">Give {shop.name} a call and they&apos;ll get you sorted.</p>
                </div>
              )}
              {services.map((s) => {
                // Today-only preview of an active promo -- the actual price
                // (including any recurring peak/off-peak rule) is finalized
                // once a date and time are picked in the next step.
                const todayPromo = pricingRules.find(r =>
                  (r.service_id == null || r.service_id === s.id) && isPromoRule(r) && promoActiveOn(r, today)
                )
                return (
                  <Pressable key={s.id}
                    onClick={() => { setSelectedService(s); setStep(3) }}
                    className="bg-warm-100 border-2 rounded-xl p-4 cursor-pointer transition-all flex items-center justify-between"
                    style={{ borderColor: selectedService?.id === s.id ? brand : '#EAE8E0' }}
                    onMouseEnter={e => { if (selectedService?.id !== s.id) e.currentTarget.style.borderColor = brand }}
                    onMouseLeave={e => { if (selectedService?.id !== s.id) e.currentTarget.style.borderColor = '#EAE8E0' }}>
                    <div>
                      <div className="text-sm font-semibold text-charcoal-900 flex items-center gap-2">
                        {s.name}
                        {todayPromo && (
                          <span className="text-xs font-semibold px-1.5 py-0.5 rounded" style={{ background: brandLight, color: brand }}>{ruleLabel(todayPromo)}</span>
                        )}
                      </div>
                      <div className="text-xs text-charcoal-500 mt-0.5">{s.description} · {s.duration_minutes} mins</div>
                    </div>
                    <div className="font-serif text-lg ml-4 flex-shrink-0 font-semibold" style={{ color: brand }}>{s.price != null ? `$${s.price}` : 'Pay at shop'}</div>
                  </Pressable>
                )
              })}
            </div>
            <button onClick={() => setStep(1)} className="text-sm text-charcoal-500 hover:text-charcoal-900 transition-colors">← Back</button>
          </StepPanel>
        )}

        {step === 3 && (
          <StepPanel>
            <h2 className="font-serif text-xl text-charcoal-900 mb-1">Pick a date & time</h2>
            <p className="text-charcoal-500 text-sm mb-6">Choose when you'd like to come in.</p>
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Date</label>
                <input type="date" value={selectedDate} min={today} max={maxBookableDate}
                  onChange={e => { setSelectedDate(e.target.value); setWlDate(''); resetWaitlistJoinState() }}
                  className="w-full min-w-0 bg-warm-100 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-base outline-none transition-colors"
                  onFocus={e => e.target.style.borderColor = brand}
                  onBlur={e => e.target.style.borderColor = ''} />
                {rulesLine && <p className="text-charcoal-500 text-xs mt-2">{rulesLine}</p>}
              </div>
              {selectedDate && (
                <div>
                  <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Time</label>
                  {loadingSlots ? (
                    <p className="text-charcoal-500 text-xs py-3">Checking availability…</p>
                  ) : availableSlots.length === 0 ? (
                    <div className="py-3">
                      <p className="text-charcoal-500 text-xs mb-3">{noSlotsCopy()}</p>
                      {renderWaitlistForm()}
                    </div>
                  ) : (
                  <>
                  <div className="grid grid-cols-4 gap-2">
                    {availableSlots.map(t => (
                      <button key={t} onClick={() => setSelectedTime(t)}
                        className="py-3 rounded-xl text-sm font-semibold transition-all border-2"
                        style={{
                          background: selectedTime === t ? brand : '#ffffff',
                          borderColor: selectedTime === t ? brand : '#EAE8E0',
                          color: selectedTime === t ? onBrand : '#1A1A18'
                        }}>
                        {t}
                      </button>
                    ))}
                  </div>
                  <div className="mt-4">
                    <button onClick={() => setShowWaitlistOption(v => !v)}
                      className="text-xs font-semibold text-charcoal-500 underline underline-offset-2 hover:text-charcoal-900 transition-colors">
                      {showWaitlistOption ? 'Hide the waitlist' : 'Want an earlier time? Join the waitlist'}
                    </button>
                    {showWaitlistOption && <div className="mt-3">{renderWaitlistForm()}</div>}
                  </div>
                  </>
                  )}
                </div>
              )}
              {pricingResult && pricingResult.appliedRules.length > 0 && (
                <div className="text-sm rounded-lg px-3 py-2 space-y-0.5" style={{ background: brandLight, color: brand }}>
                  {pricingResult.appliedRules.map(ar => (
                    <div key={ar.rule.id}>{ar.label}: {ar.displayValue}</div>
                  ))}
                  <div className="font-semibold">Now ${pricingResult.finalPrice}</div>
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="text-sm text-charcoal-500 hover:text-charcoal-900 transition-colors">← Back</button>
              <button
                onClick={() => { if (!selectedDate || !selectedTime) { setError('Pick a date and time first.'); return }; setError(''); setStep(4) }}
                className="ml-auto font-semibold px-6 py-3 rounded-lg text-sm transition-colors"
                style={{ background: brand, color: onBrand }}>
                Continue →
              </button>
            </div>
          </StepPanel>
        )}

        {step === 4 && (
          <StepPanel>
            {paymentFailed && (
              <div className="bg-red-950/50 border border-red-800 rounded-xl p-5 mb-6">
                <h3 className="font-serif text-lg text-red-200 mb-2">
                  {failedChargeKind === 'deposit' ? 'Deposit failed — your spot is held' : 'Payment failed — your spot is held'}
                </h3>
                <p className="text-red-300/80 text-sm mb-3">
                  Your spot is held for about 15 minutes. If the payment
                  didn’t go through, nothing was charged — but if it timed
                  out, check your bank or bookings before retrying so you
                  don’t pay twice.
                  Just fix your payment below and retry before the hold runs out.
                </p>
                {paymentError && (
                  <p className="text-amber-400 text-sm mb-4">{paymentError}</p>
                )}
                <button onClick={retryPayment} disabled={retrying}
                  className="w-full font-semibold px-4 py-3 rounded-lg text-sm transition-colors disabled:opacity-50"
                  style={{ background: brand, color: onBrand }}>
                  {retrying ? 'Retrying…' : 'Retry payment'}
                </button>
                <p className="text-red-300/60 text-xs mt-3 text-center">
                  {selectedService?.name}
                  {selectedDate && ` · ${new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                  {selectedTime && ` at ${selectedTime}`}
                </p>
              </div>
            )}
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
              {pricingResult?.appliedRules.map(ar => (
                <div key={ar.rule.id} className="flex justify-between text-sm">
                  <span className="text-charcoal-400">{ar.label}</span>
                  <span className="font-mono font-semibold" style={{ color: brand }}>{ar.displayValue}</span>
                </div>
              ))}
              {activeReward && (
                <div className="flex justify-between text-sm">
                  <span className="text-charcoal-400">Referral reward</span>
                  <span className="font-mono font-semibold" style={{ color: brand }}>
                    -{activeReward.type === 'percent_off' ? `${activeReward.value}%` : `$${activeReward.value}`}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm border-t border-warm-200 pt-2 mt-2">
                <span className="text-charcoal-400">{willChargeDeposit || willChargeNow ? 'Total' : 'Due at the shop'}</span>
                <span className="font-mono font-semibold" style={{ color: brand }}>{chargeDisplay ?? 'Pay at shop'}</span>
              </div>
              {requiresDeposit && depositDisplay && (
                <div className="flex justify-between text-sm">
                  <span className="text-charcoal-400">Deposit due now</span>
                  <span className="font-mono font-semibold" style={{ color: brand }}>{depositDisplay}</span>
                </div>
              )}
            </div>
            {!willChargeDeposit && !willChargeNow && (finalPrice ?? 0) > 0 && (
              <p className="text-charcoal-500 text-xs mt-3 leading-relaxed">
                Nothing due today — pay {chargeDisplay} at the shop.
              </p>
            )}
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
                    className="w-full bg-warm-100 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-base outline-none transition-colors"
                    onFocus={e => e.target.style.borderColor = brand}
                    onBlur={e => e.target.style.borderColor = ''} />
                  {f.label === 'Phone Number *' && (
                    <p className="text-charcoal-600 text-xs mt-2 leading-relaxed">
                      If you don't finish booking, we may text you a reminder to complete it.
                    </p>
                  )}
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

                {/* Save vs. charge toggle — not shown for deposit bookings, which always charge the deposit now.
                    Also hidden while the payment-failed panel is up: changing
                    save/charge mode while retrying an existing held
                    appointment would charge/finalize with stale UI state. */}
                {!requiresDeposit && !paymentFailed && (
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {[
                      { key: 'save', label: 'Save for later', sub: 'Pay at checkout' },
                      { key: 'charge', label: 'Charge now', sub: chargeDisplay ? `${chargeDisplay} today` : 'Pay at checkout' },
                    ].map(opt => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setCardMode(opt.key as 'save' | 'charge')}
                        className={`p-3 rounded-xl border-2 text-left text-sm transition-colors ${
                          cardMode === opt.key
                            ? 'text-charcoal-900'
                            : 'border-warm-300 bg-warm-100 text-charcoal-500 hover:border-warm-400'
                        }`}
                        style={cardMode === opt.key ? { borderColor: brand, background: brandLight } : {}}
                      >
                        <div className="font-semibold">{opt.label}</div>
                        <div className="text-xs opacity-70 mt-0.5">{opt.sub}</div>
                      </button>
                    ))}
                  </div>
                )}

                <div className="bg-neutral-900 border border-neutral-700 rounded-xl p-4">
                  {/* Square's attach() needs the target element actually laid out
                      (not display:none) while it runs, so this stays mounted and
                      visible the whole time -- the spinner overlays it instead of
                      hiding it. A failed init hides it with `invisible` (layout
                      preserved) so the retry's attach() still works. */}
                  {cardLoading && (
                    <div className="flex items-center gap-2 py-3 text-neutral-500 text-sm">
                      <div className="w-4 h-4 rounded-full border-2 border-neutral-600 border-t-amber-500 animate-spin flex-shrink-0" />
                      Loading card form...
                    </div>
                  )}
                  <div id="square-card-container" className={paymentError && !cardReady ? 'invisible' : ''} />
                  {!cardLoading && !cardReady && !paymentError && (
                    <p className="text-neutral-500 text-xs py-2">Card form unavailable — you can pay at the shop.</p>
                  )}
                </div>
                {paymentError && (
                  <div className="mt-2">
                    <p className="text-amber-400 text-xs">{paymentError}</p>
                    {/* In-app recovery: the iOS wrapper has no page refresh. */}
                    {!cardReady && (
                      <button type="button" onClick={retryCardInit}
                        className="mt-2 text-xs font-semibold text-neutral-200 underline underline-offset-2 hover:text-white transition-colors">
                        Try again
                      </button>
                    )}
                  </div>
                )}
                <p className="text-neutral-600 text-xs mt-2">
                  {requiresDeposit
                    ? (depositDisplay
                        ? `A ${depositDisplay} deposit holds your slot now. You’ve got 15 minutes to pay it — after that the slot opens back up. The rest is due at the shop.`
                        : 'A deposit holds your slot now — the amount will be confirmed with the shop. The rest is due at the shop.')
                    : cardMode === 'save'
                    ? 'Your card is saved securely by Square and charged at checkout.'
                    : (chargeDisplay ? `Your card is charged ${chargeDisplay} now. Tip is added at the shop.` : 'Your card is charged at checkout. Tip is added at the shop.')}
                  {' '}We do not store your full card number.
                </p>
                {/* Card-on-file opt-in: unchecked by default, required to save. */}
                {!requiresDeposit && cardMode === 'save' && (
                  <label className="flex items-start gap-3 cursor-pointer mt-3">
                    <input
                      type="checkbox"
                      checked={cardConsent}
                      onChange={e => setCardConsent(e.target.checked)}
                      className="mt-0.5 w-4 h-4 flex-shrink-0"
                      style={{ accentColor: brand }}
                    />
                    <span className="text-xs text-neutral-400 leading-relaxed">{cardConsentText}</span>
                  </label>
                )}
              </div>
            )}

            {/* Consent checkboxes */}
            <div className="space-y-3 mb-6">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={smsConsent}
                  onChange={e => setSmsConsent(e.target.checked)}
                  className="mt-0.5 w-4 h-4 flex-shrink-0" style={{ accentColor: brand }}
                />
                <span className="text-xs text-charcoal-500 leading-relaxed">
                  Text me appointment reminders and updates (optional). Message & data rates may apply. Reply STOP to opt out. View our{' '}
                  <a href="/privacy" className="underline hover:text-charcoal-300">Privacy Policy</a>.
                </span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={emailConsent}
                  onChange={e => setEmailConsent(e.target.checked)}
                  className="mt-0.5 w-4 h-4 flex-shrink-0" style={{ accentColor: brand }}
                />
                <span className="text-xs text-charcoal-500 leading-relaxed">
                  I'd like to receive email updates from {shop.name} (optional).
                </span>
              </label>
            </div>

            {CAPTCHA_ENABLED && (
              <div className="mb-4">
                {captchaLoadFailed ? (
                  <div className="bg-warm-100 border border-warm-300 rounded-lg p-4 text-center">
                    <p className="text-charcoal-500 text-xs mb-2">Verification couldn&apos;t load.</p>
                    <button type="button"
                      onClick={() => { setCaptchaLoadFailed(false); setCaptchaToken(''); setCaptchaRetryKey(k => k + 1) }}
                      className="text-xs font-semibold text-charcoal-900 underline underline-offset-2 hover:text-black transition-colors">
                      Try again
                    </button>
                  </div>
                ) : (
                  <Turnstile key={captchaRetryKey} ref={turnstileRef}
                    onVerify={setCaptchaToken}
                    onExpire={() => setCaptchaToken('')}
                    onError={() => setCaptchaLoadFailed(true)} />
                )}
              </div>
            )}

            <div className="flex gap-3 items-center">
              {/* Disabled while the payment-failed panel is up: navigating
                  back would let the customer change service/date/time while
                  pendingApptId still points at the old held appointment,
                  and the retry would charge the old booking. */}
              <button onClick={() => setStep(3)} disabled={paymentFailed} className="text-sm text-charcoal-500 hover:text-charcoal-900 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">← Back</button>
              {/* Hidden while the payment-failed panel is up -- retrying
                  happens through its "Retry payment" button instead. */}
              {!paymentFailed && (
                <button onClick={handleBook} disabled={submitting || !contactValid || (CAPTCHA_ENABLED && !captchaToken)}
                  className="ml-auto font-semibold px-8 py-3 rounded-lg text-sm transition-colors disabled:opacity-50"
                  style={{ background: brand, color: onBrand }}>
                  {submitting ? 'Processing...'
                    : willChargeDeposit ? `Confirm & Pay Deposit ${depositDisplay}`
                    : willChargeNow ? `Confirm & Pay ${chargeDisplay}`
                    : willSaveCard ? 'Confirm & Save Card'
                    : 'Confirm Booking'}
                </button>
              )}
            </div>
            {shop?.cancellation_policy && (
              <div className="mt-4 p-3 bg-warm-100 dark:bg-[#1E1E1B] border border-warm-200 dark:border-[#2A2A26] rounded-lg">
                <div className="text-xs font-semibold text-charcoal-700 dark:text-[#A8A89E] mb-1">Cancellation Policy</div>
                <div className="text-xs text-charcoal-600 dark:text-[#8A8A80] whitespace-pre-wrap">{shop.cancellation_policy}</div>
              </div>
            )}
            <p className="text-charcoal-600 text-xs text-center mt-6">Powered by ChairOS</p>
          </StepPanel>
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
