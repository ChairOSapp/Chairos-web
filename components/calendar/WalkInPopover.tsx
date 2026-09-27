'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useVerticalLabels } from '@/lib/VerticalContext'
import { ModalPanel } from '@/components/motion'
import { tint } from './calendarTheme'
import { claimWalkIn, finishWalkIn, removeWalkIn, seatWalkIn, waitingLabel, type WalkIn, type WalkInService } from '@/lib/walkIns'

interface BarberOpt {
  barber_id: string
  barber_name: string
  alias?: string | null
}

interface Props {
  walkIn: WalkIn
  shopId: string
  barbers: BarberOpt[]
  services: WalkInService[]
  /** Owner view: sees the Assign dropdown. Staff view: sees Take. */
  isOwner: boolean
  /** Logged-in barber id (staff view) — used for Take. */
  actingBarberId?: string | null
  /** Solo shop: skip all assignment ceremony. */
  solo: boolean
  x: number
  y: number
  onClose: () => void
  onChanged: () => void
}

export default function WalkInPopover({
  walkIn, shopId, barbers, services, isOwner, actingBarberId, solo, x, y, onClose, onChanged,
}: Props) {
  const { staffLabel } = useVerticalLabels()
  const supabase = useMemo(() => createClient(), [])
  const ref = useRef<HTMLDivElement>(null)
  const [saving, setSaving] = useState(false)
  const [assignId, setAssignId] = useState(walkIn.requested_barber_id || '')
  const [notice, setNotice] = useState<string | null>(null)

  const soloBarberId = solo && barbers.length === 1 ? barbers[0].barber_id : null
  const service = services.find(s => s.id === walkIn.service_id)
  const requestedName = walkIn.requested_barber_id
    ? barbers.find(b => b.barber_id === walkIn.requested_barber_id)?.barber_name || 'Someone'
    : null
  const claimedByMe = !!actingBarberId && walkIn.requested_barber_id === actingBarberId
  const claimedByOther = !!walkIn.requested_barber_id && !claimedByMe
  const initials = (walkIn.client_name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

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

  async function take() {
    if (!actingBarberId) return
    setSaving(true)
    const result = await claimWalkIn(supabase, walkIn, actingBarberId)
    setSaving(false)
    if (result === 'taken') {
      setNotice('Someone already took this one.')
      onChanged()
      return
    }
    onChanged()
    onClose()
  }

  async function start() {
    const barberId = soloBarberId || actingBarberId || assignId || walkIn.requested_barber_id
    if (!barberId) return
    setSaving(true)
    const { taken, error } = await seatWalkIn(supabase, shopId, walkIn, barberId, services)
    setSaving(false)
    if (taken) {
      setNotice('Someone already started this one.')
      onChanged()
      return
    }
    if (error) {
      setNotice(error)
      return
    }
    onChanged()
    onClose()
  }

  async function done() {
    setSaving(true)
    const ok = await finishWalkIn(supabase, walkIn.id)
    setSaving(false)
    if (!ok) setNotice('That one is already handled.')
    onChanged()
    onClose()
  }

  async function remove() {
    setSaving(true)
    const ok = await removeWalkIn(supabase, walkIn.id)
    setSaving(false)
    if (!ok) setNotice('That one is already handled.')
    onChanged()
    onClose()
  }

  const startBarberId = soloBarberId || actingBarberId || assignId || walkIn.requested_barber_id

  return (
    <div ref={ref} className="fixed z-[200]" style={{ left: pos.left, top: pos.top }}>
      <ModalPanel className="w-80 max-w-[calc(100vw-16px)] bg-warm-100 border border-warm-200 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-4 pt-4 flex items-start gap-3">
          <div
            className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 border-2 border-dashed border-amber-500"
            style={{ background: tint('#d97706', 0.12), color: '#b45309' }}
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-charcoal-900 text-[15px] truncate">{walkIn.client_name}</div>
            {walkIn.client_phone && (
              <a href={`tel:${walkIn.client_phone}`} className="text-[13px] text-od-green hover:underline">
                {walkIn.client_phone}
              </a>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 -mr-1 -mt-1 rounded-full flex items-center justify-center text-charcoal-400 hover:bg-warm-200 hover:text-charcoal-900 text-xl leading-none transition-colors flex-shrink-0"
          >
            ×
          </button>
        </div>
        <div className="px-4 pt-2 flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase bg-amber-50 text-amber-700 border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Walk-in
          </span>
          <span className="text-xs text-charcoal-500 font-medium">{waitingLabel(walkIn.created_at)}</span>
        </div>

        {/* Details */}
        <div className="px-4 py-3 space-y-1.5">
          {service && (
            <div className="flex items-start justify-between gap-3">
              <span className="text-xs text-charcoal-400 pt-0.5">Service</span>
              <span className="text-[13px] font-medium text-charcoal-900 text-right">{service.name}</span>
            </div>
          )}
          <div className="flex items-start justify-between gap-3">
            <span className="text-xs text-charcoal-400 pt-0.5">Wants</span>
            <span className="text-[13px] font-medium text-charcoal-900 text-right">
              {requestedName ? `${requestedName}` : `No ${staffLabel.toLowerCase()} preference`}
            </span>
          </div>
          {claimedByMe && (
            <div className="text-[13px] font-semibold text-od-green text-right">Claimed by you</div>
          )}
          {claimedByOther && (
            <div className="text-[13px] font-semibold text-charcoal-600 text-right">Claimed by {requestedName}</div>
          )}
        </div>

        {notice && (
          <div className="mx-4 mb-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
            {notice}
          </div>
        )}

        {/* Actions */}
        <div className="px-4 py-3 border-t border-warm-200 space-y-2">
          {solo ? (
            <>
              <button onClick={start} disabled={saving}
                className="w-full py-3 rounded-xl text-sm font-bold bg-od-green text-white hover:opacity-90 disabled:opacity-50 transition-opacity">
                {saving ? 'Working…' : 'Start service'}
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={done} disabled={saving}
                  className="py-2.5 rounded-xl text-xs font-bold bg-warm-200 text-charcoal-600 border border-warm-300 hover:bg-warm-300 disabled:opacity-50 transition-colors">
                  Done
                </button>
                <button onClick={remove} disabled={saving}
                  className="py-2.5 rounded-xl text-xs font-bold bg-red-50 text-red-500 border border-red-200 hover:bg-red-100 disabled:opacity-50 transition-colors">
                  Remove
                </button>
              </div>
            </>
          ) : (
            <>
              {!isOwner && actingBarberId && !walkIn.requested_barber_id && (
                <button onClick={take} disabled={saving}
                  className="w-full py-2.5 rounded-xl text-[13px] font-bold bg-od-green/10 text-od-green border border-od-green/30 hover:bg-od-green/20 disabled:opacity-50 transition-colors">
                  {saving ? 'Working…' : 'Take — it’s mine'}
                </button>
              )}
              {isOwner && (
                <select
                  value={assignId}
                  onChange={e => setAssignId(e.target.value)}
                  className="w-full bg-warm-200 border border-warm-300 rounded-xl px-3 py-2.5 text-sm text-charcoal-900 outline-none"
                  aria-label={`Assign ${staffLabel.toLowerCase()}`}
                >
                  <option value="">Assign {staffLabel.toLowerCase()}…</option>
                  {barbers.map(b => (
                    <option key={b.barber_id} value={b.barber_id}>{b.barber_name || b.alias}</option>
                  ))}
                </select>
              )}
              <button onClick={start} disabled={saving || !startBarberId}
                className="w-full py-3 rounded-xl text-sm font-bold bg-od-green text-white hover:opacity-90 disabled:opacity-50 transition-opacity">
                {saving ? 'Working…' : 'Start service'}
              </button>
              <button onClick={remove} disabled={saving}
                className="w-full py-1.5 text-xs font-medium text-charcoal-400 hover:text-red-500 disabled:opacity-50 transition-colors">
                Remove from queue
              </button>
            </>
          )}
        </div>
      </ModalPanel>
    </div>
  )
}
