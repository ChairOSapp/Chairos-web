'use client'
import { useMemo } from 'react'

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
  shopId: string
  appointments: Appointment[]
  barbers: ShopBarber[]
  isBarber?: boolean
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function fmt(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

interface InsightCard {
  icon: string
  text: string
  action: string
  href: string
}

export default function OpportunitiesSection({ shopId: _shopId, appointments, barbers, isBarber = false }: Props) {
  const cards = useMemo<InsightCard[]>(() => {
    const now = new Date()
    const today = fmt(now)
    const nowMs = new Date(today + 'T12:00:00').getTime()
    const done = appointments.filter(a => ['done', 'completed'].includes(a.status))
    const result: InsightCard[] = []

    // Card 1 — Slowest Day (last 30 days)
    const last30Start = fmt(new Date(nowMs - 30 * 86400000))
    const dayCountMap: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }
    for (const a of done.filter(a => a.date >= last30Start)) {
      const dw = new Date(a.date + 'T12:00:00').getDay()
      dayCountMap[dw] = (dayCountMap[dw] || 0) + 1
    }
    const dayEntries = Object.entries(dayCountMap).map(([d, c]) => ({ day: parseInt(d), count: c }))
    const slowestDayEntry = dayEntries.sort((a, b) => a.count - b.count)[0]
    if (slowestDayEntry) {
      const dayName = DAY_NAMES[slowestDayEntry.day]
      result.push({
        icon: 'Slowest Day',
        text: `Fill ${dayName} slots — only ${slowestDayEntry.count} cuts on ${dayName}s recently`,
        action: `Boost ${dayName} bookings →`,
        href: `/dashboard/campaigns?intent=${encodeURIComponent(`Boost ${dayName} bookings with a ${dayName} special`)}`,
      })
    }

    // Card 2 — Gone Cold count (60+ days)
    const clientLast: Record<string, number> = {}
    for (const a of done) {
      if (!a.client_id) continue
      const t = new Date(a.date + 'T12:00:00').getTime()
      if (!clientLast[a.client_id] || t > clientLast[a.client_id]) clientLast[a.client_id] = t
    }
    const coldCount = Object.values(clientLast).filter(t => (nowMs - t) / 86400000 >= 60).length
    if (coldCount > 0) {
      result.push({
        icon: 'Gone Cold',
        text: `${coldCount} clients have gone cold since their last visit`,
        action: 'Win them back →',
        href: `/dashboard/campaigns?intent=${encodeURIComponent(`Win back ${coldCount} gone-cold clients`)}`,
      })
    }

    // Card 3 — Lowest come-back barber (min 5 first-timers)
    let lowestBarber: { name: string; rate: number } | null = null
    for (const b of barbers) {
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
      const ftCount = Object.keys(first).length
      if (ftCount < 5) continue
      let ret = 0
      for (const [cid, ft0] of Object.entries(first)) {
        if ((all[cid] || []).some(t => t > ft0 && t - ft0 <= 60 * 86400000)) ret++
      }
      const rate = ret / ftCount
      if (!lowestBarber || rate < lowestBarber.rate) {
        lowestBarber = { name: b.barber_name || b.alias || 'Barber', rate }
      }
    }
    if (lowestBarber) {
      result.push({
        icon: 'Come-Back Rate',
        text: `${lowestBarber.name} has a ${(lowestBarber.rate * 100).toFixed(0)}% come-back rate — help clients rebook with them`,
        action: `Boost rebooking →`,
        href: `/dashboard/campaigns?intent=${encodeURIComponent(`Boost rebooking rate for ${lowestBarber.name}`)}`,
      })
    }

    // Card 4 — Lightest upcoming day (next 7 days)
    const next7 = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(nowMs + (i + 1) * 86400000)
      return { date: d.toISOString().split('T')[0], label: d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) }
    })
    const upcomingCounts: Record<string, number> = {}
    for (const { date } of next7) upcomingCounts[date] = 0
    for (const a of appointments.filter(a => next7.some(d => d.date === a.date))) {
      upcomingCounts[a.date] = (upcomingCounts[a.date] || 0) + 1
    }
    const lightestDay = next7.sort((a, b) => upcomingCounts[a.date] - upcomingCounts[b.date])[0]
    if (lightestDay) {
      result.push({
        icon: 'Light Day',
        text: `${lightestDay.label} has only ${upcomingCounts[lightestDay.date]} bookings — fill it now`,
        action: 'Fill slots →',
        href: `/dashboard/campaigns?intent=${encodeURIComponent(`Fill ${lightestDay.label} appointment slots`)}`,
      })
    }

    return result.slice(0, 4)
  }, [appointments, barbers])

  if (cards.length === 0) return null

  return (
    <div className="mb-4">
      <div className="font-serif text-2xl text-charcoal-900 mb-4">Money Left on the Table</div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {cards.map((card, i) => (
          <div key={i} className="bg-warm-100 border border-warm-200 rounded-xl p-4">
            <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-1">{card.icon}</div>
            <p className="text-sm text-charcoal-900 mb-3">{card.text}</p>
            {!isBarber && (
              <a
                href={card.href}
                className="text-xs font-semibold text-od-green hover:text-od-green-light transition-colors"
              >
                {card.action}
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
