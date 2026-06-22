'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import OwnerNav from '@/components/OwnerNav'
import MobileNav from '@/components/MobileNav'

type AnalyticsPeriod = '30' | '90' | 'year'

interface Appointment {
  id: string
  date: string
  price: number
  barber_id: string
  status: string
  services: { name: string; id: string } | null
}

interface Tip {
  id: string
  amount: number
  created_at: string
  barber_id: string
}

interface ShopBarber {
  barber_id: string
  barber_name: string
  alias: string | null
  commission_rate: number
  compensation_type: string
  color: string | null
}

interface ClientLock {
  id: string
  locked: boolean
  barber_id: string
  last_booking_date: string | null
  loyalty_protected: boolean
}

function fmt(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function getDaysBetween(start: string, end: string): string[] {
  const days: string[] = []
  const cur = new Date(start + 'T12:00:00')
  const endD = new Date(end + 'T12:00:00')
  while (cur <= endD) {
    const pad = (n: number) => String(n).padStart(2, '0')
    days.push(`${cur.getFullYear()}-${pad(cur.getMonth() + 1)}-${pad(cur.getDate())}`)
    cur.setDate(cur.getDate() + 1)
  }
  return days
}

// ---- Chart components ----

function LineTrendChart({ days, revenueByDay }: { days: string[]; revenueByDay: Record<string, number> }) {
  const values = days.map(d => revenueByDay[d] || 0)
  const maxVal = Math.max(...values, 1)
  const minVal = 0
  const W = 600; const H = 100; const pad = 8

  if (values.every(v => v === 0)) {
    return <div className="flex items-center justify-center h-28 text-charcoal-500 text-sm">No revenue data</div>
  }

  const avg = values.reduce((s, v) => s + v, 0) / values.length
  const max = Math.max(...values)
  const min = Math.min(...values.filter(v => v > 0))

  const toY = (v: number) => H - pad - ((v - minVal) / (maxVal - minVal)) * (H - pad * 2)
  const toX = (i: number) => (i / Math.max(values.length - 1, 1)) * W

  const points = values.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ')
  const areaPoints = `0,${H} ` + points + ` ${W},${H}`
  const avgY = toY(avg)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: `${H}px` }} preserveAspectRatio="none">
      {/* avg reference line */}
      <line x1="0" y1={avgY} x2={W} y2={avgY} stroke="#4B5320" strokeWidth="0.8" strokeDasharray="4 3" opacity="0.4" />
      {/* area fill */}
      <polygon points={areaPoints} fill="#4B5320" opacity="0.1" />
      {/* line */}
      <polyline points={points} fill="none" stroke="#4B5320" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* avg label */}
      <text x="4" y={avgY - 3} fontSize="7" fill="#4B5320" opacity="0.7" fontFamily="sans-serif">avg ${avg.toFixed(0)}</text>
    </svg>
  )
}

function MonthlyBarsChart({ year, appointments }: { year: number; appointments: Appointment[] }) {
  const currentMonth = new Date().getMonth()
  const months = Array.from({ length: 12 }, (_, i) => {
    const appts = appointments.filter(a => {
      const d = new Date(a.date + 'T12:00:00')
      return d.getFullYear() === year && d.getMonth() === i && a.status === 'done'
    })
    return {
      label: new Date(year, i).toLocaleDateString('en-US', { month: 'short' }),
      revenue: appts.reduce((s, a) => s + (parseFloat(String(a.price)) || 0), 0),
      isCurrent: i === currentMonth,
    }
  })
  const maxRev = Math.max(...months.map(m => m.revenue), 1)
  const W = 600; const H = 80; const labelH = 16; const totalH = H + labelH
  const slotW = W / 12
  const barW = slotW - 4

  return (
    <svg viewBox={`0 0 ${W} ${totalH}`} className="w-full" style={{ height: `${totalH}px` }} preserveAspectRatio="none">
      <line x1="0" y1={H} x2={W} y2={H} stroke="#e8e0d5" strokeWidth="1" />
      {months.map((m, i) => {
        const barH = m.revenue > 0 ? Math.max(3, (m.revenue / maxRev) * (H - 16)) : 0
        const x = i * slotW + 2
        const y = H - barH
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={barH || 0}
              fill={m.isCurrent ? '#4B5320' : '#e8e0d5'} rx="1" />
            {m.revenue > 0 && (
              <text x={x + barW / 2} y={Math.max(y - 2, 8)} textAnchor="middle" fontSize="6.5" fill={m.isCurrent ? '#4B5320' : '#9e9589'} fontFamily="sans-serif">
                ${m.revenue.toFixed(0)}
              </text>
            )}
            <text x={x + barW / 2} y={totalH - 2} textAnchor="middle" fontSize="8" fill="#9e9589" fontFamily="sans-serif">
              {m.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function HorizontalBars({ items }: { items: { label: string; value: number; sub?: string; color?: string }[] }) {
  const maxVal = Math.max(...items.map(i => i.value), 1)
  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i}>
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-sm text-charcoal-900 truncate max-w-[60%]">{item.label}</span>
            <span className="text-xs font-mono text-charcoal-500 ml-2 flex-shrink-0">{item.sub || ''}</span>
          </div>
          <div className="h-2.5 bg-warm-200 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.max(2, (item.value / maxVal) * 100)}%`,
                background: item.color || '#4B5320',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function AnalyticsPage() {
  const [analyticsPeriod, setAnalyticsPeriod] = useState<AnalyticsPeriod>('30')
  const [profile, setProfile] = useState<any>(null)
  const [shop, setShop] = useState<any>(null)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [tips, setTips] = useState<Tip[]>([])
  const [shopBarbers, setShopBarbers] = useState<ShopBarber[]>([])
  const [clientLocks, setClientLocks] = useState<ClientLock[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: prof } = await supabase
        .from('profiles').select('*').eq('id', user.id).maybeSingle()
      setProfile(prof)
      if (prof?.role === 'barber') { router.push('/dashboard/barber'); return }

      const { data: shopData } = await supabase
        .from('shops').select('*').eq('owner_id', user.id).maybeSingle()
      if (!shopData) { setLoading(false); return }
      setShop(shopData)

      const now = new Date()
      const start90 = fmt(new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000))
      const yearStart = `${now.getFullYear()}-01-01`
      const dataStart = yearStart < start90 ? yearStart : start90

      const [
        { data: appts },
        { data: tipsData },
        { data: barbers },
        { data: locks },
      ] = await Promise.all([
        supabase.from('appointments')
          .select('id, date, price, barber_id, status, services(name, id)')
          .eq('shop_id', shopData.id)
          .gte('date', dataStart)
          .order('date', { ascending: true }),
        supabase.from('tips')
          .select('id, amount, created_at, barber_id')
          .eq('shop_id', shopData.id)
          .gte('created_at', dataStart),
        supabase.from('shop_barbers')
          .select('barber_id, barber_name, alias, commission_rate, compensation_type, color')
          .eq('shop_id', shopData.id)
          .eq('active', true),
        supabase.from('client_locks')
          .select('id, locked, barber_id, last_booking_date, loyalty_protected')
          .eq('shop_id', shopData.id),
      ])

      setAppointments((appts || []) as Appointment[])
      setTips(tipsData || [])
      setShopBarbers(barbers || [])
      setClientLocks(locks || [])
      setLoading(false)
    }
    load()
  }, [])

  const now = new Date()
  const today = fmt(now)

  // Period start for selected period
  const periodStart = useMemo(() => {
    if (analyticsPeriod === '30') return fmt(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000))
    if (analyticsPeriod === '90') return fmt(new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000))
    return `${now.getFullYear()}-01-01`
  }, [analyticsPeriod])

  const periodAppts = useMemo(() =>
    appointments.filter(a => a.date >= periodStart && a.date <= today && a.status === 'done'),
    [appointments, periodStart])

  const periodTips = useMemo(() =>
    tips.filter(t => t.created_at.slice(0, 10) >= periodStart),
    [tips, periodStart])

  // A) Revenue trend — last 30 days always for line chart
  const last30Start = fmt(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000))
  const last30Days = useMemo(() => getDaysBetween(last30Start, today), [last30Start])
  const revenueByDay30 = useMemo(() => {
    const map: Record<string, number> = {}
    appointments.filter(a => a.date >= last30Start && a.status === 'done')
      .forEach(a => { map[a.date] = (map[a.date] || 0) + (parseFloat(String(a.price)) || 0) })
    return map
  }, [appointments, last30Start])

  // B) Monthly bars — current year
  const yearAppts = appointments.filter(a => a.date >= `${now.getFullYear()}-01-01`)

  // C) Service breakdown
  const serviceBreakdown = useMemo(() => {
    const map: Record<string, { count: number; revenue: number }> = {}
    periodAppts.forEach(a => {
      const name = (a.services as any)?.name || 'Unknown'
      if (!map[name]) map[name] = { count: 0, revenue: 0 }
      map[name].count++
      map[name].revenue += parseFloat(String(a.price)) || 0
    })
    return Object.entries(map)
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 10)
      .map(([name, v]) => ({ label: name, value: v.revenue, sub: `${v.count} × $${v.revenue.toFixed(0)}` }))
  }, [periodAppts])

  // D) Barber performance
  const barberPerf = useMemo(() => {
    return shopBarbers.map(b => {
      const bAppts = periodAppts.filter(a => a.barber_id === b.barber_id)
      const rev = bAppts.reduce((s, a) => s + (parseFloat(String(a.price)) || 0), 0)
      const rate = b.compensation_type === 'commission' ? (b.commission_rate || 0.7) : 1.0
      const cut = rev * rate
      const bTips = periodTips
        .filter(t => t.barber_id === b.barber_id)
        .reduce((s, t) => s + (parseFloat(String(t.amount)) || 0), 0)
      return {
        label: b.barber_name || b.alias || 'Barber',
        value: cut + bTips,
        sub: `$${cut.toFixed(0)} cuts + $${bTips.toFixed(0)} tips`,
        color: b.color || '#4B5320',
      }
    }).sort((a, b) => b.value - a.value)
  }, [periodAppts, periodTips, shopBarbers])

  // E) Client lock health
  const lockedClients = clientLocks.filter(l => l.locked)
  const atRiskClients = lockedClients.filter(l => {
    if (!l.last_booking_date) return false
    const daysSince = Math.floor((Date.now() - new Date(l.last_booking_date).getTime()) / (1000 * 60 * 60 * 24))
    return l.loyalty_protected ? daysSince > 300 : daysSince > 60
  })
  const floatingClients = clientLocks.filter(l => !l.locked)

  const barberWithMostAtRisk = useMemo(() => {
    const map: Record<string, number> = {}
    atRiskClients.forEach(l => { map[l.barber_id] = (map[l.barber_id] || 0) + 1 })
    const top = Object.entries(map).sort((a, b) => b[1] - a[1])[0]
    if (!top) return null
    const barber = shopBarbers.find(b => b.barber_id === top[0])
    return { name: barber?.barber_name || barber?.alias || 'Barber', count: top[1] }
  }, [atRiskClients, shopBarbers])

  // F) Booking volume
  const thisMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const lastMonthEnd = fmt(new Date(new Date(thisMonthStart).getTime() - 1))
  const lastMonthStart = `${lastMonthEnd.slice(0, 7)}-01`

  const thisMonthBookings = appointments.filter(a => a.date >= thisMonthStart).length
  const lastMonthBookings = appointments.filter(a => a.date >= lastMonthStart && a.date <= lastMonthEnd).length
  const bookingChange = lastMonthBookings > 0
    ? Math.round(((thisMonthBookings - lastMonthBookings) / lastMonthBookings) * 100)
    : null

  const ownerName = profile?.full_name || shop?.name || 'Owner'
  const initials = ownerName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()

  const PERIODS: { key: AnalyticsPeriod; label: string }[] = [
    { key: '30', label: '30 Days' },
    { key: '90', label: '90 Days' },
    { key: 'year', label: 'Year' },
  ]

  if (loading) return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-od-green border-t-transparent animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-warm-50">
      <OwnerNav
        shopName={shop?.name || ''}
        ownerName={ownerName}
        initials={initials}
        userId={profile?.id}
      />

      <div className="p-6 max-w-3xl mx-auto pb-24 md:pb-8">

        {/* HEADER */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500 mb-1">Analytics</div>
            <h1 className="font-serif text-2xl text-charcoal-900">{shop?.name || 'Your Shop'}</h1>
          </div>
          <button onClick={() => router.push('/dashboard')}
            className="text-xs text-charcoal-500 hover:text-charcoal-900 transition-colors">
            &larr; Dashboard
          </button>
        </div>

        {/* PERIOD SELECTOR */}
        <div className="flex gap-1 mb-6 bg-warm-100 border border-warm-200 rounded-xl p-1">
          {PERIODS.map(p => (
            <button key={p.key} onClick={() => setAnalyticsPeriod(p.key)}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
                analyticsPeriod === p.key ? 'bg-od-green text-white' : 'text-charcoal-500 hover:text-charcoal-900'
              }`}>
              {p.label}
            </button>
          ))}
        </div>

        {/* A) REVENUE TREND — last 30 days line chart */}
        <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden mb-4">
          <div className="px-5 py-4 border-b border-warm-200">
            <div className="font-serif text-charcoal-900">Revenue Trend</div>
            <div className="text-xs text-charcoal-500 mt-0.5">Last 30 days — daily revenue with average line</div>
          </div>
          <div className="p-4">
            <LineTrendChart days={last30Days} revenueByDay={revenueByDay30} />
          </div>
        </div>

        {/* B) MONTHLY REVENUE BARS */}
        <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden mb-4">
          <div className="px-5 py-4 border-b border-warm-200">
            <div className="font-serif text-charcoal-900">Monthly Revenue</div>
            <div className="text-xs text-charcoal-500 mt-0.5">{now.getFullYear()} — current month highlighted</div>
          </div>
          <div className="p-4">
            <MonthlyBarsChart year={now.getFullYear()} appointments={yearAppts} />
          </div>
        </div>

        {/* F) BOOKING VOLUME */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-warm-100 border border-warm-200 rounded-xl p-5">
            <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500 mb-2">This Month</div>
            <div className="font-serif text-3xl text-charcoal-900">{thisMonthBookings}</div>
            <div className="text-xs text-charcoal-500 mt-1">bookings</div>
            {bookingChange !== null && (
              <div className={`text-xs font-semibold mt-2 ${bookingChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {bookingChange >= 0 ? '▲' : '▼'} {Math.abs(bookingChange)}% vs last month
              </div>
            )}
          </div>
          <div className="bg-warm-100 border border-warm-200 rounded-xl p-5">
            <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500 mb-2">Last Month</div>
            <div className="font-serif text-3xl text-charcoal-900">{lastMonthBookings}</div>
            <div className="text-xs text-charcoal-500 mt-1">bookings</div>
          </div>
        </div>

        {/* C) SERVICE REVENUE BREAKDOWN */}
        {serviceBreakdown.length > 0 && (
          <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden mb-4">
            <div className="px-5 py-4 border-b border-warm-200">
              <div className="font-serif text-charcoal-900">Service Revenue</div>
              <div className="text-xs text-charcoal-500 mt-0.5">By service for selected period</div>
            </div>
            <div className="p-5">
              <HorizontalBars items={serviceBreakdown} />
            </div>
          </div>
        )}

        {/* D) BARBER PERFORMANCE */}
        {barberPerf.length > 0 && (
          <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden mb-4">
            <div className="px-5 py-4 border-b border-warm-200">
              <div className="font-serif text-charcoal-900">Barber Performance</div>
              <div className="text-xs text-charcoal-500 mt-0.5">Total earnings (cuts + tips) for selected period</div>
            </div>
            <div className="p-5">
              <HorizontalBars items={barberPerf} />
            </div>
          </div>
        )}

        {/* E) CLIENT LOCK HEALTH */}
        <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden mb-4">
          <div className="px-5 py-4 border-b border-warm-200">
            <div className="font-serif text-charcoal-900">Client Lock Health</div>
            <div className="text-xs text-charcoal-500 mt-0.5">Retention at a glance</div>
          </div>
          <div className="grid grid-cols-3 divide-x divide-warm-200">
            <div className="p-4 text-center">
              <div className="font-serif text-2xl text-green-400 mb-1">{lockedClients.length}</div>
              <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500">Locked</div>
            </div>
            <div className="p-4 text-center">
              <div className={`font-serif text-2xl mb-1 ${atRiskClients.length > 0 ? 'text-od-green' : 'text-charcoal-600'}`}>
                {atRiskClients.length}
              </div>
              <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500">At Risk</div>
            </div>
            <div className="p-4 text-center">
              <div className="font-serif text-2xl text-charcoal-500 mb-1">{floatingClients.length}</div>
              <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500">Floating</div>
            </div>
          </div>
          {barberWithMostAtRisk && (
            <div className="border-t border-warm-200 px-5 py-3 bg-od-green/5">
              <div className="text-xs text-od-green font-semibold">
                Most at-risk: {barberWithMostAtRisk.name} ({barberWithMostAtRisk.count} clients)
              </div>
            </div>
          )}
        </div>

      </div>
      <MobileNav />
    </div>
  )
}
