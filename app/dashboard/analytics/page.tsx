'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import OwnerNav from '@/components/OwnerNav'
import BarberNav from '@/components/BarberNav'
import MobileNav from '@/components/MobileNav'
import AIInsightStrip from '@/components/insights/AIInsightStrip'
import PeakHoursHeatmap from '@/components/insights/PeakHoursHeatmap'
import BarberPerformanceTable from '@/components/insights/BarberPerformanceTable'
import ClientHealthDashboard from '@/components/insights/ClientHealthDashboard'
import RevenueIntelligence from '@/components/insights/RevenueIntelligence'
import OpportunitiesSection from '@/components/insights/OpportunitiesSection'

type AnalyticsPeriod = '30' | '90' | 'year'

interface Appointment {
  id: string
  date: string
  time?: string | null
  price: number
  barber_id: string
  status: string
  client_id?: string | null
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
  client_id: string | null
  locked: boolean
  barber_id: string
  last_booking_date: string | null
  loyalty_protected: boolean
  clients: { id: string; full_name: string | null; phone: string | null } | null
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

  const LEFT = 44; const RIGHT = 4; const TOP = 6; const BOT = 18
  const W = 600; const H = 120
  const cW = W - LEFT - RIGHT; const cH = H - TOP - BOT

  if (values.every(v => v === 0)) {
    return <div className="flex items-center justify-center h-28 text-charcoal-500 text-sm">No revenue data</div>
  }

  const avg = values.reduce((s, v) => s + v, 0) / values.length
  const toX = (i: number) => LEFT + (i / Math.max(values.length - 1, 1)) * cW
  const toY = (v: number) => TOP + cH - (v / maxVal) * cH

  const points = values.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ')
  const areaPoints = `${LEFT},${TOP + cH} ` + points + ` ${LEFT + cW},${TOP + cH}`
  const avgY = toY(avg)

  const yTicks = [0, Math.round(maxVal / 2), maxVal]
  const xLabelIndices = [0, Math.floor(values.length * 0.25), Math.floor(values.length * 0.5), Math.floor(values.length * 0.75), values.length - 1]
    .filter((v, i, a) => a.indexOf(v) === i && v >= 0 && v < values.length)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: `${H}px` }} preserveAspectRatio="none">
      {yTicks.map(t => {
        const y = toY(t)
        return (
          <g key={t}>
            <line x1={LEFT} y1={y} x2={LEFT + cW} y2={y} stroke="#e8e0d5" strokeWidth="0.8" />
            <text x={LEFT - 4} y={y + 3} textAnchor="end" fontSize="9" fill="#9e9589" fontFamily="sans-serif">
              ${t >= 1000 ? `${(t / 1000).toFixed(0)}k` : t.toFixed(0)}
            </text>
          </g>
        )
      })}
      {xLabelIndices.map(i => {
        const label = new Date(days[i] + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        return (
          <text key={i} x={toX(i)} y={H - 3} textAnchor="middle" fontSize="9" fill="#9e9589" fontFamily="sans-serif">
            {label}
          </text>
        )
      })}
      <line x1={LEFT} y1={avgY} x2={LEFT + cW} y2={avgY} stroke="#4B5320" strokeWidth="0.8" strokeDasharray="4 3" opacity="0.4" />
      <polygon points={areaPoints} fill="#4B5320" opacity="0.08" />
      <polyline points={points} fill="none" stroke="#4B5320" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <text x={LEFT + 4} y={avgY - 3} fontSize="8" fill="#4B5320" opacity="0.7" fontFamily="sans-serif">avg ${avg.toFixed(0)}</text>
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

  const LEFT = 44; const RIGHT = 4; const TOP = 6; const BOT = 18
  const W = 600; const H = 110
  const cW = W - LEFT - RIGHT; const cH = H - TOP - BOT
  const slotW = cW / 12; const barW = slotW - 4

  const yTicks = [0, Math.round(maxRev / 2), maxRev]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: `${H}px` }} preserveAspectRatio="none">
      {yTicks.map(t => {
        const y = TOP + cH - (t / maxRev) * cH
        return (
          <g key={t}>
            <line x1={LEFT} y1={y} x2={LEFT + cW} y2={y} stroke="#e8e0d5" strokeWidth="0.8" />
            <text x={LEFT - 4} y={y + 3} textAnchor="end" fontSize="9" fill="#9e9589" fontFamily="sans-serif">
              ${t >= 1000 ? `${(t / 1000).toFixed(0)}k` : t.toFixed(0)}
            </text>
          </g>
        )
      })}
      {months.map((m, i) => {
        const barH = m.revenue > 0 ? Math.max(3, (m.revenue / maxRev) * cH) : 0
        const x = LEFT + i * slotW + 2
        const y = TOP + cH - barH
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={barH} fill={m.isCurrent ? '#4B5320' : '#d8d5c8'} rx="1" />
            <text x={x + barW / 2} y={H - 3} textAnchor="middle" fontSize="8" fill={m.isCurrent ? '#4B5320' : '#9e9589'} fontFamily="sans-serif" fontWeight={m.isCurrent ? 'bold' : 'normal'}>
              {m.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// (SVGBarChart removed — replaced by ServiceRevenueTable and BarberPerfCards below)

export default function AnalyticsPage() {
  const [analyticsPeriod, setAnalyticsPeriod] = useState<AnalyticsPeriod>('30')
  const [profile, setProfile] = useState<any>(null)
  const [shop, setShop] = useState<any>(null)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [tips, setTips] = useState<Tip[]>([])
  const [shopBarbers, setShopBarbers] = useState<ShopBarber[]>([])
  const [clientLocks, setClientLocks] = useState<ClientLock[]>([])
  const [isBarber, setIsBarber] = useState(false)
  const [myBarberId, setMyBarberId] = useState<string | null>(null)
  const [reviews, setReviews] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: prof } = await supabase
        .from('profiles').select('*').eq('id', user.id).maybeSingle()
      setProfile(prof)

      const barberRole = prof?.role === 'barber'
      setIsBarber(barberRole)

      const now = new Date()
      const start90 = fmt(new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000))
      const yearStart = `${now.getFullYear()}-01-01`
      const dataStart = yearStart < start90 ? yearStart : start90

      if (barberRole) {
        // Barber self-view: find their shop via shop_barbers
        const { data: myEntry } = await supabase
          .from('shop_barbers')
          .select('shop_id, barber_id, barber_name, alias, commission_rate, compensation_type, color')
          .eq('barber_id', user.id)
          .eq('active', true)
          .maybeSingle()

        if (!myEntry) { setLoading(false); return }
        setMyBarberId(myEntry.barber_id)

        const { data: shopData } = await supabase
          .from('shops').select('*').eq('id', myEntry.shop_id).maybeSingle()
        setShop(shopData)

        const [{ data: appts }, { data: tipsData }, { data: allBarbers }] = await Promise.all([
          supabase.from('appointments')
            .select('id, date, time, price, barber_id, status, client_id, services(name, id)')
            .eq('shop_id', myEntry.shop_id)
            .eq('barber_id', myEntry.barber_id)
            .gte('date', dataStart)
            .order('date', { ascending: true }),
          supabase.from('tips')
            .select('id, amount, created_at, barber_id')
            .eq('shop_id', myEntry.shop_id)
            .eq('barber_id', myEntry.barber_id)
            .gte('created_at', dataStart),
          supabase.from('shop_barbers')
            .select('barber_id, barber_name, alias, commission_rate, compensation_type, color')
            .eq('shop_id', myEntry.shop_id)
            .eq('active', true),
        ])

        setAppointments((appts || []) as unknown as Appointment[])
        setTips(tipsData || [])
        setShopBarbers([myEntry] as ShopBarber[])
        setLoading(false)
        return
      }

      // Owner view
      const { data: shopData } = await supabase
        .from('shops').select('*').eq('owner_id', user.id).maybeSingle()
      if (!shopData) { setLoading(false); return }
      setShop(shopData)

      const [
        { data: appts },
        { data: tipsData },
        { data: barbers },
        { data: locks },
        { data: reviewsData },
      ] = await Promise.all([
        supabase.from('appointments')
          .select('id, date, time, price, barber_id, status, client_id, services(name, id)')
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
          .select('id, client_id, locked, barber_id, last_booking_date, loyalty_protected, clients(id, full_name, phone)')
          .eq('shop_id', shopData.id),
        supabase.from('reviews')
          .select('*')
          .eq('shop_id', shopData.id)
          .eq('visible', true),
      ])

      setAppointments((appts || []) as unknown as Appointment[])
      setTips(tipsData || [])
      setShopBarbers(barbers || [])
      setClientLocks((locks || []) as unknown as ClientLock[])
      setReviews(reviewsData || [])
      setLoading(false)
    }
    load()
  }, [])

  const now = new Date()
  const today = fmt(now)

  // Period start for selected period
  const periodStart = useMemo(() => {
    const n = new Date()
    if (analyticsPeriod === '30') return fmt(new Date(n.getTime() - 30 * 24 * 60 * 60 * 1000))
    if (analyticsPeriod === '90') return fmt(new Date(n.getTime() - 90 * 24 * 60 * 60 * 1000))
    return `${n.getFullYear()}-01-01`
  }, [analyticsPeriod])

  const periodAppts = useMemo(() =>
    appointments.filter(a => a.date >= periodStart && a.date <= today && a.status === 'done'),
    [appointments, periodStart])

  const periodTips = useMemo(() =>
    tips.filter(t => t.created_at.slice(0, 10) >= periodStart),
    [tips, periodStart])

  // A) Revenue trend — last 30 days always for line chart
  const last30Start = useMemo(() => fmt(new Date(new Date().getTime() - 30 * 24 * 60 * 60 * 1000)), [])
  const last30Days = useMemo(() => getDaysBetween(last30Start, fmt(new Date())), [last30Start])
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
        color: (b.color && b.color !== '#b8861f') ? b.color : '#4B5320',
        barberId: b.barber_id,
        apptCount: bAppts.length,
        avgTicket: bAppts.length > 0 ? rev / bAppts.length : 0,
        cutsTotal: cut,
        tipsTotal: bTips,
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

  // G) Busiest days of week
  const busyDays = useMemo(() => {
    const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const map: Record<number, { revenue: number; count: number }> = {}
    for (let i = 0; i < 7; i++) map[i] = { revenue: 0, count: 0 }
    periodAppts.forEach(a => {
      const d = new Date(a.date + 'T12:00:00').getDay()
      map[d].count++
      map[d].revenue += parseFloat(String(a.price)) || 0
    })
    return Array.from({ length: 7 }, (_, i) => ({
      day: DAY_NAMES[i],
      count: map[i].count,
      revenue: map[i].revenue,
    }))
  }, [periodAppts])

  const busiestDay = busyDays.reduce((best, d) => d.count > best.count ? d : best, busyDays[0])

  // I) Per-barber review stats
  const barberReviewStats = useMemo(() => {
    const stats: Record<string, { name: string; count: number; total: number; avg: number }> = {}
    reviews.forEach(r => {
      if (!r.barber_id) return
      if (!stats[r.barber_id]) stats[r.barber_id] = { name: r.barber_id, count: 0, total: 0, avg: 0 }
      stats[r.barber_id].count++
      stats[r.barber_id].total += r.rating
    })
    Object.values(stats).forEach(s => { s.avg = s.total / s.count })
    return stats
  }, [reviews])

  // H) Service insights — stars vs drag
  const serviceInsights = useMemo(() => {
    const map: Record<string, { count: number; revenue: number }> = {}
    periodAppts.forEach(a => {
      const name = (a.services as any)?.name || 'Unknown'
      if (!map[name]) map[name] = { count: 0, revenue: 0 }
      map[name].count++
      map[name].revenue += parseFloat(String(a.price)) || 0
    })
    const entries = Object.entries(map).map(([name, v]) => ({
      name,
      count: v.count,
      revenue: v.revenue,
      avgPrice: v.count > 0 ? v.revenue / v.count : 0,
    }))
    const totalRevenue = entries.reduce((s, e) => s + e.revenue, 0)
    return entries.map(e => ({
      ...e,
      revenueShare: totalRevenue > 0 ? e.revenue / totalRevenue : 0,
    })).sort((a, b) => b.revenue - a.revenue)
  }, [periodAppts])

  // Stars: top revenue + above-avg price. Drag: low avg price AND low count (<5% of bookings)
  const totalBookings = periodAppts.length
  const avgServicePrice = serviceInsights.length > 0
    ? serviceInsights.reduce((s, e) => s + e.avgPrice, 0) / serviceInsights.length
    : 0
  const stars = serviceInsights.filter(s => s.revenueShare >= 0.1 || s.avgPrice >= avgServicePrice * 1.2).slice(0, 3)
  const drag = serviceInsights.filter(s =>
    s.avgPrice < avgServicePrice * 0.7 && s.count < Math.max(1, totalBookings * 0.05) && s.count > 0
  ).slice(0, 3)

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

  const myBarberEntry = isBarber ? shopBarbers[0] : null
  const periodApptsByBarber = isBarber && myBarberId
    ? periodAppts.filter(a => a.barber_id === myBarberId)
    : periodAppts

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
      {isBarber ? (
        <BarberNav
          shopName={shop?.name || ''}
          barberName={ownerName}
          color={myBarberEntry?.color || '#4B5320'}
          initial={initials[0] || 'B'}
          userId={profile?.id}
        />
      ) : (
        <OwnerNav
          shopName={shop?.name || ''}
          ownerName={ownerName}
          initials={initials}
          userId={profile?.id}
        />
      )}

      <div className="lg:ml-64">
      <div className="w-full max-w-7xl mx-auto px-4 lg:px-8 pb-24 lg:pb-8">

        {/* HEADER */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500 mb-1">Analytics</div>
            <h1 className="font-serif text-2xl text-charcoal-900">{shop?.name || 'Your Shop'}</h1>
          </div>
          <button onClick={() => router.push('/dashboard')} className="btn-chairos-outline">Dashboard</button>
        </div>

        {/* PERIOD SELECTOR */}
        <div className="flex gap-1 mb-6 bg-warm-100 border border-warm-200 rounded-xl p-1 lg:w-fit">
          {PERIODS.map(p => (
            <button key={p.key} onClick={() => setAnalyticsPeriod(p.key)}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
                analyticsPeriod === p.key ? 'bg-od-green text-white' : 'text-charcoal-500 hover:text-charcoal-900'
              }`}>
              {p.label}
            </button>
          ))}
        </div>

        {/* AI INSIGHT STRIP — owner only */}
        {!isBarber && profile?.id && <AIInsightStrip userId={profile.id} />}

        {/* REVENUE INTELLIGENCE + PEAK HOURS — side by side on desktop */}
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="lg:w-3/5">
            <RevenueIntelligence
              shopId={shop?.id || ''}
              period={analyticsPeriod === '30' ? 'month' : analyticsPeriod === '90' ? 'quarter' : 'year'}
              appointments={appointments as any[]}
              tips={tips}
            />
          </div>
          <div className="lg:w-2/5">
            <PeakHoursHeatmap
              shopId={shop?.id || ''}
              period={analyticsPeriod === '30' ? 'month' : analyticsPeriod === '90' ? 'quarter' : 'year'}
            />
          </div>
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
        {serviceBreakdown.length > 0 && (() => {
          const totalSvcRev = serviceBreakdown.reduce((s, i) => s + i.value, 0)
          const maxSvcRev = Math.max(...serviceBreakdown.map(i => i.value), 1)
          return (
            <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden mb-4">
              <div className="px-5 py-4 border-b border-warm-200 flex items-center justify-between">
                <div>
                  <div className="font-serif text-charcoal-900">Service Revenue</div>
                  <div className="text-xs text-charcoal-500 mt-0.5">By service for selected period</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm font-semibold text-charcoal-900">${totalSvcRev.toFixed(0)}</div>
                  <div className="text-xs text-charcoal-500">total</div>
                </div>
              </div>
              <div className="divide-y divide-warm-200">
                {serviceBreakdown.map((item, i) => {
                  const count = parseInt(item.sub?.split(' × ')[0] || '0') || 0
                  const avg = count > 0 ? item.value / count : 0
                  const share = item.value / maxSvcRev
                  const isTop = i === 0
                  return (
                    <div key={i} className="px-5 py-3.5">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-charcoal-900">{item.label}</span>
                          {isTop && (
                            <span className="text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full bg-od-green/10 text-od-green border border-od-green/20">
                              Top
                            </span>
                          )}
                        </div>
                        <span className="font-mono text-sm font-semibold text-charcoal-900">${item.value.toFixed(0)}</span>
                      </div>
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-xs text-charcoal-500">{count} bookings</span>
                        <span className="text-xs text-charcoal-400">·</span>
                        <span className="text-xs text-charcoal-500">${avg.toFixed(0)}/avg</span>
                        <span className="text-xs text-charcoal-400">·</span>
                        <span className="text-xs text-charcoal-400">{Math.round((item.value / totalSvcRev) * 100)}% of revenue</span>
                      </div>
                      <div className="h-1.5 bg-warm-200 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-od-green" style={{ width: `${Math.max(2, share * 100)}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}

        {/* D) BARBER PERFORMANCE TABLE */}
        {!isBarber && (
          <BarberPerformanceTable
            shopId={shop?.id || ''}
            period={analyticsPeriod === '30' ? 'month' : analyticsPeriod === '90' ? 'quarter' : 'year'}
            barbers={shopBarbers}
            appointments={appointments as any[]}
            tips={tips}
          />
        )}

        {/* G) BUSIEST DAYS */}
        {totalBookings > 0 && (
          <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden mb-4">
            <div className="px-5 py-4 border-b border-warm-200">
              <div className="font-serif text-charcoal-900">Busiest Days</div>
              <div className="text-xs text-charcoal-500 mt-0.5">Bookings and revenue by day of week</div>
            </div>
            <div className="p-4">
              {(() => {
                const maxCount = Math.max(...busyDays.map(x => x.count), 1)
                const LEFT = 32; const RIGHT = 4; const TOP = 6; const BOT = 20
                const W = 600; const H = 100
                const cW = W - LEFT - RIGHT; const cH = H - TOP - BOT
                const slotW = cW / 7; const barW = slotW - 8
                const yTicks = [0, Math.round(maxCount / 2), maxCount]
                return (
                  <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: `${H}px` }} preserveAspectRatio="none">
                    {yTicks.map(t => {
                      const y = TOP + cH - (t / maxCount) * cH
                      return (
                        <g key={t}>
                          <line x1={LEFT} y1={y} x2={LEFT + cW} y2={y} stroke="#e8e0d5" strokeWidth="0.8" />
                          <text x={LEFT - 4} y={y + 3} textAnchor="end" fontSize="9" fill="#9e9589" fontFamily="sans-serif">{t}</text>
                        </g>
                      )
                    })}
                    {busyDays.map((d, i) => {
                      const barH = d.count > 0 ? Math.max(3, (d.count / maxCount) * cH) : 0
                      const x = LEFT + i * slotW + (slotW - barW) / 2
                      const y = TOP + cH - barH
                      const isBest = d.day === busiestDay.day && d.count > 0
                      return (
                        <g key={i}>
                          <rect x={x} y={y} width={barW} height={barH} fill={isBest ? '#4B5320' : '#d8d5c8'} rx="2" />
                          <text x={x + barW / 2} y={H - 3} textAnchor="middle" fontSize="9" fill={isBest ? '#4B5320' : '#9e9589'} fontFamily="sans-serif" fontWeight={isBest ? 'bold' : 'normal'}>
                            {d.day}
                          </text>
                        </g>
                      )
                    })}
                  </svg>
                )
              })()}
            </div>
            {busiestDay.count > 0 && (
              <div className="border-t border-warm-200 px-5 py-3 bg-od-green/5">
                <div className="text-xs text-od-green font-semibold">
                  {busiestDay.day} is your busiest day — {busiestDay.count} bookings, ${busiestDay.revenue.toFixed(0)} revenue
                </div>
              </div>
            )}
          </div>
        )}

        {/* H) SERVICE INSIGHTS */}
        {serviceInsights.length > 0 && (
          <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden mb-4">
            <div className="px-5 py-4 border-b border-warm-200">
              <div className="font-serif text-charcoal-900">Service Insights</div>
              <div className="text-xs text-charcoal-500 mt-0.5">What's driving revenue — and what's not</div>
            </div>

            {stars.length > 0 && (
              <div className="px-5 pt-4 pb-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-xs font-bold tracking-widest uppercase text-od-green">Stars</span>
                  <span className="text-[10px] text-charcoal-400">High revenue, above-avg ticket</span>
                </div>
                <div className="space-y-2">
                  {stars.map((s, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div>
                        <span className="text-sm text-charcoal-900">{s.name}</span>
                        <span className="ml-2 text-xs text-charcoal-400">{s.count} bookings</span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-mono text-charcoal-900">${s.revenue.toFixed(0)}</div>
                        <div className="text-[10px] text-charcoal-400">${s.avgPrice.toFixed(0)}/avg</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {drag.length > 0 && (
              <div className={`px-5 pb-4 ${stars.length > 0 ? 'pt-3 border-t border-warm-200' : 'pt-4'}`}>
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-xs font-bold tracking-widest uppercase text-red-400">Drag</span>
                  <span className="text-[10px] text-charcoal-400">Low ticket price, rarely booked</span>
                </div>
                <div className="space-y-2">
                  {drag.map((s, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div>
                        <span className="text-sm text-charcoal-900">{s.name}</span>
                        <span className="ml-2 text-xs text-charcoal-400">{s.count} bookings</span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-mono text-charcoal-500">${s.avgPrice.toFixed(0)}/avg</div>
                        <div className="text-[10px] text-red-400">Consider raising price or removing</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {drag.length === 0 && stars.length > 0 && (
              <div className="px-5 pb-4 pt-3 border-t border-warm-200">
                <div className="text-xs text-charcoal-500">No obvious drag services — your menu looks healthy.</div>
              </div>
            )}
          </div>
        )}

        {/* CLIENT HEALTH DASHBOARD */}
        <ClientHealthDashboard
          shopId={shop?.id || ''}
          period={analyticsPeriod === '30' ? 'month' : analyticsPeriod === '90' ? 'quarter' : 'year'}
          appointments={appointments as any[]}
          isBarber={isBarber}
          barberId={myBarberId || undefined}
          shopOwnerId={isBarber ? shop?.owner_id || '' : profile?.id || ''}
        />

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

        {/* CLIENTS LIST */}
        {clientLocks.length > 0 && (
          <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden mb-4">
            <div className="px-5 py-4 border-b border-warm-200">
              <div className="font-serif text-charcoal-900">Clients</div>
              <div className="text-xs text-charcoal-500 mt-0.5">{clientLocks.length} clients — tap for full profile</div>
            </div>
            <div className="divide-y divide-warm-200">
              {[...clientLocks].sort((a, b) => {
                const ds = (cl: typeof a) => cl.last_booking_date
                  ? Math.floor((Date.now() - new Date(cl.last_booking_date).getTime()) / (1000 * 60 * 60 * 24))
                  : null
                const rank = (cl: typeof a) => {
                  const d = ds(cl); if (d === null) return 1
                  if (d >= 45) return 0
                  if (d >= 30) return 1
                  return 2
                }
                return rank(a) - rank(b)
              }).map(cl => {
                const name = cl.clients?.full_name || 'Unknown Client'
                const clientId = cl.clients?.id || cl.client_id
                const daysSince = cl.last_booking_date
                  ? Math.floor((Date.now() - new Date(cl.last_booking_date).getTime()) / (1000 * 60 * 60 * 24))
                  : null
                const isLapsed = daysSince !== null && daysSince >= 45
                const isAtRisk = !isLapsed && daysSince !== null && daysSince >= 30
                const statusLabel = !cl.locked ? 'Floating' : (cl.locked && daysSince !== null && (cl.loyalty_protected ? daysSince > 300 : daysSince > 60)) ? 'At Risk' : 'Locked'
                const statusColor = !cl.locked
                  ? 'text-charcoal-500 bg-warm-200'
                  : statusLabel === 'At Risk'
                    ? 'text-red-500 bg-red-50'
                    : 'text-od-green bg-od-green/10'
                return (
                  <button
                    key={cl.id}
                    onClick={() => clientId && router.push(`/dashboard/clients/${clientId}`)}
                    disabled={!clientId}
                    className="w-full px-5 py-3 flex items-center justify-between hover:bg-warm-200/50 transition-colors text-left"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-semibold text-charcoal-900">{name}</div>
                        {isLapsed && (
                          <span className="text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full text-red-600 bg-red-100">LAPSED</span>
                        )}
                        {isAtRisk && (
                          <span className="text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full text-amber-700 bg-amber-100">AT RISK</span>
                        )}
                      </div>
                      {cl.last_booking_date && (
                        <div className="text-xs text-charcoal-500 mt-0.5">
                          Last visit {daysSince === 0 ? 'today' : `${daysSince}d ago`}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full ${statusColor}`}>
                        {statusLabel}
                      </span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-charcoal-400">
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* CAMPAIGN OPPORTUNITIES */}
        {!isBarber && (
          <OpportunitiesSection
            shopId={shop?.id || ''}
            appointments={appointments as any[]}
            barbers={shopBarbers}
          />
        )}

        {/* REVIEWS SECTION */}
        {!isBarber && (
          <div className="mb-8">
            <h2 className="font-serif text-xl text-charcoal-900 mb-4">Reviews</h2>
            {reviews.length === 0 ? (
              <div className="bg-warm-100 border border-warm-200 rounded-xl p-6 text-center text-charcoal-500 text-sm">
                No reviews yet. Import from Google on the <a href="/dashboard/reviews" className="text-od-green font-semibold">Reviews page</a>.
              </div>
            ) : (
              <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-warm-200 flex items-center gap-4">
                  <span className="text-amber-500 text-2xl">★</span>
                  <div>
                    <div className="font-serif text-2xl text-charcoal-900">
                      {(reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)}
                    </div>
                    <div className="text-xs text-charcoal-500">{reviews.length} total reviews</div>
                  </div>
                </div>
                {Object.entries(barberReviewStats).length > 0 && (
                  <div className="divide-y divide-warm-200">
                    {Object.entries(barberReviewStats)
                      .sort(([, a], [, b]) => (b as any).avg - (a as any).avg)
                      .map(([barberId, stat]) => {
                        const barber = shopBarbers.find(b => b.barber_id === barberId)
                        const name = barber?.barber_name || barber?.alias || 'Barber'
                        return (
                          <div key={barberId} className="px-5 py-3 flex items-center justify-between">
                            <span className="text-sm font-semibold text-charcoal-900">{name}</span>
                            <div className="flex items-center gap-3">
                              <span className="text-amber-500 text-sm">★ {(stat as any).avg.toFixed(1)}</span>
                              <span className="text-xs text-charcoal-500">{(stat as any).count} reviews</span>
                            </div>
                          </div>
                        )
                      })
                    }
                  </div>
                )}
                {Object.entries(barberReviewStats).length > 0 && (() => {
                  const top = Object.entries(barberReviewStats).sort(([, a], [, b]) => (b as any).avg - (a as any).avg)[0]
                  if (!top) return null
                  const [topId, topStat] = top
                  const barber = shopBarbers.find(b => b.barber_id === topId)
                  const name = barber?.barber_name || barber?.alias || 'Top barber'
                  return (
                    <div className="px-5 py-3 bg-od-green/5 border-t border-warm-200">
                      <span className="text-xs text-od-green font-semibold">★ Top rated: {name} ({(topStat as any).avg.toFixed(1)})</span>
                    </div>
                  )
                })()}
              </div>
            )}
          </div>
        )}

      </div>
      </div>
      <MobileNav />
    </div>
  )
}

