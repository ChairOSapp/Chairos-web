'use client'
import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'

interface Appointment {
  id: string
  date: string
  barber_id: string
  status: string
  client_id?: string | null
  client_name?: string | null
}

interface Props {
  shopId: string
  period: string
  appointments: Appointment[]  // period-filtered (for KPIs)
  isBarber?: boolean
  barberId?: string
  shopOwnerId?: string
}

type DrawerBucket = 'healthy' | 'fading' | 'cold' | null

interface ClientRow {
  clientId: string
  lastVisit: string
  daysSince: number
  totalVisits: number
  bucket: 'healthy' | 'fading' | 'cold'
  barberName?: string
}

function fmt(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function ClientHealthDashboard({
  shopId,
  period: _period,
  appointments,
  isBarber = false,
  barberId,
  shopOwnerId,
}: Props) {
  const [drawerOpen, setDrawerOpen] = useState<DrawerBucket>(null)
  const [alertSent, setAlertSent] = useState(false)
  const supabase = useMemo(() => createClient(), [])

  // Filter to barber scope if barber view
  const scopedAppts = useMemo(() => {
    if (isBarber && barberId) {
      return appointments.filter(a => a.barber_id === barberId)
    }
    return appointments
  }, [appointments, isBarber, barberId])

  const today = fmt(new Date())
  const nowMs = new Date(today + 'T12:00:00').getTime()

  // Compute lapse pipeline from ALL scoped appointments (not period-filtered)
  const { healthyRows, fadingRows, coldRows } = useMemo(() => {
    const done = scopedAppts.filter(a => ['done', 'completed'].includes(a.status) && a.client_id)
    const map: Record<string, { dates: string[]; barber_id: string }> = {}
    for (const a of done) {
      if (!a.client_id) continue
      if (!map[a.client_id]) map[a.client_id] = { dates: [], barber_id: a.barber_id }
      map[a.client_id].dates.push(a.date)
    }
    const healthy: ClientRow[] = []
    const fading: ClientRow[] = []
    const cold: ClientRow[] = []
    for (const [clientId, { dates, barber_id }] of Object.entries(map)) {
      const sorted = [...dates].sort()
      const lastVisit = sorted[sorted.length - 1]
      const daysSince = Math.floor((nowMs - new Date(lastVisit + 'T12:00:00').getTime()) / 86400000)
      const totalVisits = dates.length
      const row: ClientRow = { clientId, lastVisit, daysSince, totalVisits, bucket: 'healthy', barberName: barber_id }
      if (daysSince < 30) {
        row.bucket = 'healthy'
        healthy.push(row)
      } else if (daysSince < 60) {
        row.bucket = 'fading'
        fading.push(row)
      } else {
        row.bucket = 'cold'
        cold.push(row)
      }
    }
    return { healthyRows: healthy, fadingRows: fading, coldRows: cold }
  }, [scopedAppts, nowMs])

  // KPI Row — period-filtered
  const { firstTimers, regulars, chairValue, comeBackRate } = useMemo(() => {
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const todayStr = fmt(now)
    let periodStart = todayStr
    if (_period === 'week') {
      const d = new Date(now); d.setDate(d.getDate() - 7)
      periodStart = fmt(d)
    } else if (_period === 'month') {
      const d = new Date(now); d.setDate(d.getDate() - 30)
      periodStart = fmt(d)
    } else if (_period === 'quarter') {
      const d = new Date(now); d.setDate(d.getDate() - 90)
      periodStart = fmt(d)
    } else if (_period === 'year') {
      periodStart = `${now.getFullYear()}-01-01`
    }

    const done = scopedAppts.filter(a =>
      ['done', 'completed'].includes(a.status) && a.client_id && a.date >= periodStart && a.date <= todayStr
    )
    const totalRevenue = done.reduce((s, a) => s + (parseFloat(String((a as any).price)) || 0), 0)

    // All historical appointments for first-timer detection
    const allDone = scopedAppts.filter(a => ['done', 'completed'].includes(a.status) && a.client_id)
    const firstVisit: Record<string, string> = {}
    for (const a of allDone) {
      if (!a.client_id) continue
      if (!firstVisit[a.client_id] || a.date < firstVisit[a.client_id]) firstVisit[a.client_id] = a.date
    }

    const periodClients = new Set(done.map(a => a.client_id).filter(Boolean) as string[])
    const uniqueCount = periodClients.size

    let firstTimerCount = 0
    for (const cid of periodClients) {
      if (firstVisit[cid] >= periodStart) firstTimerCount++
    }

    // Regulars: clients with 2+ visits ever in scoped set
    const clientVisitCounts: Record<string, number> = {}
    for (const a of allDone) {
      if (!a.client_id) continue
      clientVisitCounts[a.client_id] = (clientVisitCounts[a.client_id] || 0) + 1
    }
    const regularsCount = Array.from(periodClients).filter(cid => (clientVisitCounts[cid] || 0) >= 2).length

    // Come-back rate: clients with 2+ visits / total unique
    const totalUnique = Object.keys(clientVisitCounts).length
    const withReturn = Object.values(clientVisitCounts).filter(v => v >= 2).length
    const cbRate = totalUnique > 0 ? withReturn / totalUnique : 0

    const chairVal = uniqueCount > 0 ? totalRevenue / uniqueCount : 0

    return {
      firstTimers: firstTimerCount,
      regulars: regularsCount,
      chairValue: chairVal,
      comeBackRate: cbRate,
    }
  }, [scopedAppts, _period])

  async function sendAlert() {
    if (!shopOwnerId || !barberId || alertSent) return
    try {
      await supabase.from('notifications').insert({
        user_id: shopOwnerId,
        shop_id: shopId,
        type: 'alert',
        message: `Barber flagged ${coldRows.length} gone-cold clients for follow-up`,
      })
      setAlertSent(true)
    } catch {
      // swallow
    }
  }

  if (scopedAppts.length === 0) return null

  const kpis = [
    { label: 'First-Timers', value: String(firstTimers), color: 'text-od-green' },
    { label: 'Regulars', value: String(regulars), color: 'text-charcoal-900' },
    { label: 'Chair Value', value: `$${chairValue.toFixed(0)}`, color: 'text-charcoal-900' },
    { label: 'Come-Back Rate', value: `${(comeBackRate * 100).toFixed(0)}%`, color: comeBackRate > 0.6 ? 'text-od-green' : comeBackRate >= 0.4 ? 'text-amber-400' : 'text-charcoal-500' },
  ]

  const bucketCols = [
    {
      key: 'healthy' as DrawerBucket,
      label: 'Healthy',
      count: healthyRows.length,
      color: 'text-green-400',
      badgeBg: 'bg-green-100 text-green-700',
      sub: 'Visited in last 30 days',
    },
    {
      key: 'fading' as DrawerBucket,
      label: 'Fading Clients',
      count: fadingRows.length,
      color: 'text-amber-400',
      badgeBg: 'bg-amber-100 text-amber-700',
      sub: '30–59 days away',
      cta: { label: 'Create Campaign →', href: `/dashboard/campaigns?intent=${encodeURIComponent('Re-engage fading clients before they go cold')}`, cls: 'text-amber-700 hover:text-amber-900' },
    },
    {
      key: 'cold' as DrawerBucket,
      label: 'Gone Cold',
      count: coldRows.length,
      color: 'text-red-400',
      badgeBg: 'bg-red-100 text-red-700',
      sub: '60+ days — act now',
      cta: { label: 'Create Campaign →', href: `/dashboard/campaigns?intent=${encodeURIComponent('Win back gone-cold clients')}`, cls: 'text-red-600 hover:text-red-800' },
    },
  ]

  const drawerRows: Record<string, ClientRow[]> = {
    healthy: healthyRows,
    fading: fadingRows,
    cold: coldRows,
  }

  return (
    <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden mb-4">
      <div className="px-5 py-4 border-b border-warm-200">
        <div className="font-serif text-charcoal-900">Client Health</div>
        <div className="text-xs text-charcoal-500 mt-0.5">
          {firstTimers} first-timers · {regulars} regulars active — tap a bucket to see who
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-warm-200 border-b border-warm-200">
        {kpis.map((kpi, i) => (
          <div key={i} className="p-4 text-center">
            <div className={`font-serif text-2xl mb-1 ${kpi.color}`}>{kpi.value}</div>
            <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400">{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* Lapse Pipeline */}
      <div className="flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-warm-200">
        {bucketCols.map(col => (
          <button
            key={String(col.key)}
            onClick={() => setDrawerOpen(drawerOpen === col.key ? null : col.key)}
            className={`w-full lg:flex-1 p-4 text-left hover:bg-warm-200/50 transition-colors ${drawerOpen === col.key ? 'bg-warm-200/60' : ''}`}
          >
            <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full mb-2 ${col.badgeBg}`}>
              {col.count}
            </span>
            <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-600 mb-0.5">{col.label}</div>
            <div className="text-[10px] text-charcoal-400">{col.sub}</div>
            {col.cta && col.count > 0 && !isBarber && (
              <a
                href={col.cta.href}
                onClick={e => e.stopPropagation()}
                className={`mt-2 block text-[10px] font-semibold ${col.cta.cls}`}
              >
                {col.cta.label}
              </a>
            )}
          </button>
        ))}
      </div>

      {/* Client Drawer */}
      {drawerOpen && (
        <div className="border-t border-warm-200">
          <div className="max-h-56 overflow-y-auto divide-y divide-warm-200">
            {drawerRows[drawerOpen].slice(0, 50).map((c, i) => (
              <div key={i} className="px-5 py-2.5 flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-xs text-charcoal-500 truncate">{c.clientId.slice(0, 8)}…</span>
                  <span className="text-xs text-charcoal-400 flex-shrink-0">{c.totalVisits} cut{c.totalVisits !== 1 ? 's' : ''}</span>
                </div>
                <span className="text-xs text-charcoal-400 flex-shrink-0">{c.daysSince}d since last visit</span>
              </div>
            ))}
            {drawerRows[drawerOpen].length === 0 && (
              <div className="px-5 py-5 text-sm text-charcoal-500 text-center">No clients in this bucket.</div>
            )}
          </div>
          {drawerOpen === 'cold' && isBarber && coldRows.length > 0 && shopOwnerId && (
            <div className="px-5 py-3 border-t border-warm-200 bg-warm-200/30">
              <button
                onClick={sendAlert}
                disabled={alertSent}
                className={`text-xs font-semibold transition-colors ${alertSent ? 'text-charcoal-400' : 'text-od-green hover:text-od-green-light'}`}
              >
                {alertSent ? 'Alert sent to owner' : `Alert Owner — ${coldRows.length} gone-cold clients`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
