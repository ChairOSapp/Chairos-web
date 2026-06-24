'use client'
import { useMemo } from 'react'

interface Appointment {
  id: string
  date: string
  price: number
  barber_id: string
  status: string
}

interface Props {
  appointments: Appointment[]
  shopBarbers: { barber_id: string }[]
  periodStart: string
  today: string
}

export default function RevenueIntelligence({ appointments, shopBarbers, periodStart, today }: Props) {
  const m = useMemo(() => {
    const done = appointments.filter(a => a.status === 'done' && a.date >= periodStart && a.date <= today)
    const totalRev = done.reduce((s, a) => s + (parseFloat(String(a.price)) || 0), 0)
    const avgTicket = done.length > 0 ? totalRev / done.length : 0

    // WoW
    const nowMs = new Date(today + 'T12:00:00').getTime()
    const w1Start = new Date(nowMs - 7 * 86400000).toISOString().split('T')[0]
    const w2Start = new Date(nowMs - 14 * 86400000).toISOString().split('T')[0]
    const thisWeek = done.filter(a => a.date >= w1Start).reduce((s, a) => s + (parseFloat(String(a.price)) || 0), 0)
    const lastWeek = done.filter(a => a.date >= w2Start && a.date < w1Start).reduce((s, a) => s + (parseFloat(String(a.price)) || 0), 0)
    const wowPct = lastWeek > 0 ? ((thisWeek - lastWeek) / lastWeek) * 100 : null

    // Floor productivity: revenue / barbers / days in period
    const periodMs = new Date(today + 'T12:00:00').getTime() - new Date(periodStart + 'T12:00:00').getTime()
    const periodDays = Math.max(1, Math.ceil(periodMs / 86400000))
    const barberCount = Math.max(1, shopBarbers.length)
    const floorProductivity = totalRev / barberCount / periodDays

    // Avg ticket trend: first half vs second half
    const midMs = new Date(periodStart + 'T12:00:00').getTime() + periodMs / 2
    const mid = new Date(midMs).toISOString().split('T')[0]
    const fh = done.filter(a => a.date < mid)
    const sh = done.filter(a => a.date >= mid)
    const fhAvg = fh.length > 0 ? fh.reduce((s, a) => s + (parseFloat(String(a.price)) || 0), 0) / fh.length : 0
    const shAvg = sh.length > 0 ? sh.reduce((s, a) => s + (parseFloat(String(a.price)) || 0), 0) / sh.length : 0
    const ticketTrend = fhAvg > 0 ? ((shAvg - fhAvg) / fhAvg) * 100 : null

    return { avgTicket, totalRev, thisWeek, lastWeek, wowPct, floorProductivity, ticketTrend, cuts: done.length }
  }, [appointments, shopBarbers, periodStart, today])

  return (
    <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden mb-4">
      <div className="px-5 py-4 border-b border-warm-200">
        <div className="font-serif text-charcoal-900">Revenue Intelligence</div>
        <div className="text-xs text-charcoal-500 mt-0.5">Money on the floor — and where to find more</div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 divide-warm-200" style={{ borderCollapse: 'collapse' } as any}>
        {[
          {
            label: 'Avg Ticket',
            value: `$${m.avgTicket.toFixed(0)}`,
            sub: m.ticketTrend !== null
              ? { up: m.ticketTrend >= 0, text: `${Math.abs(m.ticketTrend).toFixed(0)}% trend` }
              : null,
          },
          {
            label: 'This Week',
            value: `$${m.thisWeek.toFixed(0)}`,
            sub: m.wowPct !== null
              ? { up: m.wowPct >= 0, text: `${Math.abs(m.wowPct).toFixed(0)}% WoW` }
              : null,
          },
          {
            label: 'Floor / Chair / Day',
            value: `$${m.floorProductivity.toFixed(0)}`,
            plain: 'avg per barber per day',
          },
          {
            label: 'Total Cuts',
            value: String(m.cuts),
            plain: `$${m.totalRev.toFixed(0)} revenue`,
          },
        ].map((card, i) => (
          <div key={i} className={`p-4 border-warm-200 ${i > 0 ? 'border-l' : ''} ${i >= 2 ? 'border-t' : ''} md:border-t-0`}>
            <div className="text-[10px] font-semibold tracking-widest uppercase text-charcoal-400 mb-1">{card.label}</div>
            <div className="font-serif text-2xl text-charcoal-900">{card.value}</div>
            {card.sub && (
              <div className={`text-xs font-semibold mt-1 ${card.sub.up ? 'text-green-400' : 'text-red-400'}`}>
                {card.sub.up ? '▲' : '▼'} {card.sub.text}
              </div>
            )}
            {card.plain && <div className="text-[10px] text-charcoal-400 mt-1">{card.plain}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}
