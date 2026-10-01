'use client'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useParams } from 'next/navigation'
import { resolveKioskTheme, type KioskConfig } from '@/lib/kioskConfig'
import { kioskT, kioskStaffLabel, KIOSK_DAY_SHORT, type KioskLang, type KioskStringKey } from '@/lib/kioskStrings'
import { timeStrToMinutes } from '@/lib/availability'
import { StepPanel } from '@/components/motion'

type QueueRow = { id: string; display_label: string; status: string; created_at: string }
type Screen = 'home' | 'signin' | 'queue' | 'details' | 'appt' | 'bookahead'
type WizardStep = 'details' | 'barber' | 'service' | 'code' | 'success'
type ApptStep = 'phone' | 'list' | 'code' | 'done'
type BaStep = 'service' | 'barber' | 'day' | 'time' | 'confirm' | 'booked'

type ApptRow = {
  id: string
  time: string
  clientName: string
  serviceName: string | null
  staffName: string | null
  status: string
}

type BaStaffSlots = { barberId: string; name: string; slots: string[] }

// A shared counter tablet must never sit on one customer's half-finished
// check-in: after this long with no taps, everything clears back to the
// home screen (which also protects the previous customer's name/phone).
const IDLE_RESET_MS = 75_000
const SUCCESS_COUNTDOWN_S = 10
const LANG_KEY = 'kiosk-lang'

const DAY_ORDER = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function todayStr(): string {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

export default function KioskCheckIn() {
  const params = useParams()
  const shopCode = (params.shopCode as string)?.toUpperCase()
  const supabase = createClient()

  const [lang, setLang] = useState<KioskLang>(() => {
    try {
      return window.localStorage.getItem(LANG_KEY) === 'es' ? 'es' : 'en'
    } catch {
      return 'en'
    }
  })
  const t = (key: KioskStringKey, vars?: Record<string, string | number>) => kioskT(lang, key, vars)

  function pickLang(l: KioskLang) {
    setLang(l)
    try { window.localStorage.setItem(LANG_KEY, l) } catch { /* ignore */ }
  }

  const [shop, setShop] = useState<any>(null)
  const [barbers, setBarbers] = useState<any[]>([])
  const [services, setServices] = useState<any[]>([])
  const [staffLabel, setStaffLabel] = useState('Barber')
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // screen: home = choices (default + idle reset target),
  // signin = walk-in check-in wizard, appt = appointment check-in,
  // bookahead = book a future visit, queue = live waiting list,
  // details = shop info.
  const [screen, setScreen] = useState<Screen>('home')
  const [step, setStep] = useState<WizardStep>('details')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [requestedBarberId, setRequestedBarberId] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [code, setCode] = useState('')
  const [walkInId, setWalkInId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [countdown, setCountdown] = useState(SUCCESS_COUNTDOWN_S)
  // Identity proven by the OTP code just completed -- reused for book-ahead
  // so the customer never types a second code.
  const [verifiedName, setVerifiedName] = useState('')
  const [verifiedPhone, setVerifiedPhone] = useState('')
  // Ref guard: state updates are async, so two fast taps could both fire
  // before `submitting` flips. This kills the second one for real.
  const busyRef = useRef(false)

  // Appointment check-in state
  const [apptStep, setApptStep] = useState<ApptStep>('phone')
  const [apptPhone, setApptPhone] = useState('')
  const [apptResults, setApptResults] = useState<ApptRow[]>([])
  const [apptSearching, setApptSearching] = useState(false)
  const [apptSelected, setApptSelected] = useState<ApptRow | null>(null)
  const [apptCode, setApptCode] = useState('')
  const [apptDone, setApptDone] = useState<ApptRow | null>(null)

  // Book-ahead state
  const [baStep, setBaStep] = useState<BaStep>('service')
  const [baServiceId, setBaServiceId] = useState('')
  const [baBarberId, setBaBarberId] = useState('')
  const [baDate, setBaDate] = useState('')
  const [baTime, setBaTime] = useState('')
  const [baSlots, setBaSlots] = useState<BaStaffSlots[] | null>(null)
  const [baSlotsLoading, setBaSlotsLoading] = useState(false)
  const [baSubmitting, setBaSubmitting] = useState(false)
  const [baBooked, setBaBooked] = useState<{ serviceName: string; staffName: string; dayLabel: string; time: string } | null>(null)

  const [kioskConfig, setKioskConfig] = useState<KioskConfig | null>(null)
  const [queue, setQueue] = useState<QueueRow[]>([])

  // Re-read the saved language after mount: the useState initializer runs
  // during server prerender (no localStorage there), so this catches the
  // returning-visitor case on the client.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LANG_KEY)
      if (saved === 'es' || saved === 'en') setLang(saved)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    async function load() {
      const { data: shop } = await supabase
        .from('shops_public').select('*').eq('shop_code', shopCode).maybeSingle()
      if (!shop) { setNotFound(true); setLoading(false); return }
      setShop(shop)

      const { data: verticalMeta } = await supabase
        .from('vertical_config').select('staff_label').eq('vertical', shop.vertical).maybeSingle()
      if (verticalMeta?.staff_label) setStaffLabel(verticalMeta.staff_label)

      const { data: barbers } = await supabase
        .from('shop_barbers').select('*').eq('shop_id', shop.id).eq('active', true)
      setBarbers(barbers || [])

      const { data: services } = await supabase
        .from('services').select('*').eq('shop_id', shop.id).eq('active', true)
        .order('price', { ascending: true })
      setServices(services || [])

      const { data: kioskConfig } = await supabase
        .from('kiosk_config').select('*').eq('shop_id', shop.id).maybeSingle()
      setKioskConfig(kioskConfig as KioskConfig | null)

      setLoading(false)
    }
    load()
  }, [shopCode])

  // Live walk-in queue -- reads/subscribes to kiosk_queue_public, a
  // trigger-maintained projection of walk_ins with only initials and no
  // phone number, since this tablet is anonymous and walk_ins itself is
  // staff-only (see the migration for why).
  useEffect(() => {
    if (!shop) { setQueue([]); return }
    let cancelled = false

    async function loadQueue() {
      const { data } = await supabase
        .from('kiosk_queue_public')
        .select('*')
        .eq('shop_id', shop.id)
        .order('created_at', { ascending: true })
      if (!cancelled) setQueue((data || []) as QueueRow[])
    }
    loadQueue()

    const channel = supabase
      .channel(`kiosk-queue-${shop.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kiosk_queue_public', filter: `shop_id=eq.${shop.id}` }, loadQueue)
      .subscribe()

    return () => { cancelled = true; supabase.removeChannel(channel) }
  }, [shop])

  // The wizard only asks questions that have answers: barber is skipped
  // when there's a single barber, service is skipped when the shop has
  // no services menu.
  const wizardSteps: WizardStep[] = [
    'details',
    ...(barbers.length > 1 ? ['barber' as WizardStep] : []),
    ...(services.length > 0 ? ['service' as WizardStep] : []),
    'code',
  ]
  const stepIndex = step === 'success' ? wizardSteps.length : Math.max(0, wizardSteps.indexOf(step))

  function resetAll() {
    setStep('details')
    setName('')
    setPhone('')
    setRequestedBarberId('')
    setServiceId('')
    setCode('')
    setWalkInId(null)
    setError('')
    setSubmitting(false)
    setCountdown(SUCCESS_COUNTDOWN_S)
    busyRef.current = false
    setVerifiedName('')
    setVerifiedPhone('')
    setApptStep('phone')
    setApptPhone('')
    setApptResults([])
    setApptSelected(null)
    setApptCode('')
    setApptDone(null)
    setApptSearching(false)
    setBaStep('service')
    setBaServiceId('')
    setBaBarberId('')
    setBaDate('')
    setBaTime('')
    setBaSlots(null)
    setBaSubmitting(false)
    setBaBooked(null)
    setScreen('home')
  }

  function startSignIn() {
    resetAll()
    setScreen('signin')
  }

  function startApptCheckin() {
    resetAll()
    setScreen('appt')
  }

  function startBookAhead() {
    // Keep the OTP-verified identity; clear any previous booking attempt.
    setBaStep('service')
    setBaServiceId('')
    setBaBarberId('')
    setBaDate('')
    setBaTime('')
    setBaSlots(null)
    setBaSubmitting(false)
    setBaBooked(null)
    setError('')
    setScreen('bookahead')
  }

  function wizardBack() {
    setError('')
    if (step === 'details') {
      resetAll()
      return
    }
    const prev = wizardSteps[stepIndex - 1]
    setStep(prev || 'details')
  }

  function wizardNext() {
    setError('')
    const next = wizardSteps[stepIndex + 1]
    if (next) setStep(next)
  }

  function apptBack() {
    setError('')
    if (apptStep === 'phone') { resetAll(); return }
    if (apptStep === 'list') { setApptStep('phone'); return }
    if (apptStep === 'code') { setApptStep('list'); setApptCode(''); return }
  }

  function baBack() {
    setError('')
    if (baStep === 'service') { resetAll(); return }
    if (baStep === 'barber') setBaStep('service')
    else if (baStep === 'day') setBaStep('barber')
    else if (baStep === 'time') setBaStep('day')
    else if (baStep === 'confirm') setBaStep('time')
    else if (baStep === 'booked') resetAll()
  }

  // Idle watchdog: armed on every screen except home. Any tap or
  // keypress restarts the clock; on expiry the tablet wipes everything
  // and goes back home.
  useEffect(() => {
    if (screen === 'home') return
    let t: ReturnType<typeof setTimeout> | null = null
    const poke = () => {
      if (t) clearTimeout(t)
      t = setTimeout(resetAll, IDLE_RESET_MS)
    }
    poke()
    window.addEventListener('pointerdown', poke)
    window.addEventListener('keydown', poke)
    return () => {
      if (t) clearTimeout(t)
      window.removeEventListener('pointerdown', poke)
      window.removeEventListener('keydown', poke)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen])

  // Success countdown: after check-in the confirmation shows for a few
  // seconds, then the tablet is ready for the next person. Only runs
  // while a success screen is actually visible -- leaving for book-ahead
  // cancels it so it can't wipe a booking in progress.
  useEffect(() => {
    const showWalkinSuccess = screen === 'signin' && step === 'success'
    const showApptSuccess = screen === 'appt' && apptStep === 'done'
    if (!showWalkinSuccess && !showApptSuccess) return
    setCountdown(SUCCESS_COUNTDOWN_S)
    const t = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(t)
          resetAll()
          return 0
        }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, screen, apptStep])

  async function handleSendCode(e?: React.SyntheticEvent) {
    e?.preventDefault()
    if (!name || !phone || busyRef.current) return
    busyRef.current = true
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/kiosk/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopCode,
          name,
          phone,
          requestedBarberId: requestedBarberId || undefined,
          serviceId: serviceId || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Couldn't send the code")
      wizardNext()
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Try again.')
    } finally {
      setSubmitting(false)
      busyRef.current = false
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (!code || busyRef.current) return
    busyRef.current = true
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/kiosk/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopCode, phone, code }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "That code didn't match")
      setWalkInId(data.id || null)
      setVerifiedName(name.trim())
      setVerifiedPhone(phone)
      setStep('success')
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Try again.')
    } finally {
      setSubmitting(false)
      busyRef.current = false
    }
  }

  // ---- Appointment check-in ----
  async function handleApptLookup(e?: React.SyntheticEvent) {
    e?.preventDefault()
    if (!apptPhone.trim() || busyRef.current) return
    busyRef.current = true
    setApptSearching(true)
    setError('')
    try {
      const res = await fetch('/api/kiosk/appointments/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopCode, phone: apptPhone, today: todayStr() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Lookup failed')
      setApptResults((data.appointments || []) as ApptRow[])
      setApptStep('list')
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Try again.')
    } finally {
      setApptSearching(false)
      busyRef.current = false
    }
  }

  async function handleApptSendCode(appt: ApptRow) {
    if (busyRef.current) return
    busyRef.current = true
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/kiosk/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopCode, name: appt.clientName, phone: apptPhone }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Couldn't send the code")
      setApptSelected(appt)
      setApptStep('code')
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Try again.')
    } finally {
      setSubmitting(false)
      busyRef.current = false
    }
  }

  async function handleApptVerify(e: React.FormEvent) {
    e.preventDefault()
    if (!apptCode || !apptSelected || busyRef.current) return
    busyRef.current = true
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/kiosk/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopCode,
          phone: apptPhone,
          code: apptCode,
          checkinAppointmentId: apptSelected.id,
          today: todayStr(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "That code didn't match")
      if (!data.appointmentId) throw new Error('Could not check in right now')
      setVerifiedName(apptSelected.clientName)
      setVerifiedPhone(apptPhone)
      setApptDone(apptSelected)
      setApptStep('done')
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Try again.')
    } finally {
      setSubmitting(false)
      busyRef.current = false
    }
  }

  // ---- Book ahead ----
  // Next 7 days on the tablet's clock, with the shop's closed days disabled.
  const hours: { day: string; open: boolean; from: string; to: string }[] =
    Array.isArray(shop?.hours) ? shop.hours : []
  const baDays = (() => {
    const days: { date: string; label: string; sub: string; closed: boolean }[] = []
    const base = new Date()
    for (let i = 0; i < 7; i++) {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i)
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const dayName = DAY_ORDER[d.getDay()]
      const h = hours.find(x => x.day === dayName)
      const label = i === 0 ? t('today') : i === 1 ? t('tomorrow') : KIOSK_DAY_SHORT[lang][d.getDay()]
      days.push({
        date,
        label,
        sub: `${d.getMonth() + 1}/${d.getDate()}`,
        closed: hours.length > 0 && (!h || !h.open),
      })
    }
    return days
  })()

  useEffect(() => {
    if (screen !== 'bookahead' || baStep !== 'time' || !baServiceId || !baDate) return
    let cancelled = false
    setBaSlotsLoading(true)
    setBaSlots(null)
    fetch(`/api/kiosk/open-slots?shopCode=${shopCode}&date=${baDate}&serviceId=${baServiceId}`)
      .then(r => r.json())
      .then(d => {
        if (!cancelled) {
          setBaSlots((d.staff || []) as BaStaffSlots[])
          setBaSlotsLoading(false)
        }
      })
      .catch(() => { if (!cancelled) setBaSlotsLoading(false) })
    return () => { cancelled = true }
  }, [screen, baStep, baDate, baServiceId, shopCode])

  function baDisplaySlots(): string[] {
    const staff = baSlots || []
    let slots: string[]
    if (baBarberId) {
      slots = staff.find(s => s.barberId === baBarberId)?.slots || []
    } else {
      const merged = new Set<string>()
      for (const s of staff) for (const slot of s.slots) merged.add(slot)
      slots = [...merged].sort((a, b) => timeStrToMinutes(a) - timeStrToMinutes(b))
    }
    // Don't offer times that already passed today; the create route also
    // enforces the shop's minimum-advance rule server-side.
    if (baDate === todayStr()) {
      const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
      slots = slots.filter(s => timeStrToMinutes(s) > nowMin)
    }
    return slots
  }

  function baBarberName(id: string): string {
    const b = barbers.find(x => x.barber_id === id)
    return b?.barber_name || b?.alias || 'Staff'
  }

  async function handleBookAhead() {
    if (!baServiceId || !baDate || !baTime || !verifiedName || !verifiedPhone || busyRef.current) return
    busyRef.current = true
    setBaSubmitting(true)
    setError('')
    try {
      const mins = timeStrToMinutes(baTime)
      const time24 = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}:00`
      const res = await fetch('/api/book/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopCode,
          serviceId: baServiceId,
          barberId: baBarberId || null,
          date: baDate,
          time: time24,
          clientName: verifiedName,
          clientPhone: verifiedPhone,
          notes: 'Booked from the in-shop kiosk',
          idempotencyKey: crypto.randomUUID(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Booking failed. Please try again.')
      const day = baDays.find(d => d.date === baDate)
      setBaBooked({
        serviceName: services.find(s => s.id === baServiceId)?.name || '',
        staffName: data.barberName || (baBarberId ? baBarberName(baBarberId) : t('noPref')),
        dayLabel: day ? `${day.label} ${day.sub}` : baDate,
        time: baTime,
      })
      setBaStep('booked')
    } catch (err: any) {
      setError(err.message || 'Booking failed. Please try again.')
    } finally {
      setBaSubmitting(false)
      busyRef.current = false
    }
  }

  if (loading) return (
    <div className="h-[100dvh] bg-warm-50 flex items-center justify-center">
      <div className="w-10 h-10 rounded-full border-4 border-od-green border-t-transparent animate-spin" />
    </div>
  )

  if (notFound) return (
    <div className="h-[100dvh] bg-warm-50 flex items-center justify-center p-8">
      <p className="text-charcoal-500 text-xl text-center">{t('notFound')}</p>
    </div>
  )

  const theme = resolveKioskTheme(kioskConfig)
  const kioskLogo = kioskConfig?.logo_url || shop.logo_url
  const avgServiceMinutes = services.length > 0
    ? Math.round(services.reduce((sum, s) => sum + (s.duration_minutes || 0), 0) / services.length)
    : 20
  const waitingCount = queue.length
  const firstName = (verifiedName || name).trim().split(' ')[0] || 'there'
  const myQueueIndex = walkInId ? queue.findIndex(q => q.id === walkInId) : -1
  const myPosition = myQueueIndex >= 0 ? myQueueIndex + 1 : queue.length > 0 ? queue.length : null
  const staffLabelT = kioskStaffLabel(staffLabel, lang)

  const logo = (size: string) => kioskLogo ? (
    <img src={kioskLogo} alt={shop.name} className={`${size} rounded-2xl object-cover flex-shrink-0`} />
  ) : (
    <div className={`${size} rounded-2xl flex items-center justify-center font-serif text-4xl font-bold flex-shrink-0`}
      style={{ background: theme.primary + '20', color: theme.primary, border: `3px solid ${theme.primary}40` }}>
      {shop.name[0]}
    </div>
  )

  const backBtn = (onBack: () => void, label?: string) => (
    <button type="button" onClick={onBack}
      className="flex-shrink-0 rounded-xl border-2 border-warm-300 text-charcoal-700 text-lg font-bold px-6 min-h-[56px] active:scale-[0.98] transition-transform">
      ← {label || t('back')}
    </button>
  )

  // Big tappable chip grid -- far easier to hit with a thumb on a shared
  // tablet than a dropdown.
  const chipGrid = (
    options: { value: string; label: string; sub?: string; disabled?: boolean }[],
    selected: string,
    onPick: (v: string) => void,
  ) => (
    <div className="grid grid-cols-2 gap-3">
      {options.map(o => {
        const active = selected === o.value
        return (
          <button key={o.value || 'none'} type="button" onClick={() => onPick(o.value)}
            aria-pressed={active} disabled={o.disabled}
            className="min-h-[68px] px-5 py-3 rounded-xl border-2 text-left transition-all active:scale-[0.98] disabled:opacity-40"
            style={active
              ? { background: theme.primary, borderColor: theme.primary, color: '#fff' }
              : { background: 'var(--color-card)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}>
            <div className="text-lg font-semibold leading-tight">{o.label}</div>
            {o.sub && <div className="text-base opacity-70 mt-0.5">{o.sub}</div>}
          </button>
        )
      })}
    </div>
  )

  const inputCls =
    'w-full bg-warm-200 border-2 border-warm-300 rounded-xl px-6 text-charcoal-900 text-xl outline-none focus:border-od-green transition-colors min-h-[68px]'

  const errorBox = error ? (
    <p className="text-red-400 text-lg bg-red-950 border border-red-900 rounded-xl p-4 mb-6">{error}</p>
  ) : null

  const bookNextBtn = services.length > 0 ? (
    <button type="button" onClick={startBookAhead}
      className="w-full rounded-xl border-2 text-xl font-bold min-h-[68px] mb-3 active:scale-[0.99] transition-transform"
      style={{ borderColor: theme.primary, color: theme.primary }}>
      {t('bookNext')}
    </button>
  ) : null

  const queueRows = (compact = false) => (
    queue.length === 0 ? (
      <p className="text-charcoal-500 text-xl">{t('queueEmpty')}</p>
    ) : (
      <div className={compact ? 'space-y-2' : 'space-y-3'}>
        {queue.map((q, i) => (
          <div key={q.id} className={`flex items-center gap-4 bg-warm-50 border border-warm-200 rounded-xl ${compact ? 'px-4 py-3' : 'px-5 py-4'}`}>
            <div className={`${compact ? 'w-10 h-10 text-base' : 'w-12 h-12 text-lg'} rounded-full flex items-center justify-center font-bold text-white flex-shrink-0`}
              style={{ background: theme.accent }}>
              {q.display_label[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-lg font-semibold text-charcoal-900 truncate">{q.display_label}</div>
              <div className="text-base text-charcoal-500">
                {q.status === 'called' ? t('queueCalled') : t('queuePos', { i: i + 1, m: i * avgServiceMinutes })}
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  )

  // ---- Home: one screen, four big choices + language ----
  // The language toggle lives at the bottom: the top of the screen can sit
  // under the iOS wrapper's URL bar, which would cover it and eat taps.
  const homeScreen = (
    <div className="h-full overflow-y-auto">
    <div className="min-h-full flex flex-col items-center justify-center max-w-2xl mx-auto w-full gap-5 py-8">
      {logo('w-20 h-20')}
      <div className="text-center">
        <h1 className="font-serif text-4xl md:text-5xl" style={{ color: theme.primary }}>{shop.name}</h1>
        {shop.tagline && <p className="text-charcoal-500 text-xl mt-2">{shop.tagline}</p>}
      </div>
      {waitingCount > 0 && (
        <p className="text-charcoal-600 text-xl font-semibold">
          {(waitingCount === 1 ? t('homeWaitingOne') : t('homeWaitingMany', { n: waitingCount })) + ' ' + t('homeWaitEta', { m: waitingCount * avgServiceMinutes })}
        </p>
      )}
      <div className="w-full grid grid-cols-1 gap-4 mt-2">
        {[
          { key: 'signin', label: t('homeSignIn'), sub: t('homeSignInSub'), icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-10 h-10"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.5-6.5 8-6.5s8 2.5 8 6.5" strokeLinecap="round" /></svg>
          ), onClick: startSignIn },
          { key: 'appt', label: t('homeAppt'), sub: t('homeApptSub'), icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-10 h-10"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" strokeLinecap="round" /><path d="M9 15l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          ), onClick: startApptCheckin },
          { key: 'queue', label: t('homeQueue'), sub: waitingCount > 0 ? t('homeQueueCount', { n: waitingCount }) : t('homeQueueSub'), icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-10 h-10"><path d="M8 6h13M8 12h13M8 18h13" strokeLinecap="round" /><circle cx="4" cy="6" r="1.2" fill="currentColor" /><circle cx="4" cy="12" r="1.2" fill="currentColor" /><circle cx="4" cy="18" r="1.2" fill="currentColor" /></svg>
          ), onClick: () => setScreen('queue') },
          { key: 'details', label: t('homeDetails'), sub: t('homeDetailsSub'), icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-10 h-10"><circle cx="12" cy="12" r="9" /><path d="M12 11v5" strokeLinecap="round" /><circle cx="12" cy="8" r="1.2" fill="currentColor" /></svg>
          ), onClick: () => setScreen('details') },
        ].map(c => (
          <button key={c.key} type="button" onClick={c.onClick}
            className="w-full flex items-center gap-5 bg-warm-100 border-2 border-warm-200 rounded-2xl px-6 min-h-[96px] text-left transition-all active:scale-[0.98]"
            style={{ color: theme.primary }}>
            <span className="flex-shrink-0">{c.icon}</span>
            <span>
              <span className="block text-2xl font-bold text-charcoal-900">{c.label}</span>
              <span className="block text-lg text-charcoal-500">{c.sub}</span>
            </span>
            <span className="ml-auto text-3xl text-charcoal-300">›</span>
          </button>
        ))}
      </div>
      <p className="text-charcoal-400 text-base">{t('homeIdleNote')}</p>
      <div className="flex rounded-xl border-2 border-warm-300 overflow-hidden w-full max-w-xs mt-2" role="group" aria-label="Language / Idioma">
        {(['es', 'en'] as KioskLang[]).map(l => {
          const active = lang === l
          return (
            <button key={l} type="button" onClick={() => pickLang(l)} aria-pressed={active}
              className="flex-1 min-h-[56px] text-xl font-bold transition-colors active:scale-[0.98]"
              style={active ? { background: theme.primary, color: '#fff' } : { color: theme.primary }}>
              {l === 'es' ? 'Español' : 'English'}
            </button>
          )
        })}
      </div>
    </div>
    </div>
  )

  // ---- Wizard screens: one question per screen ----
  const wizardShell = (title: string, sub: React.ReactNode, body: React.ReactNode, cta?: React.ReactNode) => (
    <div className="h-full flex flex-col max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between gap-4 mb-3">
        {backBtn(wizardBack)}
        <div className="text-right">
          <div className="text-base font-semibold text-charcoal-500">{t('stepOf', { a: stepIndex + 1, b: wizardSteps.length })}</div>
        </div>
      </div>
      <div className="h-2 rounded-full bg-warm-200 mb-6 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-300" style={{ width: `${((stepIndex + 1) / wizardSteps.length) * 100}%`, background: theme.primary }} />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
        <div className="my-auto">
          <h2 className="font-serif text-3xl md:text-4xl mb-2" style={{ color: theme.primary }}>{title}</h2>
          <p className="text-charcoal-500 text-xl mb-6">{sub}</p>
          {errorBox}
          {body}
        </div>
      </div>
      {cta && <div className="pt-4">{cta}</div>}
    </div>
  )

  const wizardCta = (label: string, disabled: boolean, onClick?: () => void, submittingLabel?: string) => (
    <button type="button" onClick={onClick} disabled={disabled}
      className="w-full text-white font-bold rounded-xl text-2xl min-h-[76px] disabled:opacity-60 active:scale-[0.99] transition-transform"
      style={{ background: theme.primary }}>
      {submitting && submittingLabel ? submittingLabel : label}
    </button>
  )

  const signinScreens: Record<Exclude<WizardStep, 'success'>, React.ReactNode> = {
    details: wizardShell(
      t('wizDetailsTitle'),
      t('wizDetailsSub'),
      <div className="space-y-5">
        <div>
          <label className="block text-lg font-semibold text-charcoal-700 mb-2">{t('nameLabel')}</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            autoComplete="off" placeholder={t('namePh')} className={inputCls} />
        </div>
        <div>
          <label className="block text-lg font-semibold text-charcoal-700 mb-2">{t('phoneLabel')}</label>
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
            autoComplete="off" placeholder="(555) 123-4567" className={inputCls} />
          <p className="text-base text-charcoal-400 mt-2">{t('phoneNote')}</p>
        </div>
      </div>,
      wizardCta(t('sendCode'), submitting || !name.trim() || !phone.trim(), () => handleSendCode(), t('sending')),
    ),
    barber: wizardShell(
      t('wizBarberTitle'),
      t('wizBarberSub', { staff: staffLabelT }),
      chipGrid(
        [{ value: '', label: t('noPref'), sub: t('firstFree') },
         ...barbers.map(b => ({ value: b.barber_id, label: b.barber_name || b.alias }))],
        requestedBarberId, setRequestedBarberId,
      ),
      wizardCta(t('continue'), submitting, wizardNext),
    ),
    service: wizardShell(
      t('wizServiceTitle'),
      t('wizServiceSub'),
      chipGrid(
        [{ value: '', label: t('notSure') },
         ...services.map(s => ({ value: s.id, label: s.name, sub: s.price != null ? `$${s.price}` : undefined }))],
        serviceId, setServiceId,
      ),
      wizardCta(t('continue'), submitting, wizardNext),
    ),
    code: wizardShell(
      t('codeTitle'),
      <>{t('codeSub', { phone })}</>,
      <div className="space-y-4">
        <input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={code}
          onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
          autoComplete="one-time-code" placeholder="••••••"
          className="w-full bg-warm-200 border-2 border-warm-300 rounded-xl px-6 text-charcoal-900 text-4xl tracking-[0.4em] text-center outline-none focus:border-od-green transition-colors min-h-[88px]" />
        <button type="button" onClick={() => handleSendCode()} disabled={submitting}
          className="w-full rounded-xl border-2 border-warm-300 text-lg font-semibold text-charcoal-700 min-h-[60px] disabled:opacity-60 active:scale-[0.99] transition-transform">
          {t('resend')}
        </button>
      </div>,
      wizardCta(t('checkMeIn'), submitting || code.length !== 6, () => handleVerify({ preventDefault() {} } as React.FormEvent), t('checkingIn')),
    ),
  }

  const successScreen = (
    <div className="h-full flex flex-col items-center justify-center max-w-2xl mx-auto w-full text-center">
      <div className="w-24 h-24 rounded-full flex items-center justify-center mb-6"
        style={{ background: theme.primary + '20' }}>
        <svg viewBox="0 0 24 24" fill="none" stroke={theme.primary} strokeWidth="2.5" className="w-12 h-12">
          <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h2 className="font-serif text-4xl md:text-5xl mb-3" style={{ color: theme.primary }}>
        {t('successTitle', { name: firstName })}
      </h2>
      <p className="text-charcoal-600 text-2xl mb-2">{t('successSub')}</p>
      {myPosition != null && (
        <p className="text-charcoal-500 text-xl">{t('successPos', { n: myPosition, m: (myPosition - 1) * avgServiceMinutes })}</p>
      )}
      <div className="w-full max-w-md mt-10">
        <div className="h-2 rounded-full bg-warm-200 overflow-hidden mb-4">
          <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${(countdown / SUCCESS_COUNTDOWN_S) * 100}%`, background: theme.accent }} />
        </div>
        {bookNextBtn}
        <button type="button" onClick={resetAll}
          className="w-full text-white font-bold rounded-xl text-2xl min-h-[76px] active:scale-[0.99] transition-transform"
          style={{ background: theme.primary }}>
          {t('done')}
        </button>
      </div>
    </div>
  )

  // ---- Appointment check-in ----
  const apptShell = (title: string, sub: string, body: React.ReactNode, cta?: React.ReactNode) => (
    <div className="h-full flex flex-col max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between gap-4 mb-6">
        {backBtn(apptBack)}
        <h2 className="font-serif text-3xl" style={{ color: theme.primary }}>{title}</h2>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
        <div className="my-auto">
          <p className="text-charcoal-500 text-xl mb-6">{sub}</p>
          {errorBox}
          {body}
        </div>
      </div>
      {cta && <div className="pt-4">{cta}</div>}
    </div>
  )

  const apptPhoneScreen = apptShell(
    t('apptTitle'),
    t('apptSub'),
    <div>
      <label className="block text-lg font-semibold text-charcoal-700 mb-2">{t('phoneLabel')}</label>
      <input type="tel" value={apptPhone} onChange={e => setApptPhone(e.target.value)}
        autoComplete="off" placeholder="(555) 123-4567" className={inputCls} />
    </div>,
    wizardCta(t('apptFind'), apptSearching || !apptPhone.trim(), () => handleApptLookup(), t('apptSearching')),
  )

  const apptListScreen = apptShell(
    t('apptTitle'),
    apptResults.length === 0 ? t('apptNone') : t('apptSub'),
    apptResults.length === 0 ? (
      <button type="button" onClick={() => { setError(''); setApptStep('phone') }}
        className="w-full rounded-xl border-2 border-warm-300 text-lg font-semibold text-charcoal-700 min-h-[60px] active:scale-[0.99] transition-transform">
        {t('apptDifferent')}
      </button>
    ) : (
      <div className="space-y-3">
        {apptResults.map(a => (
          <div key={a.id} className="flex items-center gap-4 bg-warm-100 border-2 border-warm-200 rounded-2xl px-5 py-4">
            <div className="flex-1 min-w-0">
              <div className="text-2xl font-bold text-charcoal-900">{a.time}</div>
              <div className="text-lg text-charcoal-500 truncate">
                {[a.serviceName, a.staffName].filter(Boolean).join(' · ') || a.clientName}
              </div>
            </div>
            <button type="button" onClick={() => handleApptSendCode(a)} disabled={submitting}
              className="flex-shrink-0 text-white font-bold rounded-xl text-xl px-8 min-h-[68px] disabled:opacity-60 active:scale-[0.98] transition-transform"
              style={{ background: theme.primary }}>
              {t('apptImHere')}
            </button>
          </div>
        ))}
        <button type="button" onClick={() => { setError(''); setApptStep('phone') }}
          className="w-full text-center text-lg text-charcoal-500 underline underline-offset-4 py-3">
          {t('apptDifferent')}
        </button>
      </div>
    ),
  )

  const apptCodeScreen = apptShell(
    t('codeTitle'),
    t('codeSub', { phone: apptPhone }),
    <div className="space-y-4">
      <input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={apptCode}
        onChange={e => setApptCode(e.target.value.replace(/\D/g, ''))}
        autoComplete="one-time-code" placeholder="••••••"
        className="w-full bg-warm-200 border-2 border-warm-300 rounded-xl px-6 text-charcoal-900 text-4xl tracking-[0.4em] text-center outline-none focus:border-od-green transition-colors min-h-[88px]" />
      {apptSelected && (
        <button type="button" onClick={() => handleApptSendCode(apptSelected)} disabled={submitting}
          className="w-full rounded-xl border-2 border-warm-300 text-lg font-semibold text-charcoal-700 min-h-[60px] disabled:opacity-60 active:scale-[0.99] transition-transform">
          {t('resend')}
        </button>
      )}
    </div>,
    wizardCta(t('checkMeIn'), submitting || apptCode.length !== 6, () => handleApptVerify({ preventDefault() {} } as React.FormEvent), t('checkingIn')),
  )

  const apptDoneScreen = apptDone ? (
    <div className="h-full flex flex-col items-center justify-center max-w-2xl mx-auto w-full text-center">
      <div className="w-24 h-24 rounded-full flex items-center justify-center mb-6"
        style={{ background: theme.primary + '20' }}>
        <svg viewBox="0 0 24 24" fill="none" stroke={theme.primary} strokeWidth="2.5" className="w-12 h-12">
          <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h2 className="font-serif text-4xl md:text-5xl mb-3" style={{ color: theme.primary }}>
        {t('apptSuccessTitle', { name: firstName })}
      </h2>
      <p className="text-charcoal-600 text-2xl mb-2">
        {(() => {
          const who = [apptDone.serviceName, apptDone.staffName].filter(Boolean)
            .join(lang === 'es' ? ' con ' : ' with ')
          if (!who) return t('apptSuccessSubTime', { time: apptDone.time })
          return lang === 'es' ? `${who} a las ${apptDone.time}` : `${who} at ${apptDone.time}`
        })()}
      </p>
      {waitingCount > 0 && (
        <p className="text-charcoal-500 text-xl">
          {(waitingCount === 1 ? t('homeWaitingOne') : t('homeWaitingMany', { n: waitingCount })) + ' ' + t('homeWaitEta', { m: waitingCount * avgServiceMinutes })}
        </p>
      )}
      <div className="w-full max-w-md mt-10">
        <div className="h-2 rounded-full bg-warm-200 overflow-hidden mb-4">
          <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${(countdown / SUCCESS_COUNTDOWN_S) * 100}%`, background: theme.accent }} />
        </div>
        {bookNextBtn}
        <button type="button" onClick={resetAll}
          className="w-full text-white font-bold rounded-xl text-2xl min-h-[76px] active:scale-[0.99] transition-transform"
          style={{ background: theme.primary }}>
          {t('done')}
        </button>
      </div>
    </div>
  ) : null

  const apptScreen = (
    <>
      {apptStep === 'phone' && apptPhoneScreen}
      {apptStep === 'list' && apptListScreen}
      {apptStep === 'code' && apptCodeScreen}
      {apptStep === 'done' && apptDoneScreen}
    </>
  )

  // ---- Book ahead ----
  const baShell = (title: string, body: React.ReactNode, cta?: React.ReactNode) => (
    <div className="h-full flex flex-col max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between gap-4 mb-6">
        {backBtn(baBack)}
        <h2 className="font-serif text-3xl" style={{ color: theme.primary }}>{title}</h2>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
        <div className="my-auto">
          {errorBox}
          {body}
        </div>
      </div>
      {cta && <div className="pt-4">{cta}</div>}
    </div>
  )

  const baServiceScreen = baShell(
    t('baServiceTitle'),
    chipGrid(
      services.map(s => ({ value: s.id, label: s.name, sub: s.price != null ? `$${s.price}` : undefined })),
      baServiceId, (v) => { setBaServiceId(v); setBaStep('barber') },
    ),
  )

  const baBarberScreen = baShell(
    t('wizBarberTitle'),
    chipGrid(
      [{ value: '', label: t('noPref'), sub: t('firstFree') },
       ...barbers.map(b => ({ value: b.barber_id, label: b.barber_name || b.alias }))],
      baBarberId, (v) => { setBaBarberId(v); setBaStep('day') },
    ),
  )

  const baDayScreen = baShell(
    t('baDayTitle'),
    chipGrid(
      baDays.map(d => ({ value: d.date, label: d.label, sub: d.sub, disabled: d.closed })),
      baDate, (v) => { setBaDate(v); setBaTime(''); setBaStep('time') },
    ),
  )

  const baTimeScreen = baShell(
    t('baTimeTitle'),
    baSlotsLoading ? (
      <div className="flex items-center justify-center py-12">
        <div className="w-10 h-10 rounded-full border-4 border-od-green border-t-transparent animate-spin" />
      </div>
    ) : baDisplaySlots().length === 0 ? (
      <p className="text-charcoal-500 text-xl text-center py-8">{t('baNoTimes')}</p>
    ) : (
      chipGrid(
        baDisplaySlots().map(s => ({ value: s, label: s })),
        baTime, (v) => { setBaTime(v); setBaStep('confirm') },
      )
    ),
  )

  const baConfirmScreen = (() => {
    const svc = services.find(s => s.id === baServiceId)
    const day = baDays.find(d => d.date === baDate)
    const rows: [string, string][] = [
      [t('baService'), svc?.name || ''],
      [t('baWith'), baBarberId ? baBarberName(baBarberId) : t('noPref')],
      [t('baWhen'), `${day ? `${day.label} ${day.sub}` : baDate} · ${baTime}`],
    ]
    return baShell(
      t('baConfirmTitle'),
      <div className="bg-warm-100 border-2 border-warm-200 rounded-2xl p-6 space-y-4">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-4">
            <span className="text-lg text-charcoal-500">{label}</span>
            <span className="text-xl font-bold text-charcoal-900 text-right">{value}</span>
          </div>
        ))}
      </div>,
      wizardCta(t('baBook'), baSubmitting, handleBookAhead, t('baBooking')),
    )
  })()

  const baBookedScreen = baBooked ? baShell(
    t('baDoneTitle'),
    <div className="text-center py-6">
      <div className="w-24 h-24 rounded-full flex items-center justify-center mb-6 mx-auto"
        style={{ background: theme.primary + '20' }}>
        <svg viewBox="0 0 24 24" fill="none" stroke={theme.primary} strokeWidth="2.5" className="w-12 h-12">
          <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <p className="text-charcoal-600 text-2xl mb-2">
        {t('baDoneSub', { service: baBooked.serviceName, staff: baBooked.staffName, day: baBooked.dayLabel, time: baBooked.time })}
      </p>
      <p className="text-charcoal-500 text-xl">{t('baReminder')}</p>
    </div>,
    wizardCta(t('done'), false, resetAll),
  ) : null

  const bookAheadScreen = (
    <>
      {baStep === 'service' && baServiceScreen}
      {baStep === 'barber' && baBarberScreen}
      {baStep === 'day' && baDayScreen}
      {baStep === 'time' && baTimeScreen}
      {baStep === 'confirm' && baConfirmScreen}
      {baStep === 'booked' && baBookedScreen}
    </>
  )

  // ---- Queue: full-page live waiting list ----
  const queueScreen = (
    <div className="h-full flex flex-col max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between gap-4 mb-5">
        {backBtn(() => setScreen('home'))}
        <h2 className="font-serif text-3xl" style={{ color: theme.primary }}>{t('queueTitle')}</h2>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto pr-1 pb-2">
        {queueRows(true)}
      </div>
      <div className="pt-4">
        <button type="button" onClick={startSignIn}
          className="w-full text-white font-bold rounded-xl text-2xl min-h-[76px] active:scale-[0.99] transition-transform"
          style={{ background: theme.primary }}>
          {t('joinList')}
        </button>
      </div>
    </div>
  )

  // ---- Details: shop info ----
  const todayName = DAY_ORDER[new Date().getDay()]
  const addressLine = [shop.address, shop.city].filter(Boolean).join(', ')

  const detailsScreen = (
    <div className="h-full flex flex-col max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between gap-4 mb-5">
        {backBtn(() => setScreen('home'))}
        <h2 className="font-serif text-3xl" style={{ color: theme.primary }}>{t('detailsTitle')}</h2>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto pr-1 pb-2 space-y-4">
        <div className="flex items-center gap-4 bg-warm-100 border border-warm-200 rounded-2xl p-5">
          {logo('w-16 h-16')}
          <div>
            <div className="text-2xl font-bold text-charcoal-900">{shop.name}</div>
            {shop.tagline && <div className="text-lg text-charcoal-500">{shop.tagline}</div>}
          </div>
        </div>

        {(addressLine || shop.phone) && (
          <div className="bg-warm-100 border border-warm-200 rounded-2xl p-5 space-y-2">
            {addressLine && (
              <div className="flex gap-3 text-lg text-charcoal-700">
                <span className="flex-shrink-0">📍</span><span>{addressLine}</span>
              </div>
            )}
            {shop.phone && (
              <div className="flex gap-3 text-lg text-charcoal-700">
                <span className="flex-shrink-0">📞</span><span>{shop.phone}</span>
              </div>
            )}
          </div>
        )}

        {hours.length > 0 && (
          <div className="bg-warm-100 border border-warm-200 rounded-2xl p-5">
            <div className="text-lg font-bold text-charcoal-900 mb-3">{t('hoursTitle')}</div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              {hours.map(h => {
                const isToday = h.day === todayName
                const dayIdx = DAY_ORDER.indexOf(h.day)
                return (
                  <div key={h.day} className={`flex items-center justify-between text-lg ${isToday ? 'font-bold' : ''}`}
                    style={isToday ? { color: theme.primary } : undefined}>
                    <span className={isToday ? '' : 'text-charcoal-600'}>
                      {dayIdx >= 0 ? KIOSK_DAY_SHORT[lang][dayIdx] : h.day.slice(0, 3)}
                    </span>
                    <span className={isToday ? '' : 'text-charcoal-500'}>
                      {h.open ? `${h.from} – ${h.to}` : t('closed')}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {services.length > 0 && (
          <div className="bg-warm-100 border border-warm-200 rounded-2xl p-5">
            <div className="text-lg font-bold text-charcoal-900 mb-3">{t('servicesTitle')}</div>
            <div className="space-y-2">
              {services.map(s => (
                <div key={s.id} className="flex items-center justify-between text-lg">
                  <span className="text-charcoal-700">{s.name}</span>
                  {s.price != null && <span className="font-semibold text-charcoal-900">${s.price}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {shop.bio && (
          <div className="bg-warm-100 border border-warm-200 rounded-2xl p-5">
            <p className="text-lg text-charcoal-600">{shop.bio}</p>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="h-[100dvh] overflow-hidden bg-warm-50 p-4 md:p-6">
      <StepPanel key={screen + step + apptStep + baStep} className="h-full max-w-6xl mx-auto">
        {screen === 'home' && homeScreen}
        {screen === 'signin' && (step === 'success' ? successScreen : signinScreens[step])}
        {screen === 'appt' && apptScreen}
        {screen === 'bookahead' && bookAheadScreen}
        {screen === 'queue' && queueScreen}
        {screen === 'details' && detailsScreen}
      </StepPanel>
    </div>
  )
}
