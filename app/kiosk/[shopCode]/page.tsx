'use client'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useParams } from 'next/navigation'
import { resolveKioskTheme, type KioskConfig } from '@/lib/kioskConfig'
import { StepPanel } from '@/components/motion'

type QueueRow = { id: string; display_label: string; status: string; created_at: string }
type Screen = 'home' | 'signin' | 'queue' | 'details'
type WizardStep = 'details' | 'barber' | 'service' | 'code' | 'success'

// A shared counter tablet must never sit on one customer's half-finished
// check-in: after this long with no taps, everything clears back to the
// home screen (which also protects the previous customer's name/phone).
const IDLE_RESET_MS = 75_000
const SUCCESS_COUNTDOWN_S = 10

const DAY_ORDER = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function KioskCheckIn() {
  const params = useParams()
  const shopCode = (params.shopCode as string)?.toUpperCase()
  const supabase = createClient()

  const [shop, setShop] = useState<any>(null)
  const [barbers, setBarbers] = useState<any[]>([])
  const [services, setServices] = useState<any[]>([])
  const [staffLabel, setStaffLabel] = useState('Barber')
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // screen: home = three big choices (default + idle reset target),
  // signin = step-by-step check-in wizard, queue = live waiting list,
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
  // Ref guard: state updates are async, so two fast taps could both fire
  // before `submitting` flips. This kills the second one for real.
  const busyRef = useRef(false)

  const [kioskConfig, setKioskConfig] = useState<KioskConfig | null>(null)
  const [queue, setQueue] = useState<QueueRow[]>([])

  useEffect(() => {
    async function load() {
      const { data: shop } = await supabase
        .from('shops').select('*').eq('shop_code', shopCode).maybeSingle()
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
    setScreen('home')
  }

  function startSignIn() {
    resetAll()
    setScreen('signin')
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
  // seconds, then the tablet is ready for the next person.
  useEffect(() => {
    if (step !== 'success') return
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
  }, [step])

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
      setStep('success')
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Try again.')
    } finally {
      setSubmitting(false)
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
      <p className="text-charcoal-500 text-xl text-center">We couldn't find that shop. Ask us at the counter.</p>
    </div>
  )

  const theme = resolveKioskTheme(kioskConfig)
  const kioskLogo = kioskConfig?.logo_url || shop.logo_url
  const avgServiceMinutes = services.length > 0
    ? Math.round(services.reduce((sum, s) => sum + (s.duration_minutes || 0), 0) / services.length)
    : 20
  const waitingCount = queue.length
  const waitEstimate = waitingCount > 0 ? ` — about ${waitingCount * avgServiceMinutes} min` : ''
  const firstName = name.trim().split(' ')[0] || 'there'
  const myQueueIndex = walkInId ? queue.findIndex(q => q.id === walkInId) : -1
  const myPosition = myQueueIndex >= 0 ? myQueueIndex + 1 : queue.length > 0 ? queue.length : null

  const logo = (size: string) => kioskLogo ? (
    <img src={kioskLogo} alt={shop.name} className={`${size} rounded-2xl object-cover flex-shrink-0`} />
  ) : (
    <div className={`${size} rounded-2xl flex items-center justify-center font-serif text-4xl font-bold flex-shrink-0`}
      style={{ background: theme.primary + '20', color: theme.primary, border: `3px solid ${theme.primary}40` }}>
      {shop.name[0]}
    </div>
  )

  const backBtn = (onBack: () => void, label = 'Back') => (
    <button type="button" onClick={onBack}
      className="flex-shrink-0 rounded-xl border-2 border-warm-300 text-charcoal-700 text-lg font-bold px-6 min-h-[56px] active:scale-[0.98] transition-transform">
      ← {label}
    </button>
  )

  // Big tappable chip grid -- far easier to hit with a thumb on a shared
  // tablet than a dropdown.
  const chipGrid = (
    options: { value: string; label: string; sub?: string }[],
    selected: string,
    onPick: (v: string) => void,
  ) => (
    <div className="grid grid-cols-2 gap-3">
      {options.map(o => {
        const active = selected === o.value
        return (
          <button key={o.value || 'none'} type="button" onClick={() => onPick(o.value)}
            aria-pressed={active}
            className="min-h-[68px] px-5 py-3 rounded-xl border-2 text-left transition-all active:scale-[0.98]"
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

  const queueRows = (compact = false) => (
    queue.length === 0 ? (
      <p className="text-charcoal-500 text-xl">No one's waiting — walk right up.</p>
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
                {q.status === 'called' ? 'Being called now' : `#${i + 1} in line — about ${i * avgServiceMinutes} min`}
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  )

  // ---- Home: one screen, three big choices ----
  const homeScreen = (
    <div className="h-full flex flex-col items-center justify-center max-w-2xl mx-auto w-full gap-5">
      {logo('w-20 h-20')}
      <div className="text-center">
        <h1 className="font-serif text-4xl md:text-5xl" style={{ color: theme.primary }}>{shop.name}</h1>
        {shop.tagline && <p className="text-charcoal-500 text-xl mt-2">{shop.tagline}</p>}
      </div>
      {waitingCount > 0 && (
        <p className="text-charcoal-600 text-xl font-semibold">
          {waitingCount} {waitingCount === 1 ? 'person' : 'people'} waiting{waitEstimate}
        </p>
      )}
      <div className="w-full grid grid-cols-1 gap-4 mt-2">
        {[
          { key: 'signin', label: 'Sign In', sub: 'Get on the list', icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-10 h-10"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.5-6.5 8-6.5s8 2.5 8 6.5" strokeLinecap="round" /></svg>
          ), onClick: startSignIn },
          { key: 'queue', label: 'Waiting List', sub: waitingCount > 0 ? `${waitingCount} waiting now` : 'See who\'s waiting', icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-10 h-10"><path d="M8 6h13M8 12h13M8 18h13" strokeLinecap="round" /><circle cx="4" cy="6" r="1.2" fill="currentColor" /><circle cx="4" cy="12" r="1.2" fill="currentColor" /><circle cx="4" cy="18" r="1.2" fill="currentColor" /></svg>
          ), onClick: () => setScreen('queue') },
          { key: 'details', label: 'Shop Details', sub: 'Hours, services & more', icon: (
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
      <p className="text-charcoal-400 text-base">This screen clears itself when you're done.</p>
    </div>
  )

  // ---- Wizard screens: one question per screen ----
  const wizardShell = (title: string, sub: React.ReactNode, body: React.ReactNode, cta?: React.ReactNode) => (
    <div className="h-full flex flex-col max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between gap-4 mb-3">
        {backBtn(wizardBack)}
        <div className="text-right">
          <div className="text-base font-semibold text-charcoal-500">Step {stepIndex + 1} of {wizardSteps.length}</div>
        </div>
      </div>
      <div className="h-2 rounded-full bg-warm-200 mb-6 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-300" style={{ width: `${((stepIndex + 1) / wizardSteps.length) * 100}%`, background: theme.primary }} />
      </div>
      <div className="flex-1 flex flex-col justify-center min-h-0">
        <h2 className="font-serif text-3xl md:text-4xl mb-2" style={{ color: theme.primary }}>{title}</h2>
        <p className="text-charcoal-500 text-xl mb-6">{sub}</p>
        {error && <p className="text-red-400 text-lg bg-red-950 border border-red-900 rounded-xl p-4 mb-6">{error}</p>}
        {body}
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
      "Let's get you signed in",
      'Takes about 30 seconds.',
      <div className="space-y-5">
        <div>
          <label className="block text-lg font-semibold text-charcoal-700 mb-2">Your name</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            autoComplete="off" placeholder="First and last" className={inputCls} />
        </div>
        <div>
          <label className="block text-lg font-semibold text-charcoal-700 mb-2">Your phone number</label>
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
            autoComplete="off" placeholder="(555) 123-4567" className={inputCls} />
          <p className="text-base text-charcoal-400 mt-2">We'll text you a quick code — that's how we know it's you.</p>
        </div>
      </div>,
      wizardCta('Text me a code', submitting || !name.trim() || !phone.trim(), () => handleSendCode(), 'Sending…'),
    ),
    barber: wizardShell(
      `Who do you want to see?`,
      `Pick your ${staffLabel.toLowerCase()}, or no preference.`,
      chipGrid(
        [{ value: '', label: 'No preference', sub: 'First one free' },
         ...barbers.map(b => ({ value: b.barber_id, label: b.barber_name || b.alias }))],
        requestedBarberId, setRequestedBarberId,
      ),
      wizardCta('Continue', submitting, wizardNext),
    ),
    service: wizardShell(
      'What are you here for?',
      'Pick a service, or skip it if you\'re not sure yet.',
      chipGrid(
        [{ value: '', label: 'Not sure yet' },
         ...services.map(s => ({ value: s.id, label: s.name, sub: s.price != null ? `$${s.price}` : undefined }))],
        serviceId, setServiceId,
      ),
      wizardCta('Continue', submitting, wizardNext),
    ),
    code: wizardShell(
      'Check your texts',
      <>We sent a 6-digit code to <span className="font-semibold text-charcoal-700">{phone}</span></>,
      <div className="space-y-4">
        <input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={code}
          onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
          autoComplete="one-time-code" placeholder="••••••"
          className="w-full bg-warm-200 border-2 border-warm-300 rounded-xl px-6 text-charcoal-900 text-4xl tracking-[0.4em] text-center outline-none focus:border-od-green transition-colors min-h-[88px]" />
        <button type="button" onClick={() => handleSendCode()} disabled={submitting}
          className="w-full rounded-xl border-2 border-warm-300 text-lg font-semibold text-charcoal-700 min-h-[60px] disabled:opacity-60 active:scale-[0.99] transition-transform">
          Didn't get it? Send the code again
        </button>
      </div>,
      wizardCta('Check me in', submitting || code.length !== 6, () => handleVerify({ preventDefault() {} } as React.FormEvent), 'Checking you in…'),
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
        You're in, {firstName}! 🎉
      </h2>
      <p className="text-charcoal-600 text-2xl mb-2">We'll text you when it's your turn.</p>
      {myPosition != null && (
        <p className="text-charcoal-500 text-xl">You're #{myPosition} in line{waitEstimate ? ` — about ${(myPosition - 1) * avgServiceMinutes} min` : ''}.</p>
      )}
      <div className="w-full max-w-md mt-10">
        <div className="h-2 rounded-full bg-warm-200 overflow-hidden mb-4">
          <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${(countdown / SUCCESS_COUNTDOWN_S) * 100}%`, background: theme.accent }} />
        </div>
        <button type="button" onClick={resetAll}
          className="w-full text-white font-bold rounded-xl text-2xl min-h-[76px] active:scale-[0.99] transition-transform"
          style={{ background: theme.primary }}>
          Done
        </button>
      </div>
    </div>
  )

  // ---- Queue: full-page live waiting list ----
  const queueScreen = (
    <div className="h-full flex flex-col max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between gap-4 mb-5">
        {backBtn(() => setScreen('home'))}
        <h2 className="font-serif text-3xl" style={{ color: theme.primary }}>Who's waiting</h2>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto pr-1 pb-2">
        {queueRows(true)}
      </div>
      <div className="pt-4">
        <button type="button" onClick={startSignIn}
          className="w-full text-white font-bold rounded-xl text-2xl min-h-[76px] active:scale-[0.99] transition-transform"
          style={{ background: theme.primary }}>
          Join the list
        </button>
      </div>
    </div>
  )

  // ---- Details: shop info ----
  const hours: { day: string; open: boolean; from: string; to: string }[] =
    Array.isArray(shop.hours) ? shop.hours : []
  const todayName = DAY_ORDER[new Date().getDay()]
  const addressLine = [shop.address, shop.city].filter(Boolean).join(', ')

  const detailsScreen = (
    <div className="h-full flex flex-col max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between gap-4 mb-5">
        {backBtn(() => setScreen('home'))}
        <h2 className="font-serif text-3xl" style={{ color: theme.primary }}>Shop details</h2>
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
            <div className="text-lg font-bold text-charcoal-900 mb-3">Hours</div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              {hours.map(h => {
                const isToday = h.day === todayName
                return (
                  <div key={h.day} className={`flex items-center justify-between text-lg ${isToday ? 'font-bold' : ''}`}
                    style={isToday ? { color: theme.primary } : undefined}>
                    <span className={isToday ? '' : 'text-charcoal-600'}>{h.day.slice(0, 3)}</span>
                    <span className={isToday ? '' : 'text-charcoal-500'}>
                      {h.open ? `${h.from} – ${h.to}` : 'Closed'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {services.length > 0 && (
          <div className="bg-warm-100 border border-warm-200 rounded-2xl p-5">
            <div className="text-lg font-bold text-charcoal-900 mb-3">Services</div>
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
      <StepPanel key={screen + step} className="h-full max-w-6xl mx-auto">
        {screen === 'home' && homeScreen}
        {screen === 'signin' && (step === 'success' ? successScreen : signinScreens[step])}
        {screen === 'queue' && queueScreen}
        {screen === 'details' && detailsScreen}
      </StepPanel>
    </div>
  )
}
