'use client'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useParams, useRouter } from 'next/navigation'
import { timeStrToMinutes } from '@/lib/availability'
import { resolveKioskTheme, type KioskConfig } from '@/lib/kioskConfig'
import { StepPanel } from '@/components/motion'

type QueueRow = { id: string; display_label: string; status: string; created_at: string }
type OpenSlotsResponse = {
  date: string
  referenceService: { name: string | null; durationMinutes: number }
  staff: { barberId: string; name: string; slots: string[] }[]
}

// A shared counter tablet must never sit on one customer's half-finished
// check-in: after this long with no taps, everything clears back to the
// welcome screen (which also protects the previous customer's name/phone).
const IDLE_RESET_MS = 75_000

export default function KioskCheckIn() {
  const params = useParams()
  const shopCode = (params.shopCode as string)?.toUpperCase()
  const supabase = createClient()
  const router = useRouter()

  const [shop, setShop] = useState<any>(null)
  const [barbers, setBarbers] = useState<any[]>([])
  const [services, setServices] = useState<any[]>([])
  const [staffLabel, setStaffLabel] = useState('Barber')
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // screen: attract = welcome screen (default + idle reset target),
  // form = active check-in flow.
  const [screen, setScreen] = useState<'attract' | 'form'>('attract')
  const [step, setStep] = useState<'details' | 'code'>('details')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [requestedBarberId, setRequestedBarberId] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  // Ref guard: state updates are async, so two fast taps could both fire
  // before `submitting` flips. This kills the second one for real.
  const busyRef = useRef(false)

  // Lobby display: live queue + today's open slots, themed per kiosk_config.
  const [kioskConfig, setKioskConfig] = useState<KioskConfig | null>(null)
  const [queue, setQueue] = useState<QueueRow[]>([])
  const [openSlots, setOpenSlots] = useState<OpenSlotsResponse | null>(null)
  const [nowTick, setNowTick] = useState(() => Date.now())

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

  const displayMode = kioskConfig?.display_mode || 'both'
  const showQueue = displayMode === 'queue' || displayMode === 'both'
  const showSlots = displayMode === 'slots' || displayMode === 'both'
  const showLobby = displayMode !== 'off'

  // Live walk-in queue -- reads/subscribes to kiosk_queue_public, a
  // trigger-maintained projection of walk_ins with only initials and no
  // phone number, since this tablet is anonymous and walk_ins itself is
  // staff-only (see the migration for why).
  useEffect(() => {
    if (!shop || !showQueue) { setQueue([]); return }
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
  }, [shop, showQueue])

  // Today's open slots per staff member -- fetched from the real
  // availability engine server-side (buffers included). Appointments
  // themselves aren't safe for an anon client to subscribe to (same PII
  // reasoning as the queue), so a content-free "ping" row signals when to
  // re-fetch instead of shipping row data over Realtime.
  useEffect(() => {
    if (!shop || !showSlots) { setOpenSlots(null); return }
    let cancelled = false

    async function loadSlots() {
      try {
        const res = await fetch(`/api/kiosk/open-slots?shopCode=${shopCode}`)
        const data = await res.json()
        if (!cancelled) setOpenSlots(data)
      } catch {
        // Transient -- the next ping or poll tick retries.
      }
    }
    loadSlots()

    const channel = supabase
      .channel(`kiosk-pings-${shop.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shop_realtime_pings', filter: `shop_id=eq.${shop.id}` }, loadSlots)
      .subscribe()

    // Backstop for pings missed while this tab wasn't subscribed yet --
    // not the primary update path.
    const poll = setInterval(loadSlots, 5 * 60 * 1000)

    return () => { cancelled = true; supabase.removeChannel(channel); clearInterval(poll) }
  }, [shop, showSlots, shopCode])

  // Slot chips are filtered to "still ahead today," which needs a clock
  // tick independent of any data change.
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 60000)
    return () => clearInterval(t)
  }, [])

  function resetForm() {
    setStep('details')
    setName('')
    setPhone('')
    setRequestedBarberId('')
    setServiceId('')
    setCode('')
    setError('')
    setSubmitting(false)
    busyRef.current = false
  }

  function goAttract() {
    resetForm()
    setScreen('attract')
  }

  function startCheckIn() {
    resetForm()
    setStep('details')
    setScreen('form')
  }

  // Idle watchdog: only armed while a customer is mid-check-in. Any tap
  // or keypress restarts the clock; on expiry the tablet wipes the form
  // and goes back to the welcome screen.
  useEffect(() => {
    if (screen !== 'form') return
    let t: ReturnType<typeof setTimeout> | null = null
    const poke = () => {
      if (t) clearTimeout(t)
      t = setTimeout(goAttract, IDLE_RESET_MS)
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
      setStep('code')
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
      router.push(`/kiosk/${shopCode}/status/${data.id}`)
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Try again.')
      setSubmitting(false)
      busyRef.current = false
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center">
      <div className="w-10 h-10 rounded-full border-4 border-od-green border-t-transparent animate-spin" />
    </div>
  )

  if (notFound) return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center p-8">
      <p className="text-charcoal-500 text-xl">We couldn't find that shop. Ask us at the counter.</p>
    </div>
  )

  const theme = resolveKioskTheme(kioskConfig)
  const kioskLogo = kioskConfig?.logo_url || shop.logo_url
  const avgServiceMinutes = services.length > 0
    ? Math.round(services.reduce((sum, s) => sum + (s.duration_minutes || 0), 0) / services.length)
    : 20
  const nowMinutes = new Date(nowTick).getHours() * 60 + new Date(nowTick).getMinutes()

  const logo = kioskLogo ? (
    <img src={kioskLogo} alt={shop.name} className="w-20 h-20 md:w-24 md:h-24 rounded-2xl object-cover flex-shrink-0" />
  ) : (
    <div className="w-20 h-20 md:w-24 md:h-24 rounded-2xl flex items-center justify-center font-serif text-4xl font-bold flex-shrink-0"
      style={{ background: theme.primary + '20', color: theme.primary, border: `3px solid ${theme.primary}40` }}>
      {shop.name[0]}
    </div>
  )

  const lobbyPanels = (
    <div className="w-full space-y-6">
      {showQueue && (
        <div className="bg-warm-100 border border-warm-200 rounded-2xl p-6 md:p-8">
          <h2 className="font-serif text-2xl mb-4" style={{ color: theme.primary }}>Who's waiting</h2>
          {queue.length === 0 ? (
            <p className="text-charcoal-500 text-lg">No one's waiting — walk right up.</p>
          ) : (
            <div className="space-y-3">
              {queue.map((q, i) => (
                <div key={q.id} className="flex items-center gap-4 bg-warm-50 border border-warm-200 rounded-xl px-5 py-4">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg text-white flex-shrink-0"
                    style={{ background: theme.accent }}>
                    {q.display_label[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <div className="text-lg font-semibold text-charcoal-900">{q.display_label}</div>
                    <div className="text-base text-charcoal-500">
                      {q.status === 'called' ? 'Being called now' : `#${i + 1} in line — about ${i * avgServiceMinutes} min`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showSlots && (
        <div className="bg-warm-100 border border-warm-200 rounded-2xl p-6 md:p-8">
          <h2 className="font-serif text-2xl mb-1" style={{ color: theme.primary }}>Open today</h2>
          {openSlots?.referenceService.name && (
            <p className="text-base text-charcoal-500 mb-4">Based on a {openSlots.referenceService.durationMinutes}-min service ({openSlots.referenceService.name})</p>
          )}
          {!openSlots || openSlots.staff.length === 0 ? (
            <p className="text-charcoal-500 text-lg">{openSlots ? 'No staff on today.' : 'Loading…'}</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {openSlots.staff.map(s => {
                const remaining = s.slots.filter(t => timeStrToMinutes(t) >= nowMinutes)
                return (
                  <div key={s.barberId} className="bg-warm-50 border border-warm-200 rounded-xl p-5">
                    <div className="text-lg font-semibold text-charcoal-900 mb-3">{s.name}</div>
                    {remaining.length === 0 ? (
                      <p className="text-base text-charcoal-500">
                        {s.slots.length === 0 ? 'Booked up for today' : 'Done for today'}
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {remaining.slice(0, 8).map(t => (
                          <span key={t} className="text-base font-semibold px-3 py-2 rounded-lg"
                            style={{ background: theme.accent + '1a', color: theme.accent }}>
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )

  // Big tappable chip grid replacing the old native <select> dropdowns --
  // far easier to hit with a thumb on a shared tablet.
  const chipGrid = (
    options: { value: string; label: string }[],
    selected: string,
    onPick: (v: string) => void,
  ) => (
    <div className="grid grid-cols-2 gap-3">
      {options.map(o => {
        const active = selected === o.value
        return (
          <button key={o.value || 'none'} type="button" onClick={() => onPick(o.value)}
            aria-pressed={active}
            className="min-h-[64px] px-5 py-3 rounded-xl border-2 text-lg font-semibold text-left transition-colors"
            style={active
              ? { background: theme.primary, borderColor: theme.primary, color: '#fff' }
              : { background: 'var(--color-card)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}>
            {o.label}
          </button>
        )
      })}
    </div>
  )

  const inputCls =
    'w-full bg-warm-200 border-2 border-warm-300 rounded-xl px-6 text-charcoal-900 text-xl outline-none focus:border-od-green transition-colors min-h-[68px]'

  const checkInForm = (
    <div className="w-full">
      {step === 'details' ? (
        <form onSubmit={handleSendCode} className="bg-warm-100 border border-warm-200 rounded-2xl p-6 md:p-10 space-y-6">
          <div className="mb-2">
            <h2 className="font-serif text-3xl" style={{ color: theme.primary }}>Check in</h2>
            <p className="text-charcoal-500 text-lg mt-2">Takes about 30 seconds.</p>
          </div>
          {error && <p className="text-red-400 text-lg bg-red-950 border border-red-900 rounded-xl p-4">{error}</p>}
          <div>
            <label className="block text-lg font-semibold text-charcoal-700 mb-3">Your name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} required
              autoComplete="off" placeholder="First and last"
              className={inputCls} />
          </div>
          <div>
            <label className="block text-lg font-semibold text-charcoal-700 mb-3">Your phone number</label>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} required
              autoComplete="off" placeholder="(555) 123-4567"
              className={inputCls} />
            <p className="text-base text-charcoal-400 mt-2">We'll text you a quick code — that's how we know it's you.</p>
          </div>
          {barbers.length > 0 && (
            <div>
              <label className="block text-lg font-semibold text-charcoal-700 mb-3">Who's your {staffLabel.toLowerCase()}?</label>
              {chipGrid(
                [{ value: '', label: 'No preference' },
                 ...barbers.map(b => ({ value: b.barber_id, label: b.barber_name || b.alias }))],
                requestedBarberId, setRequestedBarberId,
              )}
            </div>
          )}
          {services.length > 0 && (
            <div>
              <label className="block text-lg font-semibold text-charcoal-700 mb-3">What are you here for?</label>
              {chipGrid(
                [{ value: '', label: 'Not sure yet' },
                 ...services.map(s => ({ value: s.id, label: `${s.name} — $${s.price}` }))],
                serviceId, setServiceId,
              )}
            </div>
          )}
          <button type="submit" disabled={submitting || !name || !phone}
            className="w-full text-white font-bold rounded-xl transition-opacity text-2xl min-h-[76px] disabled:opacity-60"
            style={{ background: theme.primary }}>
            {submitting ? 'Sending…' : 'Text me a code'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerify} className="bg-warm-100 border border-warm-200 rounded-2xl p-6 md:p-10 space-y-6">
          <div className="mb-2">
            <h2 className="font-serif text-3xl" style={{ color: theme.primary }}>Check your texts</h2>
            <p className="text-charcoal-500 text-lg mt-2">We sent a 6-digit code to <span className="font-semibold text-charcoal-700">{phone}</span></p>
          </div>
          {error && <p className="text-red-400 text-lg bg-red-950 border border-red-900 rounded-xl p-4">{error}</p>}
          <div>
            <label className="block text-lg font-semibold text-charcoal-700 mb-3">Enter the code</label>
            <input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, ''))} required autoFocus
              autoComplete="one-time-code" placeholder="••••••"
              className="w-full bg-warm-200 border-2 border-warm-300 rounded-xl px-6 text-charcoal-900 text-4xl tracking-[0.4em] text-center outline-none focus:border-od-green transition-colors min-h-[88px]" />
          </div>
          <button type="submit" disabled={submitting || code.length !== 6}
            className="w-full text-white font-bold rounded-xl transition-opacity text-2xl min-h-[76px] disabled:opacity-60"
            style={{ background: theme.primary }}>
            {submitting ? 'Checking you in…' : 'Check me in'}
          </button>
          <div className="flex flex-col gap-3">
            <button type="button" onClick={handleSendCode} disabled={submitting}
              className="w-full rounded-xl border-2 border-warm-300 text-lg font-semibold text-charcoal-700 min-h-[60px] disabled:opacity-60 transition-colors">
              Didn't get it? Send the code again
            </button>
            <button type="button" onClick={() => { setStep('details'); setError('') }}
              className="w-full rounded-xl text-lg font-semibold text-charcoal-500 min-h-[60px] transition-colors">
              ← Back
            </button>
          </div>
        </form>
      )}
    </div>
  )

  return (
    <div className="min-h-screen bg-warm-50 p-4 md:p-8">
      <StepPanel key={`${screen}-${step}`} className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between gap-4 mb-6 md:mb-8">
          <div className="flex items-center gap-4">
            {logo}
            <h1 className="font-serif text-3xl md:text-4xl" style={{ color: theme.primary }}>{shop.name}</h1>
          </div>
          {screen === 'form' && (
            <button type="button" onClick={goAttract}
              className="flex-shrink-0 rounded-xl border-2 border-warm-300 text-charcoal-700 text-lg font-bold px-6 min-h-[60px] transition-colors">
              Start over
            </button>
          )}
        </div>

        {screen === 'attract' ? (
          <div className="flex flex-col lg:flex-row gap-6 items-stretch">
            <div className="w-full lg:w-[480px] flex-shrink-0">
              <div className="bg-warm-100 border border-warm-200 rounded-2xl p-8 md:p-12 text-center h-full flex flex-col justify-center">
                <h2 className="font-serif text-4xl md:text-5xl mb-4" style={{ color: theme.primary }}>
                  Welcome
                </h2>
                <p className="text-charcoal-500 text-xl mb-8">
                  {showQueue && queue.length > 0
                    ? "Here's who's waiting — tap below to join the list."
                    : 'Tap below to get on the list.'}
                </p>
                <button type="button" onClick={startCheckIn}
                  className="w-full text-white font-bold rounded-2xl text-3xl min-h-[96px] transition-transform active:scale-[0.98]"
                  style={{ background: theme.primary }}>
                  Check In
                </button>
                <p className="text-charcoal-400 text-base mt-6">This screen clears itself when you're done.</p>
              </div>
            </div>
            {showLobby && (
              <div className="flex-1 min-w-0">
                {lobbyPanels}
              </div>
            )}
          </div>
        ) : (
          <div className={showLobby ? 'flex flex-col lg:flex-row gap-6 items-start' : 'flex justify-center'}>
            {showLobby && (
              <div className="w-full lg:flex-1 min-w-0">
                {lobbyPanels}
              </div>
            )}
            <div className={showLobby ? 'w-full lg:w-[520px] flex-shrink-0' : 'w-full max-w-2xl'}>
              {checkInForm}
            </div>
          </div>
        )}
      </StepPanel>
    </div>
  )
}
