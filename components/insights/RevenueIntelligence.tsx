'use client'
import { useMemo } from 'react'

interface Appointment {
  id: string
  date: string
  time?: string | null
  price: number
  barber_id: string
  status: string
}

interface Tip {
  id: string
  amount: number
  created_at: string
  barber_id: string
}

interface Props {
  shopId: string
  period: string
  appointments: Appointment[]
  tips: Tip[]
}

function getISOWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

function getPeriodStart(period: string): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  if (period === 'today') return fmt(now)
  if (period === 'week') { const d = new Date(now); d.setDate(d.getDate() - 7); return fmt(d) }
  if (period === 'month') { const d = new Date(now); d.setDate(d.getDate() - 30); return fmt(d) }
  if (period === 'quarter') { const d = new Date(now); d.setDate(d.getDate() - 90); return fmt(d) }
  if (period === 'year') return `${now.getFullYear()}-01-01`
  const d = new Date(now); d.setDate(d.getDate() - 30); return fmt(d)
}

function fmt(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Simple SVG polyline chart
function MiniLineChart({ weeks, data }: { weeks: string[]; data: Record<string, number> }) {
  const values = weeks.map(w => data[w] || 0)
  if (values.every(v => v === 0)) {
    return <div className="text-xs text-charcoal-400 text-center py-3">Not enough data for trend</div>
  }

  const W = 500; const H = 80
  const LEFT = 4; const RIGHT = 4; const TOP = 6; const BOT = 6
  const cW = W - LEFT - RIGHT; const cH = H - TOP - BOT
  const maxV = Math.max(...values, 1)
  const toX = (i: number) => LEFT + (i / Math.max(values.length - 1, 1)) * cW
  const toY = (v: number) => TOP + cH - (v / maxV) * cH

  const points = values.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ')
  const areaPoints = `${LEFT},${TOP + cH} ${points} ${LEFT + cW},${TOP + cH}`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: `${H}px` }} preserveAspectRatio="none">
      <polygon points={areaPoints} fill="#4B5320" opacity="0.08" />
      <polyline points={points} fill="none" stroke="#4B5320" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function RevenueIntelligence({ shopId: _shopId, period, appointments, tips }: Props) {
  const today = fmt(new Date())
  const periodStart = getPeriodStart(period)

  const m = useMemo(() => {
    const done = appointments.filter(a =>
      ['done', 'completed'].includes(a.status) && a.date >= periodStart && a.date <= today
    )
    const totalRev = done.reduce((s, a) => s + (parseFloat(String(a.price)) || 0), 0)
    const cuts = done.length
    const avgTicket = cuts > 0 ? totalRev / cuts : 0

    // Floor productivity: revenue / (cuts * 0.75 hours per slot)
    const chairHours = cuts * 0.75
    const floorProductivity = chairHours > 0 ? totalRev / chairHours : 0

    // Avg ticket trend by ISO week — last 8 weeks
    const weekData: Record<string, { rev: number; count: number }> = {}
    for (const a of done) {
      const wk = getISOWeek(new Date(a.date + 'T12:00:00'))
      if (!weekData[wk]) weekData[wk] = { rev: 0, count: 0 }
      weekData[wk].rev += parseFloat(String(a.price)) || 0
      weekData[wk].count++
    }
    const sortedWeeks = Object.keys(weekData).sort()
    const weekAvgTicket: Record<string, number> = {}
    for (const w of sortedWeeks) {
      weekAvgTicket[w] = weekData[w].count > 0 ? weekData[w].rev / weekData[w].count : 0
    }
    const lastWeek = sortedWeeks[sortedWeeks.length - 1]
    const prevWeek = sortedWeeks[sortedWeeks.length - 2]
    const ticketChange = lastWeek && prevWeek && weekAvgTicket[prevWeek] > 0
      ? ((weekAvgTicket[lastWeek] - weekAvgTicket[prevWeek]) / weekAvgTicket[prevWeek]) * 100
      : null

    // WoW total revenue
    const nowMs = new Date(today + 'T12:00:00').getTime()
    const w1Start = new Date(nowMs - 7 * 86400000).toISOString().split('T')[0]
    const w2Start = new Date(nowMs - 14 * 86400000).toISOString().split('T')[0]
    const thisWeekRev = done.filter(a => a.date >= w1Start).reduce((s, a) => s + (parseFloat(String(a.price)) || 0), 0)
    const lastWeekRev = done.filter(a => a.date >= w2Start && a.date < w1Start).reduce((s, a) => s + (parseFloat(String(a.price)) || 0), 0)
    const wowPct = lastWeekRev > 0 ? ((thisWeekRev - lastWeekRev) / lastWeekRev) * 100 : null

    // Last 4 calendar weeks WoW table
    const weekRows: { label: string; rev: number; cuts: number; pct: number | null }[] = []
    for (let i = 0; i < 4; i++) {
      const wEnd = new Date(nowMs - i * 7 * 86400000)
      const wStart = new Date(wEnd.getTime() - 7 * 86400000)
      const wStartStr = wStart.toISOString().split('T')[0]
      const wEndStr = wEnd.toISOString().split('T')[0]
      const wAppts = done.filter(a => a.date > wStartStr && a.date <= wEndStr)
      const wRev = wAppts.reduce((s, a) => s + (parseFloat(String(a.price)) || 0), 0)
      const wCuts = wAppts.length
      weekRows.push({
        label: i === 0 ? 'This week' : i === 1 ? 'Last week' : `${i + 1} weeks ago`,
        rev: wRev,
        cuts: wCuts,
        pct: null,
      })
    }
    // Fill pct vs prior
    for (let i = 0; i < weekRows.length - 1; i++) {
      const prior = weekRows[i + 1].rev
      weekRows[i].pct = prior > 0 ? ((weekRows[i].rev - prior) / prior) * 100 : null
    }

    return {
      avgTicket, totalRev, cuts, floorProductivity,
      ticketChange, sortedWeeks, weekAvgTicket,
      wowPct, weekRows,
    }
  }, [appointments, tips, periodStart, today])

  const showBundleSuggestion = m.ticketChange !== null && m.ticketChange < -5

  return (
    <div className="space-y-4 mb-4">
      {/* Avg Ticket Trend */}
      <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-warm-200 flex items-center justify-between">
          <div>
            <div className="font-serif text-charcoal-900">Avg Ticket Trend</div>
            <div className="text-xs text-charcoal-500 mt-0.5">Weekly average ticket price</div>
          </div>
          <div className="text-right">
            <div className="font-serif text-2xl text-charcoal-900">${m.avgTicket.toFixed(0)}</div>
            {m.ticketChange !== null && (
              <div className={`text-xs font-semibold mt-0.5 ${m.ticketChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {m.ticketChange >= 0 ? '▲' : '▼'} {Math.abs(m.ticketChange).toFixed(0)}% last wk
              </div>
            )}
          </div>
        </div>
        <div className="px-4 pt-3 pb-2">
          {m.sortedWeeks.length > 1 ? (
            <MiniLineChart weeks={m.sortedWeeks} data={m.weekAvgTicket} />
          ) : (
            <div className="text-xs text-charcoal-400 text-center py-3">Need more weeks of data for trend</div>
          )}
        </div>
        {showBundleSuggestion && (
          <div className="mx-4 mb-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-xs text-amber-800">
            Consider a service bundle to boost avg ticket
          </div>
        )}
      </div>

      {/* Floor Productivity KPI */}
      <div className="bg-warm-100 border border-warm-200 rounded-xl p-5 flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-1">Floor Productivity</div>
          <div className={`font-serif text-3xl ${m.floorProductivity >= 45 ? 'text-od-green' : 'text-amber-400'}`}>
            ${m.floorProductivity.toFixed(0)}<span className="text-base font-sans font-normal text-charcoal-500"> / chair hr</span>
          </div>
          <div className="text-xs text-charcoal-400 mt-1">Industry avg: ~$45/hr</div>
        </div>
        <div className="text-right">
          <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-1">This Week</div>
          <div className="font-mono text-xl font-semibold text-charcoal-900">${m.weekRows[0]?.rev.toFixed(0) ?? 0}</div>
          {m.wowPct !== null && (
            <div className={`text-xs font-semibold mt-0.5 ${m.wowPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {m.wowPct >= 0 ? '▲' : '▼'} {Math.abs(m.wowPct).toFixed(0)}% WoW
            </div>
          )}
        </div>
      </div>

      {/* Week-over-Week table */}
      {m.weekRows.length > 0 && (
        <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-warm-200">
            <div className="font-serif text-charcoal-900">Week-over-Week</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: '360px' }}>
              <thead>
                <tr className="border-b border-warm-200">
                  <th className="text-left px-5 py-2 text-[10px] font-bold tracking-widest uppercase text-charcoal-400">Week</th>
                  <th className="text-right px-4 py-2 text-[10px] font-bold tracking-widest uppercase text-charcoal-400">Revenue</th>
                  <th className="text-right px-4 py-2 text-[10px] font-bold tracking-widest uppercase text-charcoal-400">Cuts</th>
                  <th className="text-right px-5 py-2 text-[10px] font-bold tracking-widest uppercase text-charcoal-400">vs Prior</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-warm-200">
                {m.weekRows.map((row, i) => (
                  <tr key={i} className={i === 0 ? 'bg-warm-200/30' : ''}>
                    <td className="px-5 py-2.5 text-charcoal-900 font-medium">{row.label}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-charcoal-900">${row.rev.toFixed(0)}</td>
                    <td className="px-4 py-2.5 text-right text-charcoal-700">{row.cuts}</td>
                    <td className="px-5 py-2.5 text-right">
                      {row.pct !== null ? (
                        <span className={`text-xs font-semibold ${row.pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {row.pct >= 0 ? '▲' : '▼'} {Math.abs(row.pct).toFixed(0)}%
                        </span>
                      ) : (
                        <span className="text-xs text-charcoal-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
