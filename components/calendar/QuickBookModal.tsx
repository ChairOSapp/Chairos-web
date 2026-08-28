'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { useVerticalLabels } from '@/lib/VerticalContext'

interface Barber { barber_id: string; barber_name: string; alias?: string | null }
interface Service { id: string; name: string; price: number }

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

const TIME_SLOTS = Array.from({ length: 46 }, (_, i) => {
  const totalMin = 480 + i * 15 // 8:00am → 11:15pm
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return { label: `${hour}:${String(m).padStart(2, '0')} ${ampm}`, value: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00` }
})

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
    if (svc) setPrice(String(svc.price))
  }

  async function submit() {
    if (!date || !time || !clientName || !phone) { setError('Fill in all required fields.'); return }
    setSubmitting(true)
    setError('')

    let clientId = foundClientId
    if (!clientId) {
      const { data: existing } = await supabase.from('clients').select('id').eq('phone', phone).maybeSingle()
      if (existing) {
        clientId = existing.id
      } else {
        const { data: newClient } = await supabase.from('clients').insert({
          full_name: clientName,
          phone,
          total_visits: 0,
          source: 'manual',
        }).select('id').single()
        clientId = newClient?.id || null
      }
    }

    const svc = services.find(s => s.id === serviceId)
    const { error: err } = await supabase.from('appointments').insert({
      shop_id: shopId,
      barber_id: barberId || null,
      service_id: serviceId || null,
      client_id: clientId,
      client_name: clientName,
      client_phone: phone,
      date,
      time: time.length === 5 ? time + ':00' : time,
      price: parseFloat(price) || svc?.price || 0,
      status: 'confirmed',
      notes: notes || null,
      source: 'manual',
    })

    setSubmitting(false)
    if (err) { setError(err.message); return }
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

  return (
    <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-charcoal-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-warm-100 sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden max-h-[92dvh] flex flex-col">

        {/* Header */}
        <div className="px-5 py-4 border-b border-warm-200 flex items-center justify-between flex-shrink-0">
          <div>
            <div className="text-xs font-bold tracking-widest uppercase text-charcoal-400 mb-0.5">New Appointment</div>
            <div className="font-serif text-lg text-charcoal-900">{date === today ? 'Today' : new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {displayTime}</div>
          </div>
          <button onClick={onClose} className="text-charcoal-400 hover:text-charcoal-900 text-2xl leading-none transition-colors">×</button>
        </div>

        {/* Form */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3.5">

          {/* Date + Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold tracking-widest uppercase text-charcoal-400 mb-1">Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full bg-warm-200 border border-warm-300 rounded-xl px-3 py-2 text-sm text-charcoal-900 outline-none focus:border-od-green" />
            </div>
            <div>
              <label className="block text-[10px] font-bold tracking-widest uppercase text-charcoal-400 mb-1">Time</label>
              <select value={time} onChange={e => setTime(e.target.value)}
                className="w-full bg-warm-200 border border-warm-300 rounded-xl px-3 py-2 text-sm text-charcoal-900 outline-none focus:border-od-green">
                {TIME_SLOTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          {/* Barber */}
          {!lockedBarberId && (
            <div>
              <label className="block text-[10px] font-bold tracking-widest uppercase text-charcoal-400 mb-1">{staffLabel}</label>
              <select value={barberId} onChange={e => setBarberId(e.target.value)}
                className="w-full bg-warm-200 border border-warm-300 rounded-xl px-3 py-2 text-sm text-charcoal-900 outline-none focus:border-od-green">
                <option value="">Unassigned</option>
                {barbers.map(b => <option key={b.barber_id} value={b.barber_id}>{b.barber_name || b.alias}</option>)}
              </select>
            </div>
          )}
          {lockedBarberId && (
            <div>
              <label className="block text-[10px] font-bold tracking-widest uppercase text-charcoal-400 mb-1">{staffLabel}</label>
              <div className="bg-warm-200 border border-warm-300 rounded-xl px-3 py-2 text-sm text-charcoal-600">
                {barbers.find(b => b.barber_id === lockedBarberId)?.barber_name || 'Me'}
              </div>
            </div>
          )}

          {/* Phone (with lookup) */}
          <div className="relative">
            <label className="block text-[10px] font-bold tracking-widest uppercase text-charcoal-400 mb-1">Client Phone *</label>
            <input type="tel" value={phone} onChange={e => { setPhone(e.target.value); setFoundClientId(null) }}
              onFocus={() => phoneResults.length > 0 && setShowPhoneDrop(true)}
              placeholder="e.g. 555-867-5309"
              className="w-full bg-warm-200 border border-warm-300 rounded-xl px-3 py-2 text-sm text-charcoal-900 outline-none focus:border-od-green" />
            {showPhoneDrop && (
              <div className="absolute z-10 left-0 right-0 mt-1 bg-warm-100 border border-warm-200 rounded-xl shadow-lg overflow-hidden">
                {phoneResults.map(c => (
                  <button key={c.id} onClick={() => selectClient(c)}
                    className="w-full px-3 py-2.5 text-left hover:bg-warm-200 transition-colors border-b border-warm-200 last:border-0">
                    <div className="text-sm font-medium text-charcoal-900">{c.full_name}</div>
                    <div className="text-xs text-charcoal-400">{c.phone}{c.last_visit_date ? ` · last visit ${new Date(c.last_visit_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}</div>
                  </button>
                ))}
                {!phoneResults.length && <div className="px-3 py-2 text-xs text-charcoal-400">New client — will be created</div>}
              </div>
            )}
          </div>

          {/* Client name */}
          <div>
            <label className="block text-[10px] font-bold tracking-widest uppercase text-charcoal-400 mb-1">Client Name *</label>
            <input type="text" value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Full name"
              className="w-full bg-warm-200 border border-warm-300 rounded-xl px-3 py-2 text-sm text-charcoal-900 outline-none focus:border-od-green" />
            {!foundClientId && clientName && (
              <div className="text-[10px] text-charcoal-400 mt-1">New client — will be saved on book</div>
            )}
          </div>

          {/* Service + Price */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold tracking-widest uppercase text-charcoal-400 mb-1">Service</label>
              <select value={serviceId} onChange={e => onServiceChange(e.target.value)}
                className="w-full bg-warm-200 border border-warm-300 rounded-xl px-3 py-2 text-sm text-charcoal-900 outline-none focus:border-od-green">
                <option value="">Select…</option>
                {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold tracking-widest uppercase text-charcoal-400 mb-1">Price</label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-charcoal-400 text-sm">$</span>
                <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="0"
                  className="w-full bg-warm-200 border border-warm-300 rounded-xl pl-6 pr-3 py-2 text-sm text-charcoal-900 outline-none focus:border-od-green" />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[10px] font-bold tracking-widest uppercase text-charcoal-400 mb-1">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Optional…"
              className="w-full bg-warm-200 border border-warm-300 rounded-xl px-3 py-2 text-sm text-charcoal-900 outline-none focus:border-od-green resize-none" />
          </div>

          {error && <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-warm-200 flex-shrink-0">
          <button onClick={submit} disabled={submitting || !clientName || !phone}
            className="w-full py-3 bg-od-green hover:opacity-90 text-white font-bold text-sm rounded-xl transition-opacity disabled:opacity-50">
            {submitting ? 'Booking…' : 'Book Appointment'}
          </button>
        </div>
      </div>
    </div>
  )
}
