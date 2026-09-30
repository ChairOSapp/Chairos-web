'use client'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type RiskLevel = 'High' | 'Medium'

interface AtRiskAppt {
  id: string
  clientName: string
  time: string
  barberName: string
  level: RiskLevel
  reasons: string[]
}

interface Forecast {
  booked: number
  walkInEstimate: number | null
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function money(n: number): string {
  return `$${n.toFixed(n >= 100 ? 0 : 2)}`
}

const ACTIVE_STATUSES = ['pending', 'confirmed']

/**
 * TodayIntelStrip — compact predictive intelligence for the owner dashboard.
 * All signals are simple heuristics computed from Supabase data (no LLM calls).
 */
export default function TodayIntelStrip({
  shopId,
  todayAppointments,
  barbers,
  quietClientCount,
}: {
  shopId: string
  todayAppointments: any[]
  barbers: any[]
  quietClientCount: number
}) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [forecast, setForecast] = useState<Forecast>({ booked: 0, walkInEstimate: null })
  const [atRisk, setAtRisk] = useState<AtRiskAppt[]>([])
  const [loaded, setLoaded] = useState(false)

  const todayStr = toDateStr(new Date())
  const weekday = new Date().getDay()
  const nowHM = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`

  const barberName = (barberId: string | null) => {
    if (!barberId) return 'Any'
    const b = barbers.find((x: any) => x.barber_id === barberId)
    return b ? b.barber_name || b.alias || 'Staff' : 'Staff'
  }

  // Booked revenue from today's live appointments (already loaded by the page).
  // No-shows are excluded: a booking that never showed up is not revenue.
  const bookedRevenue = useMemo(
    () =>
      todayAppointments
        .filter(a => a.status !== 'cancelled' && a.status !== 'noshow' && a.status !== 'no_show')
        .reduce((s, a) => s + (parseFloat(a.price) || 0), 0),
    [todayAppointments]
  )

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        // ---- 1. Walk-in estimate: avg walk-in revenue on this weekday over the past 8 weeks ----
        const pastWeekdays: string[] = []
        for (let w = 1; w <= 8; w++) {
          const d = new Date()
          d.setDate(d.getDate() - 7 * w) // whole weeks back => same weekday
          pastWeekdays.push(toDateStr(d))
        }
        const sixtyDaysAgo = toDateStr(new Date(Date.now() - 60 * 86400000))

        const [{ data: walkIns }, { data: slotHist }] = await Promise.all([
          supabase
            .from('appointments')
            .select('price, date')
            .eq('shop_id', shopId)
            .eq('source', 'walk_in')
            .in('date', pastWeekdays)
            .in('status', ['done', 'completed']),
          supabase
            .from('appointments')
            .select('date, time, status')
            .eq('shop_id', shopId)
            .gte('date', sixtyDaysAgo)
            .lt('date', todayStr),
        ])

        let walkInEstimate: number | null = null
        if (walkIns && walkIns.length > 0) {
          const byDay: Record<string, number> = {}
          for (const w of walkIns) byDay[w.date] = (byDay[w.date] ?? 0) + (parseFloat(w.price) || 0)
          const days = Object.values(byDay)
          // Need at least 2 historical weekdays with walk-ins for an honest estimate.
          if (days.length >= 2) walkInEstimate = days.reduce((s, v) => s + v, 0) / days.length
        }

        // ---- 2. At-risk appointments today ----
        const upcoming = todayAppointments.filter(
          a => ACTIVE_STATUSES.includes(a.status) && (a.time || '').slice(0, 5) >= nowHM
        )

        // Per-client no-show history (one query for all of today's clients).
        const clientIds = [...new Set(upcoming.map(a => a.client_id).filter(Boolean))] as string[]
        let clientHist: any[] = []
        if (clientIds.length > 0) {
          const { data } = await supabase
            .from('appointments')
            .select('client_id, status')
            .eq('shop_id', shopId)
            .in('client_id', clientIds)
            .lt('date', todayStr)
            .limit(500)
          clientHist = data ?? []
        }
        const clientStats: Record<string, { total: number; noshow: number }> = {}
        for (const h of clientHist) {
          const c = (clientStats[h.client_id] ??= { total: 0, noshow: 0 })
          c.total += 1
          if (h.status === 'noshow') c.noshow += 1
        }

        // Historically flaky (weekday, hour) slots, shop-wide, past 60 days.
        const slotStats: Record<string, { total: number; noshow: number }> = {}
        for (const h of slotHist ?? []) {
          const d = new Date(h.date + 'T12:00:00')
          const key = `${d.getDay()}-${(h.time || '').slice(0, 2)}`
          const s = (slotStats[key] ??= { total: 0, noshow: 0 })
          s.total += 1
          if (h.status === 'noshow') s.noshow += 1
        }

        const scored: AtRiskAppt[] = []
        for (const a of upcoming) {
          let score = 0
          const reasons: string[] = []

          const cs = a.client_id ? clientStats[a.client_id] : undefined
          const noshowRate = cs && cs.total >= 3 ? cs.noshow / cs.total : 0
          if (noshowRate >= 0.4) {
            score += 2
            reasons.push(`${cs!.noshow} no-show${cs!.noshow === 1 ? '' : 's'} before`)
          } else if (noshowRate >= 0.25) {
            score += 1
            reasons.push('spotty history')
          }

          // Booked less than 12h ahead of the appointment.
          if (a.created_at && a.date && a.time) {
            const apptAt = new Date(`${a.date}T${a.time}`).getTime()
            const bookedAt = new Date(a.created_at).getTime()
            if (!isNaN(apptAt) && !isNaN(bookedAt) && apptAt - bookedAt < 12 * 3600000) {
              score += 1
              reasons.push('booked last-minute')
            }
          }

          // Historically flaky time slot.
          const slotKey = `${weekday}-${(a.time || '').slice(0, 2)}`
          const ss = slotStats[slotKey]
          if (ss && ss.total >= 5 && ss.noshow / ss.total >= 0.3) {
            score += 1
            reasons.push('flaky time slot')
          }

          if (score >= 3) scored.push({ id: a.id, clientName: a.client_name || 'Client', time: (a.time || '').slice(0, 5), barberName: barberName(a.barber_id), level: 'High', reasons })
          else if (score >= 2) scored.push({ id: a.id, clientName: a.client_name || 'Client', time: (a.time || '').slice(0, 5), barberName: barberName(a.barber_id), level: 'Medium', reasons })
        }
        scored.sort((x, y) => (y.level === 'High' ? 1 : 0) - (x.level === 'High' ? 1 : 0))

        if (!cancelled) {
          setForecast({ booked: bookedRevenue, walkInEstimate })
          setAtRisk(scored.slice(0, 3))
          setLoaded(true)
        }
      } catch {
        if (!cancelled) {
          // Never break the dashboard: fall back to booked revenue only.
          setForecast({ booked: bookedRevenue, walkInEstimate: null })
          setAtRisk([])
          setLoaded(true)
        }
      }
    }
    load()
    return () => { cancelled = true }
  }, [shopId, todayAppointments])

  const expected = forecast.booked + (forecast.walkInEstimate ?? 0)

  return (
    <div className="bg-warm-100 border border-warm-200 rounded-2xl p-5 mb-5">
      <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500 mb-4">
        Today's outlook
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 1. Forecast */}
        <div className="bg-warm-50 rounded-xl p-4">
          <div className="text-xs text-charcoal-500 mb-1">Expected revenue</div>
          <div className="font-serif text-3xl text-charcoal-900 leading-none">
            {loaded ? money(expected) : '…'}
          </div>
          <div className="text-xs text-charcoal-500 mt-2">
            {money(forecast.booked)} booked
            {forecast.walkInEstimate != null ? (
              <> · ~{money(forecast.walkInEstimate)} walk-ins (est.)</>
            ) : (
              <> · walk-in est. n/a — not enough history yet</>
            )}
          </div>
        </div>

        {/* 2. At-risk appointments */}
        <div className="bg-warm-50 rounded-xl p-4">
          <div className="text-xs text-charcoal-500 mb-2">At-risk bookings today</div>
          {!loaded ? (
            <div className="text-sm text-charcoal-400">Checking…</div>
          ) : atRisk.length === 0 ? (
            <div className="text-sm text-charcoal-400">No at-risk bookings today</div>
          ) : (
            <div className="space-y-2">
              {atRisk.map(a => (
                <button
                  key={a.id}
                  onClick={() => router.push(`/dashboard/pos/${a.id}`)}
                  className="w-full text-left flex items-center gap-2 hover:bg-warm-200 rounded-lg px-2 py-1.5 -mx-2 transition-colors"
                >
                  <span className="font-mono text-xs text-od-green w-10 flex-shrink-0">{a.time}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-charcoal-900 truncate">{a.clientName}</span>
                    <span className="block text-xs text-charcoal-500 truncate">
                      {a.barberName} · {a.reasons.join(' · ')}
                    </span>
                  </span>
                  <span
                    className={`text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full flex-shrink-0 ${
                      a.level === 'High'
                        ? 'text-red-500 bg-red-500/10 border border-red-500/20'
                        : 'text-amber-600 bg-amber-500/10 border border-amber-500/20'
                    }`}
                  >
                    {a.level}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 3. Quiet-client nudge */}
        <button
          onClick={() => router.push('/dashboard/insights')}
          className="bg-warm-50 rounded-xl p-4 text-left hover:bg-warm-200 transition-colors"
        >
          <div className="text-xs text-charcoal-500 mb-1">Quiet clients</div>
          <div className="font-serif text-3xl text-charcoal-900 leading-none">{quietClientCount}</div>
          <div className="text-xs text-charcoal-500 mt-2">
            overdue for a rebook — win them back in CRM →
          </div>
        </button>
      </div>
    </div>
  )
}
