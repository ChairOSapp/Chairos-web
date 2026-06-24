'use client'
import { useMemo } from 'react'
import { useRouter } from 'next/navigation'

interface Appointment {
  id: string
  date: string
  price: number
  barber_id: string
  status: string
  client_id?: string | null
}

interface ShopBarber {
  barber_id: string
  barber_name: string
  alias: string | null
}

interface Props {
  appointments: Appointment[]
  shopBarbers: ShopBarber[]
  today: string
}

export default function OpportunitiesSection({ appointments, shopBarbers, today }: Props) {
  const router = useRouter()

  const opps = useMemo(() => {
    const done = appointments.filter(a => a.status === 'done' || a.status === 'completed')
    const nowMs = new Date(today + 'T12:00:00').getTime()

    // 1. Slowest day this month by revenue
    const monthStart = today.slice(0, 7) + '-01'
    const dayRevMap: Record<string, { rev: number; name: string }> = {}
    for (const a of done.filter(a => a.date >= monthStart)) {
      const name = new Date(a.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' })
      if (!dayRevMap[name]) dayRevMap[name] = { rev: 0, name }
      dayRevMap[name].rev += parseFloat(String(a.price)) || 0
    }
    const slowestDay = Object.values(dayRevMap).sort((a, b) => a.rev - b.rev)[0] ?? null

    // 2. Lapsed clients (45–75 days since last cut)
    const clientLast: Record<string, number> = {}
    for (const a of done) {
      if (!a.client_id) continue
      const t = new Date(a.date + 'T12:00:00').getTime()
      if (!clientLast[a.client_id] || t > clientLast[a.client_id]) clientLast[a.client_id] = t
    }
    const lapsedCount = Object.values(clientLast).filter(t => {
      const d = (nowMs - t) / 86400000
      return d >= 45 && d <= 75
    }).length

    // 3. Barber with lowest come-back rate (min 5 first-timers)
    let lowestBarber: { name: string; rate: number } | null = null
    for (const b of shopBarbers) {
      const bDone = done.filter(a => a.barber_id === b.barber_id)
      const first: Record<string, number> = {}
      const all: Record<string, number[]> = {}
      for (const a of bDone) {
        if (!a.client_id) continue
        const t = new Date(a.date + 'T12:00:00').getTime()
        if (first[a.client_id] === undefined || t < first[a.client_id]) first[a.client_id] = t
        if (!all[a.client_id]) all[a.client_id] = []
        all[a.client_id].push(t)
      }
      const ft = Object.keys(first).length
      if (ft < 5) continue
      let ret = 0
      for (const [cid, ft0] of Object.entries(first)) {
        if ((all[cid] || []).some(t => t > ft0 && t - ft0 <= 60 * 86400000)) ret++
      }
      const rate = ret / ft
      if (!lowestBarber || rate < lowestBarber.rate) {
        lowestBarber = { name: b.barber_name || b.alias || 'Barber', rate }
      }
    }

    // 4. Open days in next 7 days
    const next7 = Array.from({ length: 7 }, (_, i) => new Date(nowMs + (i + 1) * 86400000).toISOString().split('T')[0])
    const booked = new Set(appointments.filter(a => next7.includes(a.date)).map(a => a.date))
    const openDays = next7.filter(d => !booked.has(d))

    return { slowestDay, lapsedCount, lowestBarber, openDays }
  }, [appointments, shopBarbers, today])

  const cards = [
    opps.slowestDay && {
      title: `Slowest day: ${opps.slowestDay.name}`,
      sub: `$${opps.slowestDay.rev.toFixed(0)} this month — fill these seats`,
      intent: `Fill slow ${opps.slowestDay.name} slots with a special offer`,
    },
    opps.lapsedCount > 0 && {
      title: `${opps.lapsedCount} clients approaching lapse`,
      sub: `45–75 days out — reach them before they go cold`,
      intent: `Reactivate clients who haven't booked in 60 days`,
    },
    opps.lowestBarber && {
      title: `${opps.lowestBarber.name}: ${(opps.lowestBarber.rate * 100).toFixed(0)}% come-back rate`,
      sub: `Below average — help them build a loyal clientele`,
      intent: `Boost rebooking for ${opps.lowestBarber.name}'s new clients`,
    },
    opps.openDays.length > 0 && {
      title: `${opps.openDays.length} open day${opps.openDays.length > 1 ? 's' : ''} next 7 days`,
      sub: opps.openDays.map(d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })).join(', '),
      intent: `Fill open slots next week — limited availability`,
    },
  ].filter(Boolean) as { title: string; sub: string; intent: string }[]

  if (cards.length === 0) return null

  return (
    <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden mb-4">
      <div className="px-5 py-4 border-b border-warm-200">
        <div className="font-serif text-charcoal-900">Campaign Opportunities</div>
        <div className="text-xs text-charcoal-500 mt-0.5">Turn these insights into revenue — one tap to create a campaign</div>
      </div>
      <div className="divide-y divide-warm-200">
        {cards.map((card, i) => (
          <div key={i} className="px-5 py-4 flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-charcoal-900">{card.title}</div>
              <div className="text-xs text-charcoal-500 mt-0.5">{card.sub}</div>
            </div>
            <button
              onClick={() => router.push(`/dashboard/campaigns?intent=${encodeURIComponent(card.intent)}`)}
              className="flex-shrink-0 bg-od-green/10 border border-od-green/30 text-od-green text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-od-green/20 transition-colors"
            >
              Campaign
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
