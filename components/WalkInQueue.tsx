'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useVerticalLabels } from '@/lib/VerticalContext'
import { claimWalkIn, finishWalkIn, removeWalkIn, seatWalkIn, waitingLabel, type WalkIn } from '@/lib/walkIns'

type Barber = { id: string; barber_id: string; barber_name: string; alias: string }
type Service = { id: string; name: string; price: number }

// Shared by app/dashboard/page.tsx (owner, shop-wide) and
// app/dashboard/chair/page.tsx (staff, same shop). When actingBarberId is
// set, the viewer is a barber: they get one-tap Take (claim for themselves)
// plus Start. When it's null, the viewer is the owner: they get an Assign
// dropdown per row plus Start. When the shop has exactly one active barber
// (solo), all assignment ceremony is skipped: Start + Done only.
export default function WalkInQueue({
  shopId,
  shopCode,
  actingBarberId,
  barbers,
  services,
  onConverted,
}: {
  shopId: string
  shopCode?: string | null
  actingBarberId?: string | null
  barbers: Barber[]
  services: Service[]
  onConverted?: () => void
}) {
  const supabase = useMemo(() => createClient(), [])
  const { staffLabel } = useVerticalLabels()
  const [queue, setQueue] = useState<WalkIn[]>([])
  const [assignBarber, setAssignBarber] = useState<{ [id: string]: string }>({})
  const [busy, setBusy] = useState<{ [id: string]: boolean }>({})
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const solo = barbers.length === 1
  const soloBarberId = solo ? barbers[0].barber_id : null

  const flash = useCallback((msg: string) => {
    setNotice(msg)
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(null), 4500)
  }, [])

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('walk_ins')
      .select('*')
      .eq('shop_id', shopId)
      .eq('status', 'waiting')
      .order('created_at', { ascending: true })
    setQueue((data as WalkIn[]) || [])
  }, [shopId, supabase])

  useEffect(() => {
    load()
    const channel = supabase
      .channel(`walkin-queue-${shopId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'walk_ins', filter: `shop_id=eq.${shopId}` },
        load,
      )
      .subscribe()
    const interval = setInterval(load, 30000) // backup in case realtime drops
    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [load, shopId, supabase])

  const barberName = useCallback(
    (id?: string | null) => {
      if (!id) return ''
      const b = barbers.find(x => x.barber_id === id)
      return b?.barber_name || b?.alias || ''
    },
    [barbers],
  )

  async function take(walkIn: WalkIn) {
    if (!actingBarberId) return
    setBusy(prev => ({ ...prev, [walkIn.id]: true }))
    const result = await claimWalkIn(supabase, walkIn, actingBarberId)
    if (result === 'taken') flash('Someone already took this one — the queue is refreshed.')
    await load()
    setBusy(prev => ({ ...prev, [walkIn.id]: false }))
  }

  async function start(walkIn: WalkIn) {
    const barberId = soloBarberId || actingBarberId || assignBarber[walkIn.id] || walkIn.requested_barber_id
    if (!barberId) return
    setBusy(prev => ({ ...prev, [walkIn.id]: true }))
    const { taken, error } = await seatWalkIn(supabase, shopId, walkIn, barberId, services)
    if (taken) {
      flash('Someone already started this one — the queue is refreshed.')
    } else if (error) {
      flash(error)
    }
    setBusy(prev => ({ ...prev, [walkIn.id]: false }))
    await load()
    if (!taken && !error) onConverted?.()
  }

  async function done(walkIn: WalkIn) {
    setBusy(prev => ({ ...prev, [walkIn.id]: true }))
    const ok = await finishWalkIn(supabase, walkIn.id)
    if (!ok) flash('That one is already handled — the queue is refreshed.')
    setBusy(prev => ({ ...prev, [walkIn.id]: false }))
    await load()
  }

  async function dismiss(walkIn: WalkIn) {
    setBusy(prev => ({ ...prev, [walkIn.id]: true }))
    const ok = await removeWalkIn(supabase, walkIn.id)
    if (!ok) flash('That one is already handled — the queue is refreshed.')
    setBusy(prev => ({ ...prev, [walkIn.id]: false }))
    await load()
  }

  if (queue.length === 0) {
    if (!shopCode) return null
    return (
      <div className="bg-warm-100 border border-warm-200 rounded-xl px-5 py-4 mb-6">
        <p className="text-xs text-charcoal-500">
          No walk-ins waiting. Open <span className="font-mono text-od-green">chairos.cc/kiosk/{shopCode}</span> on a tablet at the front counter so people can check themselves in.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-warm-100 border border-warm-200 rounded-xl p-5 mb-6">
      <h3 className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-3">
        Walk-in Queue ({queue.length})
      </h3>
      {notice && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
          {notice}
        </div>
      )}
      <div className="space-y-2">
        {queue.map(w => {
          const requested = barberName(w.requested_barber_id)
          const service = services.find(s => s.id === w.service_id)
          const claimedByMe = !!actingBarberId && w.requested_barber_id === actingBarberId
          const claimedByOther = !!w.requested_barber_id && !claimedByMe
          const startBarberId = soloBarberId || actingBarberId || assignBarber[w.id] || w.requested_barber_id
          return (
            <div key={w.id} className="flex items-center justify-between gap-3 bg-warm-50 border border-warm-200 rounded-lg px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-charcoal-900">{w.client_name}</span>
                  <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 whitespace-nowrap">
                    {waitingLabel(w.created_at)}
                  </span>
                </div>
                <div className="text-xs text-charcoal-500 mt-0.5">
                  {service ? `${service.name} · ` : ''}
                  {requested ? `Wants ${requested}` : `No ${staffLabel.toLowerCase()} preference`}
                  {claimedByMe && <span className="text-od-green font-semibold"> · Yours</span>}
                  {claimedByOther && <span className="font-semibold"> · With {requested}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {solo ? (
                  <>
                    <button
                      onClick={() => start(w)}
                      disabled={busy[w.id]}
                      className="bg-od-green hover:opacity-90 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-opacity min-h-[44px]"
                    >
                      {busy[w.id] ? 'Working…' : 'Start'}
                    </button>
                    <button
                      onClick={() => done(w)}
                      disabled={busy[w.id]}
                      className="bg-warm-200 hover:bg-warm-300 disabled:opacity-50 text-charcoal-600 text-xs font-semibold px-3 py-2 rounded-lg transition-colors min-h-[44px]"
                    >
                      Done
                    </button>
                  </>
                ) : (
                  <>
                    {actingBarberId && !w.requested_barber_id && (
                      <button
                        onClick={() => take(w)}
                        disabled={busy[w.id]}
                        className="bg-od-green/10 hover:bg-od-green/20 disabled:opacity-50 text-od-green border border-od-green/30 text-xs font-semibold px-3 py-2 rounded-lg transition-colors min-h-[44px]"
                      >
                        Take
                      </button>
                    )}
                    {!actingBarberId && (
                      <select
                        value={assignBarber[w.id] || w.requested_barber_id || ''}
                        onChange={e => setAssignBarber(prev => ({ ...prev, [w.id]: e.target.value }))}
                        className="bg-warm-200 border border-warm-300 rounded-lg px-2 py-2 text-xs text-charcoal-900 outline-none min-h-[44px] max-w-[140px]"
                        aria-label={`Assign ${staffLabel.toLowerCase()}`}
                      >
                        <option value="">Assign {staffLabel.toLowerCase()}…</option>
                        {barbers.map(b => (
                          <option key={b.id} value={b.barber_id}>{b.barber_name || b.alias}</option>
                        ))}
                      </select>
                    )}
                    <button
                      onClick={() => start(w)}
                      disabled={busy[w.id] || !startBarberId}
                      className="bg-od-green hover:opacity-90 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-opacity min-h-[44px]"
                    >
                      {busy[w.id] ? 'Working…' : 'Start'}
                    </button>
                    <button
                      onClick={() => dismiss(w)}
                      disabled={busy[w.id]}
                      className="text-charcoal-500 hover:text-charcoal-300 text-xs px-2 py-2 transition-colors min-h-[44px]"
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
