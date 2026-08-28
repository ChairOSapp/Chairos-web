'use client'
import { useEffect, useRef, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useVerticalLabels } from '@/lib/VerticalContext'
import ClientNotes from '@/components/ClientNotes'

interface Appointment {
  id: string
  client_name: string
  client_phone?: string
  client_id?: string
  shop_id?: string
  date: string
  time: string
  price: number
  status: string
  payment_status?: string
  barber_id?: string
  notes?: string
  serviceName?: string
}

interface Props {
  appointment: Appointment
  barberName: string
  x: number
  y: number
  isOwner: boolean
  onClose: () => void
  onUpdated: () => void
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  pending:   { label: 'Pending',   cls: 'bg-warm-200 text-charcoal-500' },
  confirmed: { label: 'Confirmed', cls: 'bg-blue-50 text-blue-600 border border-blue-200' },
  done:      { label: 'Done',      cls: 'bg-od-green/10 text-od-green border border-od-green/20' },
  noshow:    { label: 'No-show',   cls: 'bg-red-50 text-red-500 border border-red-200' },
  cancelled: { label: 'Cancelled', cls: 'bg-warm-200 text-charcoal-400' },
}

function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
function fmtTime(t: string) {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
}

export default function AppointmentPopover({ appointment, barberName, x, y, isOwner, onClose, onUpdated }: Props) {
  const { staffLabel, vertical } = useVerticalLabels()
  const [saving, setSaving] = useState(false)
  const [rescheduling, setRescheduling] = useState(false)
  const [newDate, setNewDate] = useState(appointment.date)
  const [newTime, setNewTime] = useState(appointment.time.slice(0, 5))
  const [reasonPromptFor, setReasonPromptFor] = useState<'noshow' | 'cancel' | null>(null)
  const [reasonText, setReasonText] = useState('')
  const [consentSignature, setConsentSignature] = useState<{ signed_pdf_path: string; signed_at: string } | null | undefined>(undefined)
  const ref = useRef<HTMLDivElement>(null)
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  const notDone = appointment.status !== 'done'
  const unpaid = appointment.payment_status !== 'paid'

  // Pre-session consent status (Task 5: staff see signed status + doc).
  // Determined purely from consent_form_signatures, which both owner and
  // staff have RLS access to — no need to also read consent_form_templates
  // (owner-only) just to show this badge.
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
    await supabase.from('appointments').update({
      status,
      ...(cancellationReason ? { cancellation_reason: cancellationReason } : {}),
    }).eq('id', appointment.id)
    setSaving(false)
    setReasonPromptFor(null)
    setReasonText('')
    onUpdated()
    onClose()
  }

  async function reschedule() {
    setSaving(true)
    await supabase.from('appointments').update({
      date: newDate,
      time: newTime + ':00',
    }).eq('id', appointment.id)
    setSaving(false)
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
      if (!res.ok) { alert(result.error || 'Failed to cancel appointment'); return }
      if (result.refunded) alert('Appointment cancelled and deposit refunded.')
    } finally {
      setSaving(false)
      setReasonPromptFor(null)
      setReasonText('')
      onUpdated()
      onClose()
    }
  }

  const badge = STATUS_LABELS[appointment.status] || STATUS_LABELS.pending

  return (
    <div
      ref={ref}
      className="fixed z-[200] w-72 bg-warm-100 border border-warm-200 rounded-2xl shadow-xl overflow-hidden"
      style={{ left: pos.left, top: pos.top }}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-warm-200 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-charcoal-900 text-sm truncate">{appointment.client_name}</div>
          {appointment.client_phone && (
            <a href={`tel:${appointment.client_phone}`} className="text-xs text-od-green hover:underline">{appointment.client_phone}</a>
          )}
        </div>
        <button onClick={onClose} className="text-charcoal-400 hover:text-charcoal-900 text-lg leading-none flex-shrink-0 mt-0.5">×</button>
      </div>

      {/* Details */}
      <div className="px-4 py-3 space-y-1.5 text-xs text-charcoal-600 border-b border-warm-200">
        <div className="flex items-center justify-between">
          <span className="text-charcoal-400">Service</span>
          <span className="font-medium text-charcoal-900">{appointment.serviceName || '—'}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-charcoal-400">Price</span>
          <span className="font-mono font-semibold text-charcoal-900">${Number(appointment.price).toFixed(0)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-charcoal-400">{staffLabel}</span>
          <span className="font-medium text-charcoal-900">{barberName}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-charcoal-400">When</span>
          <span className="font-medium text-charcoal-900">{fmtDate(appointment.date)} · {fmtTime(appointment.time)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-charcoal-400">Status</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-widest uppercase ${badge.cls}`}>{badge.label}</span>
        </div>
        {vertical === 'tattoo' && (
          <div className="flex items-center justify-between">
            <span className="text-charcoal-400">Consent</span>
            {consentSignature === undefined ? (
              <span className="text-charcoal-400">…</span>
            ) : consentSignature ? (
              <button onClick={viewConsentDoc} className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-widest uppercase bg-od-green/10 text-od-green border border-od-green/20 hover:bg-od-green/20 transition-colors">
                Signed · View
              </button>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-widest uppercase bg-red-50 text-red-500 border border-red-200">
                Not Signed
              </span>
            )}
          </div>
        )}
        {appointment.notes && (
          <div className="pt-1 text-charcoal-500 italic">{appointment.notes}</div>
        )}
      </div>

      {/* Client notes: cut preference, color formula, session notes — visible
          to the whole shop, not just whoever wrote them. Available here
          regardless of Client Lock status so a first-time client's first
          visit can still get a note for next time. */}
      {appointment.client_id && appointment.shop_id && (
        <div className="px-3 pt-2.5 border-b border-warm-200">
          <ClientNotes clientId={appointment.client_id} shopId={appointment.shop_id} mode="add-only" />
        </div>
      )}

      {/* Reschedule section */}
      {rescheduling && (
        <div className="px-4 py-3 border-b border-warm-200 space-y-2">
          <div className="text-[10px] font-bold tracking-widest uppercase text-charcoal-400 mb-1">Reschedule</div>
          <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
            className="w-full bg-warm-200 border border-warm-300 rounded-lg px-3 py-1.5 text-sm text-charcoal-900 outline-none focus:border-od-green" />
          <input type="time" value={newTime} onChange={e => setNewTime(e.target.value)}
            className="w-full bg-warm-200 border border-warm-300 rounded-lg px-3 py-1.5 text-sm text-charcoal-900 outline-none focus:border-od-green" />
          <div className="flex gap-2">
            <button onClick={reschedule} disabled={saving}
              className="flex-1 bg-od-green text-white text-xs font-semibold py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity">
              {saving ? 'Saving…' : 'Confirm'}
            </button>
            <button onClick={() => setRescheduling(false)}
              className="flex-1 bg-warm-200 text-charcoal-600 text-xs font-semibold py-1.5 rounded-lg hover:bg-warm-300 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Reason prompt: shown before confirming a cancel or no-show, optional */}
      {reasonPromptFor && (
        <div className="px-4 py-3 border-b border-warm-200 space-y-2">
          <div className="text-[10px] font-bold tracking-widest uppercase text-charcoal-400 mb-1">
            {reasonPromptFor === 'cancel' ? 'Reason for cancelling (optional)' : 'Reason for no-show (optional)'}
          </div>
          <input
            type="text"
            value={reasonText}
            onChange={e => setReasonText(e.target.value)}
            placeholder="e.g. client rescheduled elsewhere"
            autoFocus
            className="w-full bg-warm-200 border border-warm-300 rounded-lg px-3 py-1.5 text-sm text-charcoal-900 outline-none focus:border-od-green"
          />
          <div className="flex gap-2">
            <button
              onClick={() => reasonPromptFor === 'cancel' ? cancel(reasonText.trim() || undefined) : updateStatus('noshow', reasonText.trim() || undefined)}
              disabled={saving}
              className="flex-1 bg-od-green text-white text-xs font-semibold py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {saving ? 'Saving…' : 'Confirm'}
            </button>
            <button
              onClick={() => { setReasonPromptFor(null); setReasonText('') }}
              className="flex-1 bg-warm-200 text-charcoal-600 text-xs font-semibold py-1.5 rounded-lg hover:bg-warm-300 transition-colors"
            >
              Back
            </button>
          </div>
        </div>
      )}

      {/* Actions */}
      {!rescheduling && !reasonPromptFor && (
        <div className="px-3 py-2.5 flex flex-wrap gap-1.5">
          {/* POS Checkout — primary CTA for unpaid/not-done appointments */}
          {notDone && unpaid && (
            <button
              onClick={() => { onClose(); router.push(`/dashboard/pos/${appointment.id}`) }}
              className="w-full py-2 rounded-lg text-[12px] font-bold bg-od-green text-black hover:bg-od-green-light transition-colors mb-0.5"
            >
              Checkout — ${Number(appointment.price).toFixed(2)}
            </button>
          )}
          {appointment.status !== 'done' && (
            <button onClick={() => updateStatus('done')} disabled={saving}
              className="flex-1 min-w-[100px] py-1.5 rounded-lg text-[11px] font-semibold bg-od-green/10 text-od-green border border-od-green/30 hover:bg-od-green/20 disabled:opacity-50 transition-colors">
              ✓ Mark Done (no charge)
            </button>
          )}
          {appointment.status !== 'noshow' && (
            <button onClick={() => setReasonPromptFor('noshow')} disabled={saving}
              className="flex-1 min-w-[100px] py-1.5 rounded-lg text-[11px] font-semibold bg-red-50 text-red-500 border border-red-200 hover:bg-red-100 disabled:opacity-50 transition-colors">
              ✗ No Show
            </button>
          )}
          <button onClick={() => setRescheduling(true)}
            className="flex-1 min-w-[100px] py-1.5 rounded-lg text-[11px] font-semibold bg-warm-200 text-charcoal-600 border border-warm-300 hover:bg-warm-300 transition-colors">
            ↔ Reschedule
          </button>
          {isOwner && appointment.status !== 'cancelled' && (
            <button onClick={() => setReasonPromptFor('cancel')} disabled={saving}
              className="flex-1 min-w-[100px] py-1.5 rounded-lg text-[11px] font-semibold text-charcoal-400 hover:text-red-400 hover:border-red-200 border border-warm-300 transition-colors">
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  )
}
