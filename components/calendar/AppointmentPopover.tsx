'use client'
import { useEffect, useRef, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useVerticalLabels } from '@/lib/VerticalContext'
import ClientNotes from '@/components/ClientNotes'
import { ModalPanel } from '@/components/motion'
import { statusMeta, tint, fmtTime12, fmtDateLong, fmtPrice } from './calendarTheme'

interface Appointment {
  id: string
  client_name: string
  client_phone?: string
  client_id?: string
  shop_id?: string
  date: string
  time: string
  price: number | null
  status: string
  payment_status?: string
  barber_id?: string
  notes?: string
  serviceName?: string
}

interface Props {
  appointment: Appointment
  barberName: string
  /** Staff color for the avatar accent — falls back to brand olive. */
  accentColor?: string
  x: number
  y: number
  isOwner: boolean
  onClose: () => void
  onUpdated: () => void
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <span className="text-xs text-charcoal-400 flex-shrink-0 pt-0.5">{label}</span>
      <span className="text-[13px] font-medium text-charcoal-900 text-right">{children}</span>
    </div>
  )
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function toTimeStr(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function AppointmentPopover({ appointment, barberName, accentColor, x, y, isOwner, onClose, onUpdated }: Props) {
  const { staffLabel, vertical } = useVerticalLabels()
  const [saving, setSaving] = useState(false)
  const [rescheduling, setRescheduling] = useState(false)
  const [newDate, setNewDate] = useState(appointment.date)
  const [newTime, setNewTime] = useState(appointment.time.slice(0, 5))
  const [reasonPromptFor, setReasonPromptFor] = useState<'noshow' | 'cancel' | null>(null)
  const [reasonText, setReasonText] = useState('')
  const [opError, setOpError] = useState('')
  const [consentSignature, setConsentSignature] = useState<{ signed_pdf_path: string; signed_at: string } | null | undefined>(undefined)
  const ref = useRef<HTMLDivElement>(null)
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  const notDone = appointment.status !== 'done'
  const unpaid = appointment.payment_status !== 'paid'
  const meta = statusMeta(appointment.status)
  const accent = accentColor || '#4B5320'
  const initials = (appointment.client_name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  // Pre-session consent status (tattoo vertical). Determined purely from
  // consent_form_signatures, which both owner and staff have RLS access to.
  useEffect(() => {
    if (vertical !== 'tattoo' || !appointment.client_id || !appointment.shop_id) { setConsentSignature(null); return }
    let cancelled = false
    supabase
      .from('consent_form_signatures')
      .select('signed_pdf_path, signed_at')
      .eq('shop_id', appointment.shop_id)
      .eq('client_id', appointment.client_id)
      .order('signed_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => { if (!cancelled) setConsentSignature(data ?? null) })
    return () => { cancelled = true }
  }, [appointment.client_id, appointment.shop_id, vertical])

  async function viewConsentDoc() {
    if (!consentSignature) return
    const { data } = await supabase.storage.from('consent-signed').createSignedUrl(consentSignature.signed_pdf_path, 900)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  // position popover so it stays on screen
  const [pos, setPos] = useState({ left: x, top: y })
  useEffect(() => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left = x + 12
    let top = y + 12
    if (left + rect.width > vw - 8) left = x - rect.width - 12
    if (top + rect.height > vh - 8) top = y - rect.height - 12
    setPos({ left: Math.max(8, left), top: Math.max(8, top) })
  }, [x, y])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick) }
  }, [onClose])

  async function updateStatus(status: string, cancellationReason?: string) {
    setSaving(true)
    setOpError('')
    const { error } = await supabase.from('appointments').update({
      status,
      ...(cancellationReason ? { cancellation_reason: cancellationReason } : {}),
    }).eq('id', appointment.id)
    setSaving(false)
    if (error) { setOpError(error.message); return }
    setReasonPromptFor(null)
    setReasonText('')
    onUpdated()
    onClose()
  }

  async function reschedule() {
    setSaving(true)
    setOpError('')
    // Guard: never reschedule into the past.
    const todayStr = toDateStr(new Date())
    if (newDate < todayStr || (newDate === todayStr && newTime <= toTimeStr(new Date()))) {
      setOpError('Pick a future date and time.')
      setSaving(false)
      return
    }
    const { error } = await supabase.from('appointments').update({
      date: newDate,
      time: newTime + ':00',
    }).eq('id', appointment.id)
    setSaving(false)
    if (error) { setOpError(error.message); return }
    setRescheduling(false)
    onUpdated()
    onClose()
  }

  async function cancel(cancellationReason?: string) {
    setSaving(true)
    try {
      const res = await fetch(`/api/appointments/${appointment.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: cancellationReason || undefined }),
      })
      const result = await res.json()
      if (!res.ok) { alert(result.error || "Couldn't cancel that — please try again."); return }
      if (result.refunded) alert('Done — cancelled, and the deposit was refunded.')
    } finally {
      setSaving(false)
      setReasonPromptFor(null)
      setReasonText('')
      onUpdated()
      onClose()
    }
  }

  return (
    <div ref={ref} className="fixed z-[200]" style={{ left: pos.left, top: pos.top }}>
      <ModalPanel className="w-80 max-w-[calc(100vw-16px)] max-h-[85dvh] overflow-y-auto bg-warm-100 border border-warm-200 rounded-2xl shadow-2xl">
        {/* Header: who + status */}
        <div className="px-4 pt-4 flex items-start gap-3">
          <div
            className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
            style={{ background: tint(accent, 0.15), color: accent }}
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-charcoal-900 text-[15px] truncate">{appointment.client_name}</div>
            {appointment.client_phone && (
              <a href={`tel:${appointment.client_phone}`} className="text-[13px] text-od-green hover:underline">
                {appointment.client_phone}
              </a>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-11 h-11 -mr-2 -mt-2 rounded-full flex items-center justify-center text-charcoal-400 hover:bg-warm-200 hover:text-charcoal-900 text-xl leading-none transition-colors flex-shrink-0"
          >
            ×
          </button>
        </div>
        <div className="px-4 pt-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase bg-warm-200 text-charcoal-600">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.dot }} />
            {meta.label}
          </span>
        </div>

        {/* Price hero */}
        <div className="px-4 pt-3 pb-1 flex items-baseline gap-2 min-w-0">
          {appointment.price == null ? (
            <span className="font-serif text-[22px] leading-none text-amber-700">Price not set</span>
          ) : (
            <span className="font-serif text-[28px] leading-none text-charcoal-900">{fmtPrice(appointment.price)}</span>
          )}
          {appointment.serviceName && (
            <span className="text-[13px] text-charcoal-500 truncate">{appointment.serviceName}</span>
          )}
        </div>

        {/* Details */}
        <div className="px-4 py-2 divide-y divide-warm-200/70">
          <Row label="When">
            {fmtDateLong(appointment.date)} · {fmtTime12(appointment.time)}
          </Row>
          <Row label={staffLabel}>{barberName}</Row>
          <Row label="Payment">
            {unpaid ? (
              <span className="text-amber-700 font-semibold">Not paid yet</span>
            ) : (
              <span className="text-od-green font-semibold">Paid</span>
            )}
          </Row>
          {vertical === 'tattoo' && (
            <Row label="Consent">
              {consentSignature === undefined ? (
                <span className="text-charcoal-400">Checking…</span>
              ) : consentSignature ? (
                <button onClick={viewConsentDoc} className="text-od-green font-semibold hover:underline">
                  Signed — view form
                </button>
              ) : (
                <span className="text-red-500 font-semibold">Not signed yet</span>
              )}
            </Row>
          )}
        </div>

        {appointment.notes && (
          <div className="mx-4 mb-1 px-3 py-2 rounded-xl bg-warm-200/70 text-xs text-charcoal-600 italic">
            “{appointment.notes}”
          </div>
        )}

        {/* Client notes: cut preference, color formula, session notes — visible
            to the whole shop, not just whoever wrote them. */}
        {appointment.client_id && appointment.shop_id && (
          <div className="px-3 pt-2 border-t border-warm-200 mt-2">
            <ClientNotes clientId={appointment.client_id} shopId={appointment.shop_id} mode="add-only" />
          </div>
        )}

        {/* Reschedule */}
        {rescheduling && (
          <div className="px-4 py-3 border-t border-warm-200 space-y-2.5">
            <div className="text-[11px] font-bold tracking-widest uppercase text-charcoal-400">Pick a new time</div>
            {opError && <p className="text-xs text-red-500">{opError}</p>}
            <input type="date" value={newDate} min={toDateStr(new Date())} onChange={e => setNewDate(e.target.value)}
              className="w-full bg-warm-200 border border-warm-300 rounded-xl px-3 py-2 text-base text-charcoal-900 outline-none focus:border-od-green" />
            <input type="time" value={newTime} onChange={e => setNewTime(e.target.value)}
              className="w-full bg-warm-200 border border-warm-300 rounded-xl px-3 py-2 text-base text-charcoal-900 outline-none focus:border-od-green" />
            <div className="flex gap-2">
              <button onClick={reschedule} disabled={saving}
                className="flex-1 bg-od-green text-white text-[13px] font-bold py-2.5 min-h-[44px] rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity">
                {saving ? 'Saving…' : 'Save new time'}
              </button>
              <button onClick={() => setRescheduling(false)}
                className="flex-1 bg-warm-200 text-charcoal-600 text-[13px] font-semibold py-2.5 min-h-[44px] rounded-xl hover:bg-warm-300 transition-colors">
                Back
              </button>
            </div>
          </div>
        )}

        {/* Reason prompt before a cancel or no-show */}
        {reasonPromptFor && (
          <div className="px-4 py-3 border-t border-warm-200 space-y-2.5">
            <div className="text-[11px] font-bold tracking-widest uppercase text-charcoal-400">
              {reasonPromptFor === 'cancel' ? 'Why is it being cancelled?' : 'What happened?'} <span className="normal-case font-medium">(optional)</span>
            </div>
            <input
              type="text"
              value={reasonText}
              onChange={e => setReasonText(e.target.value)}
              placeholder="A quick note helps next time"
              autoFocus
              className="w-full bg-warm-200 border border-warm-300 rounded-xl px-3 py-2 text-base text-charcoal-900 outline-none focus:border-od-green"
            />
            <div className="flex gap-2">
              <button
                onClick={() => reasonPromptFor === 'cancel' ? cancel(reasonText.trim() || undefined) : updateStatus('noshow', reasonText.trim() || undefined)}
                disabled={saving}
                className="flex-1 bg-od-green text-white text-[13px] font-bold py-2.5 min-h-[44px] rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {saving ? 'Saving…' : 'Confirm'}
              </button>
              <button
                onClick={() => { setReasonPromptFor(null); setReasonText('') }}
                className="flex-1 bg-warm-200 text-charcoal-600 text-[13px] font-semibold py-2.5 min-h-[44px] rounded-xl hover:bg-warm-300 transition-colors"
              >
                Back
              </button>
            </div>
          </div>
        )}

        {/* Actions */}
        {!rescheduling && !reasonPromptFor && (
          <div className="px-4 py-3 border-t border-warm-200 space-y-2">
            {opError && <p className="text-xs text-red-500">{opError}</p>}
            {notDone && unpaid && (
              appointment.price == null ? (
                <button
                  onClick={() => { onClose(); if (isOwner) router.push('/dashboard/services') }}
                  className="w-full py-3 rounded-xl text-sm font-bold bg-[#8A9A3B]/15 text-[#8A9A3B] border border-[#8A9A3B]/40 hover:bg-[#8A9A3B]/25 transition-colors"
                >
                  {isOwner ? 'Set a price to check out' : 'Ask the owner to set a price first'}
                </button>
              ) : (
                <button
                  onClick={() => { onClose(); router.push(`/dashboard/pos/${appointment.id}`) }}
                  className="w-full py-3 rounded-xl text-sm font-bold bg-od-green text-white hover:opacity-90 transition-opacity"
                >
                  Check out · ${Number(appointment.price).toFixed(2)}
                </button>
              )
            )}
            <div className="grid grid-cols-3 gap-2">
              {appointment.status !== 'done' && (
                <button onClick={() => updateStatus('done')} disabled={saving}
                  className="py-2.5 min-h-[44px] rounded-xl text-xs font-bold bg-od-green/10 text-od-green border border-od-green/30 hover:bg-od-green/20 disabled:opacity-50 transition-colors">
                  Mark done
                </button>
              )}
              <button onClick={() => setRescheduling(true)}
                className="py-2.5 min-h-[44px] rounded-xl text-xs font-bold bg-warm-200 text-charcoal-600 border border-warm-300 hover:bg-warm-300 transition-colors">
                Reschedule
              </button>
              {appointment.status !== 'noshow' && (
                <button onClick={() => setReasonPromptFor('noshow')} disabled={saving}
                  className="py-2.5 min-h-[44px] rounded-xl text-xs font-bold bg-red-50 text-red-500 border border-red-200 hover:bg-red-100 disabled:opacity-50 transition-colors">
                  No-show
                </button>
              )}
            </div>
            {isOwner && appointment.status !== 'cancelled' && (
              <button onClick={() => setReasonPromptFor('cancel')} disabled={saving}
                className="w-full py-1.5 text-xs font-medium text-charcoal-400 hover:text-red-500 transition-colors">
                Cancel appointment
              </button>
            )}
          </div>
        )}
      </ModalPanel>
    </div>
  )
}
