'use client'
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useVerticalLabels } from '@/lib/VerticalContext'

type WalkIn = {
  id: string
  client_name: string
  client_phone: string
  requested_barber_id: string | null
  service_id: string | null
  status: string
  created_at: string
}

type Barber = { id: string; barber_id: string; barber_name: string; alias: string }
type Service = { id: string; name: string; price: number }

// Shared by app/dashboard/page.tsx (owner, shop-wide) and
// app/dashboard/chair/page.tsx (staff, same shop). When actingBarberId is
// set, "Start Service" assigns to that staff member directly (the chair
// dashboard case). When it's null, the caller must pick a barber per row
// first (the owner dashboard case, since the owner isn't a specific
// staff member).
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
  const supabase = createClient()
  const { staffLabel } = useVerticalLabels()
  const [queue, setQueue] = useState<WalkIn[]>([])
  const [assignBarber, setAssignBarber] = useState<{ [id: string]: string }>({})
  const [busy, setBusy] = useState<{ [id: string]: boolean }>({})

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('walk_ins')
      .select('*')
      .eq('shop_id', shopId)
      .eq('status', 'waiting')
      .order('created_at', { ascending: true })
    setQueue(data || [])
  }, [shopId])

  useEffect(() => {
    load()
    const interval = setInterval(load, 20000)
    return () => clearInterval(interval)
  }, [load])

  async function startService(walkIn: WalkIn) {
    const barberId = actingBarberId || assignBarber[walkIn.id]
    if (!barberId) return
    setBusy(prev => ({ ...prev, [walkIn.id]: true }))

    const service = services.find(s => s.id === walkIn.service_id)
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const time24 = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`

    // Same lookup-or-create + client-generated-UUID pattern already
    // proven in app/dashboard/chair/page.tsx's handleWalkIn().
    const normalizedPhone = walkIn.client_phone.replace(/\D/g, '')
    let clientId: string | null = null
    const { data: rpcData } = await supabase
      .rpc('find_client_for_booking', { p_phone: normalizedPhone, p_shop_id: shopId })
    const existing = rpcData?.[0]
    if (existing?.client_id) {
      clientId = existing.client_id
    } else {
      const newId = crypto.randomUUID()
      const { error: newClientErr } = await supabase
        .from('clients')
        .insert({ id: newId, full_name: walkIn.client_name, phone: normalizedPhone })
      clientId = newClientErr ? null : newId
    }

    if (clientId) {
      fetch('/api/book/membership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, shopId }),
      }).catch(() => {})
    }

    await supabase.from('appointments').insert({
      shop_id: shopId,
      barber_id: barberId,
      service_id: walkIn.service_id,
      client_id: clientId,
      client_name: walkIn.client_name,
      client_phone: walkIn.client_phone,
      date: today,
      time: time24,
      price: service?.price ?? 0,
      status: 'confirmed',
    })

    await supabase.from('walk_ins').update({ status: 'in_service', called_at: new Date().toISOString() }).eq('id', walkIn.id)

    setBusy(prev => ({ ...prev, [walkIn.id]: false }))
    await load()
    onConverted?.()
  }

  async function dismiss(id: string) {
    setBusy(prev => ({ ...prev, [id]: true }))
    await supabase.from('walk_ins').update({ status: 'cancelled' }).eq('id', id)
    setBusy(prev => ({ ...prev, [id]: false }))
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
      <div className="space-y-2">
        {queue.map(w => {
          const requested = barbers.find(b => b.barber_id === w.requested_barber_id)
          return (
            <div key={w.id} className="flex items-center justify-between gap-3 bg-warm-50 border border-warm-200 rounded-lg px-4 py-3">
              <div>
                <div className="text-sm font-medium text-charcoal-900">{w.client_name}</div>
                <div className="text-xs text-charcoal-500">
                  {requested ? `Requested ${requested.barber_name || requested.alias}` : `No ${staffLabel.toLowerCase()} preference`}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!actingBarberId && (
                  <select
                    value={assignBarber[w.id] || w.requested_barber_id || ''}
                    onChange={e => setAssignBarber(prev => ({ ...prev, [w.id]: e.target.value }))}
                    className="bg-warm-200 border border-warm-300 rounded-lg px-2 py-1.5 text-xs text-charcoal-900 outline-none"
                  >
                    <option value="">Assign {staffLabel.toLowerCase()}...</option>
                    {barbers.map(b => (
                      <option key={b.id} value={b.barber_id}>{b.barber_name || b.alias}</option>
                    ))}
                  </select>
                )}
                <button
                  onClick={() => startService(w)}
                  disabled={busy[w.id] || (!actingBarberId && !assignBarber[w.id] && !w.requested_barber_id)}
                  className="bg-od-green hover:bg-od-green-light disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                >
                  Start Service
                </button>
                <button
                  onClick={() => dismiss(w.id)}
                  disabled={busy[w.id]}
                  className="text-charcoal-500 hover:text-charcoal-300 text-xs px-2 py-1.5 transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
