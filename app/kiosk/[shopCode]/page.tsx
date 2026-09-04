'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useParams, useRouter } from 'next/navigation'
import { timeStrToMinutes } from '@/lib/availability'
import { resolveKioskTheme, type KioskConfig } from '@/lib/kioskConfig'

type QueueRow = { id: string; initials: string; status: string; created_at: string }
type OpenSlotsResponse = {
  date: string
  referenceService: { name: string | null; durationMinutes: number }
  staff: { barberId: string; name: string; slots: string[] }[]
}

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

  const [step, setStep] = useState<'details' | 'code'>('details')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [requestedBarberId, setRequestedBarberId] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

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

  function reset() {
    setStep('details')
    setName('')
    setPhone('')
    setRequestedBarberId('')
    setServiceId('')
    setCode('')
    setError('')
  }

  async function handleSendCode(e?: React.SyntheticEvent) {
    e?.preventDefault()
    if (!name || !phone) return
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
      if (!res.ok) throw new Error(data.error || 'Could not send a code')
      setStep('code')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (!code) return
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/kiosk/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopCode, phone, code }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not verify that code')
      router.push(`/kiosk/${shopCode}/status/${data.id}`)
    } catch (err: any) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-od-green border-t-transparent animate-spin" />
    </div>
  )

  if (notFound) return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center p-4">
      <p className="text-charcoal-500 text-sm">Shop not found.</p>
    </div>
  )

  const theme = resolveKioskTheme(kioskConfig)
  const kioskLogo = kioskConfig?.logo_url || shop.logo_url
  const avgServiceMinutes = services.length > 0
    ? Math.round(services.reduce((sum, s) => sum + (s.duration_minutes || 0), 0) / services.length)
    : 20
  const nowMinutes = new Date(nowTick).getHours() * 60 + new Date(nowTick).getMinutes()

  const checkInForm = (
    <div className="w-full">
      <div className="text-center mb-6">
        <p className="text-charcoal-400 text-sm">Check in for a walk-in visit</p>
      </div>

      {step === 'details' ? (
        <form onSubmit={handleSendCode} className="bg-warm-100 border border-warm-200 rounded-xl p-8 space-y-4">
          {error && <p className="text-red-400 text-sm bg-red-950 border border-red-900 rounded-lg p-3">{error}</p>}
          <div>
            <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Your Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} required
              className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors" />
          </div>
          <div>
            <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Phone Number</label>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} required
              className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors" />
            <p className="text-xs text-charcoal-400 mt-1">We'll text you a code to confirm it's you.</p>
          </div>
          {barbers.length > 0 && (
            <div>
              <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Which {staffLabel}?</label>
              <select value={requestedBarberId} onChange={e => setRequestedBarberId(e.target.value)}
                className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors">
                <option value="">No preference</option>
                {barbers.map(b => (
                  <option key={b.id} value={b.barber_id}>{b.barber_name || b.alias}</option>
                ))}
              </select>
            </div>
          )}
          {services.length > 0 && (
            <div>
              <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Service (optional)</label>
              <select value={serviceId} onChange={e => setServiceId(e.target.value)}
                className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors">
                <option value="">Not sure yet</option>
                {services.map(s => (
                  <option key={s.id} value={s.id}>{s.name} — ${s.price}</option>
                ))}
              </select>
            </div>
          )}
          <button type="submit" disabled={submitting || !name || !phone}
            className="w-full text-white font-semibold py-3 rounded-lg transition-colors text-sm tracking-wide disabled:opacity-60"
            style={{ background: theme.primary }}>
            {submitting ? 'Sending code...' : 'Text Me a Code'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerify} className="bg-warm-100 border border-warm-200 rounded-xl p-8 space-y-4">
          {error && <p className="text-red-400 text-sm bg-red-950 border border-red-900 rounded-lg p-3">{error}</p>}
          <div className="text-center">
            <p className="text-charcoal-600 text-sm">We texted a code to <span className="font-semibold text-charcoal-900">{phone}</span></p>
          </div>
          <div>
            <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Enter Code</label>
            <input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, ''))} required autoFocus
              className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-2xl tracking-[0.5em] text-center outline-none focus:border-od-green transition-colors" />
          </div>
          <button type="submit" disabled={submitting || code.length !== 6}
            className="w-full text-white font-semibold py-3 rounded-lg transition-colors text-sm tracking-wide disabled:opacity-60"
            style={{ background: theme.primary }}>
            {submitting ? 'Checking in...' : 'Verify & Check In'}
          </button>
          <div className="flex items-center justify-between text-xs">
            <button type="button" onClick={reset} className="text-charcoal-400 hover:text-charcoal-600 transition-colors">
              ← Wrong number
            </button>
            <button type="button" onClick={handleSendCode} disabled={submitting} style={{ color: theme.primary }} className="hover:opacity-80 transition-opacity disabled:opacity-60">
              Resend code
            </button>
          </div>
        </form>
      )}
    </div>
  )

  return (
    <div className="min-h-screen bg-warm-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-6 md:mb-8">
          {kioskLogo ? (
            <img src={kioskLogo} alt={shop.name} className="w-12 h-12 md:w-14 md:h-14 rounded-xl object-cover flex-shrink-0" />
          ) : (
            <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl flex items-center justify-center font-serif text-xl font-bold flex-shrink-0"
              style={{ background: theme.primary + '20', color: theme.primary, border: `2px solid ${theme.primary}40` }}>
              {shop.name[0]}
            </div>
          )}
          <h1 className="font-serif text-2xl md:text-3xl" style={{ color: theme.primary }}>{shop.name}</h1>
        </div>

        <div className={showLobby ? 'flex flex-col md:flex-row gap-6 items-start' : 'flex justify-center'}>
          {showLobby && (
            <div className="w-full md:flex-1 space-y-6">
              {showQueue && (
                <div className="bg-warm-100 border border-warm-200 rounded-xl p-6">
                  <h2 className="font-serif text-lg mb-4" style={{ color: theme.primary }}>Waiting List</h2>
                  {queue.length === 0 ? (
                    <p className="text-charcoal-400 text-sm">No one is waiting right now.</p>
                  ) : (
                    <div className="space-y-2">
                      {queue.map((q, i) => (
                        <div key={q.id} className="flex items-center gap-3 bg-warm-50 border border-warm-200 rounded-lg px-4 py-3">
                          <div className="w-9 h-9 rounded-full flex items-center justify-center font-semibold text-sm text-white flex-shrink-0"
                            style={{ background: theme.accent }}>
                            {q.initials}
                          </div>
                          <div className="flex-1">
                            <div className="text-sm font-medium text-charcoal-900">#{i + 1} in line</div>
                            <div className="text-xs text-charcoal-500">
                              {q.status === 'called' ? "Being called now" : `~${i * avgServiceMinutes} min estimated wait`}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {showSlots && (
                <div className="bg-warm-100 border border-warm-200 rounded-xl p-6">
                  <h2 className="font-serif text-lg mb-1" style={{ color: theme.primary }}>Open Today</h2>
                  {openSlots?.referenceService.name && (
                    <p className="text-xs text-charcoal-500 mb-4">Based on a {openSlots.referenceService.durationMinutes}-min service ({openSlots.referenceService.name})</p>
                  )}
                  {!openSlots || openSlots.staff.length === 0 ? (
                    <p className="text-charcoal-400 text-sm">{openSlots ? 'No staff scheduled today.' : 'Loading...'}</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {openSlots.staff.map(s => {
                        const remaining = s.slots.filter(t => timeStrToMinutes(t) >= nowMinutes)
                        return (
                          <div key={s.barberId} className="bg-warm-50 border border-warm-200 rounded-lg p-4">
                            <div className="text-sm font-semibold text-charcoal-900 mb-2">{s.name}</div>
                            {remaining.length === 0 ? (
                              <p className="text-xs text-charcoal-500">
                                {s.slots.length === 0 ? 'Booked up for today' : 'Closed for the day'}
                              </p>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {remaining.slice(0, 8).map(t => (
                                  <span key={t} className="text-xs font-medium px-2 py-1 rounded-md"
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
          )}

          <div className={showLobby ? 'w-full md:w-96 flex-shrink-0' : 'w-full max-w-md'}>
            {checkInForm}
          </div>
        </div>
      </div>
    </div>
  )
}
