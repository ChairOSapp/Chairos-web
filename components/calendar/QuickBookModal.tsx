'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { useVerticalLabels } from '@/lib/VerticalContext'
import { FadeBackdrop, ModalPanel } from '@/components/motion'

interface Barber { barber_id: string; barber_name: string; alias?: string | null }
interface Service { id: string; name: string; price: number | null; duration_minutes?: number | null }

interface Props {
  shopId: string
  initialDate?: string
  initialTime?: string
  initialBarberId?: string
  barbers: Barber[]
  services: Service[]
  lockedBarberId?: string
  onCreated: () => void
  onClose: () => void
}

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

const TIME_SLOTS = Array.from({ length: 61 }, (_, i) => {
  const totalMin = 420 + i * 15 // 7:00am → 10:00pm, matching the calendar grid
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return { label: `${hour}:${String(m).padStart(2, '0')} ${ampm}`, value: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00` }
})

function fmtDuration(min: number) {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} hr ${m} min` : `${h} hr`
}

// Shared field styling: solid fill that stands apart from the warm-100 sheet,
// visible border, clear focus ring. 16px text prevents iOS auto-zoom on focus.
const inputCls = 'w-full min-w-0 rounded-xl border border-warm-300 bg-white field-solid px-4 py-3 text-base text-charcoal-900 placeholder:text-charcoal-400 outline-none transition-colors focus:border-od-green focus:ring-2 focus:ring-od-green/25'

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[13px] font-bold tracking-tight text-charcoal-800">{children}</h3>
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block text-xs font-medium text-charcoal-500">{children}</label>
}

function ChevronIcon() {
  return (
    <svg aria-hidden className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="m4 6 4 4 4-4" />
    </svg>
  )
}

export default function QuickBookModal({
  shopId, initialDate, initialTime, initialBarberId, barbers, services, lockedBarberId, onCreated, onClose,
}: Props) {
  const { staffLabel } = useVerticalLabels()
  const today = toDateStr(new Date())
  const [date, setDate] = useState(initialDate || today)
  const [time, setTime] = useState(initialTime || '09:00:00')
  const [barberId, setBarberId] = useState(lockedBarberId || initialBarberId || barbers[0]?.barber_id || '')
  const [serviceId, setServiceId] = useState('')
  const [price, setPrice] = useState('')
  const [durationMin, setDurationMin] = useState(30)
  const [phone, setPhone] = useState('')
  const [clientName, setClientName] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [phoneResults, setPhoneResults] = useState<any[]>([])
  const [showPhoneDrop, setShowPhoneDrop] = useState(false)
  const [foundClientId, setFoundClientId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const phoneTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    if (phone.length < 3) { setPhoneResults([]); setShowPhoneDrop(false); return }
    if (phoneTimer.current) clearTimeout(phoneTimer.current)
    phoneTimer.current = setTimeout(async () => {
      const { data } = await supabase.from('clients').select('id, full_name, phone, last_visit_date')
        .ilike('phone', `%${phone}%`).limit(5)
      setPhoneResults(data || [])
      setShowPhoneDrop((data?.length || 0) > 0)
    }, 300)
  }, [phone, supabase])

  function selectClient(c: any) {
    setPhone(c.phone || '')
    setClientName(c.full_name || '')
    setFoundClientId(c.id)
    setPhoneResults([])
    setShowPhoneDrop(false)
  }

  function onServiceChange(svcId: string) {
    setServiceId(svcId)
    const svc = services.find(s => s.id === svcId)
    if (svc) {
      // A service with no price leaves the field empty -- the owner types
      // one in (or the submit guard below blocks with a plain message).
      setPrice(svc.price == null ? '' : String(svc.price))
      // The service dictates the length; the owner can still change it below.
      setDurationMin(svc.duration_minutes && svc.duration_minutes > 0 ? svc.duration_minutes : 30)
    }
  }

  async function submit() {
    if (!date || !time || !clientName || !phone) { setError("Add the client's name and phone number to book."); return }
    if (date < today) { setError('Pick today or a future date.'); return }
    setSubmitting(true)
    setError('')

    let clientId = foundClientId
    if (!clientId) {
      // clients' SELECT policy only allows reading rows already linked to
      // this shop via client_shop_memberships, so a brand-new client can't
      // be read back right after insert (same RLS shape documented in
      // WalkInQueue.tsx / the public booking page) -- use the same
      // lookup-by-membership RPC and client-generated-id insert pattern,
      // and actually create the membership afterward so this client shows
      // up in the shop's client list at all.
      const { data: rpcData } = await supabase
        .rpc('find_client_for_booking', { p_phone: phone, p_shop_id: shopId })
      const existing = rpcData?.[0]
      if (existing?.client_id) {
        clientId = existing.client_id
      } else {
        const newId = crypto.randomUUID()
        const { error: newClientErr } = await supabase.from('clients').insert({
          id: newId,
          full_name: clientName,
          phone,
          total_visits: 0,
          source: 'manual',
        })
        clientId = newClientErr ? null : newId
      }

      if (clientId) {
        fetch('/api/book/membership', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId, shopId }),
        }).catch(() => {})
      }
    }

    const svc = services.find(s => s.id === serviceId)
    // Never write a silent $0: a service with no list price and no typed-in
    // price blocks here with a plain message (the owner can type a price in
    // the field above instead). With no service selected at all, the price
    // stays NULL (pay at the shop) rather than 0.
    const enteredPrice = price.trim() === '' ? NaN : parseFloat(price)
    if (svc && svc.price == null && Number.isNaN(enteredPrice)) {
      setSubmitting(false)
      setError(`Set a price for "${svc.name}" first — type one in the price field, or add it in Services.`)
      return
    }
    const bookingPrice = Number.isNaN(enteredPrice) ? (svc?.price ?? null) : enteredPrice
    const { error: err } = await supabase.from('appointments').insert({
      shop_id: shopId,
      barber_id: barberId || null,
      service_id: serviceId || null,
      client_id: clientId,
      client_name: clientName,
      client_phone: phone,
      date,
      time: time.length === 5 ? time + ':00' : time,
      price: bookingPrice,
      duration_minutes: durationMin,
      status: 'confirmed',
      notes: notes || null,
      source: 'manual',
    })

    setSubmitting(false)
    if (err) {
      const msg = err.message || ''
      setError(
        err.code === '23505' || /duplicate key/i.test(msg)
          ? 'That time is already booked for this barber — pick another slot.'
          : msg || 'Could not book the appointment. Please try again.'
      )
      return
    }
    onCreated()
    onClose()
  }

  const displayTime = time.length >= 5
    ? (() => {
        const [h, m] = time.split(':').map(Number)
        const ampm = h >= 12 ? 'PM' : 'AM'
        return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`
      })()
    : time

  const endTimeLabel = (() => {
    const [h, m] = time.split(':').map(Number)
    if (Number.isNaN(h) || Number.isNaN(m)) return ''
    const total = h * 60 + m + durationMin
    const eh = Math.floor(total / 60) % 24
    const em = total % 60
    const ampm = eh >= 12 ? 'PM' : 'AM'
    return `${eh % 12 || 12}:${String(em).padStart(2, '0')} ${ampm}`
  })()

  return (
    <div className="fixed inset-0 z-[150] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <FadeBackdrop className="absolute inset-0 bg-charcoal-900/40 backdrop-blur-sm" onClick={onClose} />
      <ModalPanel className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-warm-100 shadow-2xl sm:max-w-md sm:rounded-3xl">

        {/* Header */}
        <div className="flex-shrink-0 border-b border-warm-200 px-5 pb-4 pt-3">
          <div aria-hidden className="mx-auto mb-3 h-1 w-10 rounded-full bg-warm-300 sm:hidden" />
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-charcoal-400">New appointment</p>
              <h2 className="mt-0.5 font-serif text-[22px] leading-snug text-charcoal-900">
                {date === today ? 'Today' : new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {displayTime}{endTimeLabel ? ` – ${endTimeLabel}` : ''}
              </h2>
            </div>
            <button onClick={onClose} aria-label="Close"
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-warm-200 text-charcoal-500 transition-colors hover:bg-warm-300 hover:text-charcoal-900">
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>
        </div>

        {/* Form */}
        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">

          {/* Who's coming in — most important first */}
          <section>
            <SectionTitle>Who&rsquo;s coming in?</SectionTitle>
            <div className="mt-3 space-y-3">
              <div className="min-w-0">
                <FieldLabel>Name</FieldLabel>
                <input type="text" value={clientName} onChange={e => setClientName(e.target.value)}
                  placeholder="Client's full name" className={inputCls} />
                {!foundClientId && clientName && (
                  <p className="mt-1.5 text-xs text-charcoal-400">New client — we&rsquo;ll save them when you book</p>
                )}
              </div>
              <div className="relative min-w-0">
                <FieldLabel>Phone</FieldLabel>
                <input type="tel" value={phone} onChange={e => { setPhone(e.target.value); setFoundClientId(null) }}
                  onFocus={() => phoneResults.length > 0 && setShowPhoneDrop(true)}
                  placeholder="(555) 123-4567" className={inputCls} />
                {showPhoneDrop && (
                  <div className="field-solid absolute inset-x-0 z-10 mt-1.5 overflow-hidden rounded-xl border border-warm-200 bg-white shadow-xl">
                    {phoneResults.map(c => (
                      <button key={c.id} onClick={() => selectClient(c)}
                        className="w-full border-b border-warm-200 px-4 py-3 text-left transition-colors last:border-0 hover:bg-warm-200">
                        <div className="text-[15px] font-medium text-charcoal-900">{c.full_name}</div>
                        <div className="text-xs text-charcoal-400">{c.phone}{c.last_visit_date ? ` · last visit ${new Date(c.last_visit_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}</div>
                      </button>
                    ))}
                    {!phoneResults.length && <div className="px-4 py-3 text-xs text-charcoal-400">New client — we&rsquo;ll add them when you book</div>}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* When */}
          <section>
            <SectionTitle>When?</SectionTitle>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="min-w-0">
                <FieldLabel>Date</FieldLabel>
                <input type="date" value={date} min={today} onChange={e => setDate(e.target.value)} className={inputCls} />
              </div>
              <div className="min-w-0">
                <FieldLabel>Time</FieldLabel>
                <div className="relative">
                  <select value={time} onChange={e => setTime(e.target.value)} className={`${inputCls} appearance-none pr-11`}>
                    {TIME_SLOTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                  <ChevronIcon />
                </div>
              </div>
            </div>
          </section>

          {/* Barber */}
          <section>
            <SectionTitle>{staffLabel}</SectionTitle>
            <div className="mt-3 min-w-0">
              {!lockedBarberId ? (
                <div className="relative">
                  <select value={barberId} onChange={e => setBarberId(e.target.value)} className={`${inputCls} appearance-none pr-11`}>
                    <option value="">Unassigned</option>
                    {barbers.map(b => <option key={b.barber_id} value={b.barber_id}>{b.barber_name || b.alias}</option>)}
                  </select>
                  <ChevronIcon />
                </div>
              ) : (
                <div className={`${inputCls} text-charcoal-600`}>
                  {barbers.find(b => b.barber_id === lockedBarberId)?.barber_name || 'Me'}
                </div>
              )}
            </div>
          </section>

          {/* Service */}
          <section>
            <SectionTitle>Service</SectionTitle>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="min-w-0">
                <FieldLabel>Service</FieldLabel>
                <div className="relative">
                  <select value={serviceId} onChange={e => onServiceChange(e.target.value)} className={`${inputCls} appearance-none pr-11`}>
                    <option value="">Select…</option>
                    {services.map(s => <option key={s.id} value={s.id}>{s.name} — {s.price != null ? `$${Number(s.price).toFixed(0)}` : 'no price set'}</option>)}
                  </select>
                  <ChevronIcon />
                </div>
              </div>
              <div className="min-w-0">
                <FieldLabel>Price</FieldLabel>
                <div className="relative">
                  <span aria-hidden className="absolute left-4 top-1/2 -translate-y-1/2 text-base text-charcoal-400">$</span>
                  <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="0"
                    className={`${inputCls} pl-9`} />
                </div>
              </div>
            </div>
            <div className="mt-3 min-w-0">
              <FieldLabel>Duration</FieldLabel>
              <div className="flex items-center justify-between rounded-xl border border-warm-300 bg-white px-2 py-2">
                <button type="button" aria-label="Shorten by 15 minutes"
                  onClick={() => setDurationMin(d => Math.max(15, d - 15))}
                  className="flex h-11 w-11 items-center justify-center rounded-lg bg-warm-200 text-xl font-bold text-charcoal-700 transition-colors hover:bg-warm-300 active:scale-95">
                  −
                </button>
                <div className="text-center">
                  <div className="text-base font-bold text-charcoal-900">{fmtDuration(durationMin)}</div>
                  {serviceId && (
                    <div className="text-[11px] text-charcoal-400">From {services.find(s => s.id === serviceId)?.name} — change it if you need</div>
                  )}
                </div>
                <button type="button" aria-label="Lengthen by 15 minutes"
                  onClick={() => setDurationMin(d => Math.min(480, d + 15))}
                  className="flex h-11 w-11 items-center justify-center rounded-lg bg-warm-200 text-xl font-bold text-charcoal-700 transition-colors hover:bg-warm-300 active:scale-95">
                  +
                </button>
              </div>
            </div>
          </section>

          {/* Notes */}
          <section>
            <SectionTitle>Notes <span className="font-medium text-charcoal-400">(optional)</span></SectionTitle>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Anything the barber should know…"
              className={`${inputCls} mt-3 resize-none`} />
          </section>

          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] leading-snug text-red-600">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-warm-200 px-5 py-4">
          <button onClick={submit} disabled={submitting || !clientName || !phone}
            className="w-full rounded-2xl bg-od-green py-4 text-[15px] font-bold text-white shadow-lg shadow-od-green/25 transition-all hover:bg-od-green-dark active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-warm-300 disabled:text-charcoal-400 disabled:shadow-none">
            {submitting ? 'Booking…' : 'Book appointment'}
          </button>
        </div>
      </ModalPanel>
    </div>
  )
}
