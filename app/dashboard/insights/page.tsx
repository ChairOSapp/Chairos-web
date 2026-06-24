'use client'
import { useEffect, useState, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import OwnerNav from '@/components/OwnerNav'
import MobileNav from '@/components/MobileNav'
import BriefCard from '@/components/BriefCard'
import AIInsightStrip from '@/components/insights/AIInsightStrip'
import PeakHoursHeatmap from '@/components/insights/PeakHoursHeatmap'
import BarberPerformanceTable from '@/components/insights/BarberPerformanceTable'
import ClientHealthDashboard from '@/components/insights/ClientHealthDashboard'
import RevenueIntelligence from '@/components/insights/RevenueIntelligence'
import OpportunitiesSection from '@/components/insights/OpportunitiesSection'

// ---- Shared types ----

type RevPeriod = 'today' | 'week' | 'month' | 'year'
type AnalyticsPeriod = '30' | '90' | 'year'
type TabId = 'revenue' | 'analytics' | 'ai'

// Superset of both pages' Appointment interfaces
interface RevAppointment {
  id: string
  date: string
  time: string
  price: number
  client_name: string
  status: string
  barber_id: string
  client_id?: string | null
  services: { name: string } | null
}

interface AnaAppointment {
  id: string
  date: string
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

// ---- Shared helpers ----

function fmt(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function getPeriodRange(period: RevPeriod): { start: string; end: string } {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const fmtLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const today = fmtLocal(now)
  if (period === 'today') return { start: today, end: today }
  if (period === 'week') {
    const d = new Date(now); d.setDate(d.getDate() - 7)
    return { start: fmtLocal(d), end: today }
  }
  if (period === 'month') {
    const d = new Date(now); d.setDate(d.getDate() - 30)
    return { start: fmtLocal(d), end: today }
  }
  return { start: `${now.getFullYear()}-01-01`, end: today }
}

function getDaysBetween(start: string, end: string): string[] {
  const days: string[] = []
  const cur = new Date(start + 'T12:00:00')
  const endDate = new Date(end + 'T12:00:00')
  while (cur <= endDate) {
    const pad = (n: number) => String(n).padStart(2, '0')
    days.push(`${cur.getFullYear()}-${pad(cur.getMonth() + 1)}-${pad(cur.getDate())}`)
    cur.setDate(cur.getDate() + 1)
  }
  return days
}

// ---- Revenue chart components ----

function BarChart({ days, revenueByDay }: {
  days: string[]
  revenueByDay: Record<string, number>
}) {
  const values = days.map(d => revenueByDay[d] || 0)
  const maxVal = Math.max(...values, 1)

  const LEFT = 44; const RIGHT = 4; const TOP = 6; const BOT = 20
  const W = 600; const H = 130
  const cW = W - LEFT - RIGHT; const cH = H - TOP - BOT
  const count = days.length
  const slotW = count > 0 ? cW / count : cW
  const barW = Math.max(2, slotW - 2)

  if (values.every(v => v === 0)) {
    return (
      <div className="flex items-center justify-center h-28 text-charcoal-500 text-sm">
        No revenue data for this period
      </div>
    )
  }

  const yTicks = [0, Math.round(maxVal / 2), maxVal]
  const maxXLabels = Math.min(7, count)
  const xLabelIndices = Array.from({ length: maxXLabels }, (_, i) =>
    Math.floor(i * (count - 1) / Math.max(maxXLabels - 1, 1))
  ).filter((v, i, a) => a.indexOf(v) === i)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: `${H}px` }} preserveAspectRatio="none">
      {yTicks.map(t => {
        const y = TOP + cH - (t / maxVal) * cH
        return (
          <g key={t}>
            <line x1={LEFT} y1={y} x2={LEFT + cW} y2={y} stroke="#e8e0d5" strokeWidth="0.8" />
            <text x={LEFT - 4} y={y + 3} textAnchor="end" fontSize="9" fill="#9e9589" fontFamily="sans-serif">
              ${t >= 1000 ? `${(t / 1000).toFixed(0)}k` : t.toFixed(0)}
            </text>
          </g>
        )
      })}
      {values.map((v, i) => {
        const barH = Math.max(v > 0 ? 2 : 0, (v / maxVal) * cH)
        const x = LEFT + i * slotW + (slotW - barW) / 2
        const y = TOP + cH - barH
        return <rect key={days[i]} x={x} y={y} width={barW} height={barH} fill="#4B5320" rx="1" />
      })}
      {xLabelIndices.map(i => {
        const label = new Date(days[i] + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        const x = LEFT + i * slotW + slotW / 2
        return (
          <text key={i} x={x} y={H - 3} textAnchor="middle" fontSize="9" fill="#9e9589" fontFamily="sans-serif">
            {label}
          </text>
        )
      })}
    </svg>
  )
}

// ---- Analytics chart components ----

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

function MonthlyBarsChart({ year, appointments }: { year: number; appointments: AnaAppointment[] }) {
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

// ---- Main page ----

export default function InsightsPage() {
  const [tab, setTab] = useState<TabId>('revenue')
  const analyticsLoaded = useRef(false)

  // Auth/profile state
  const [userId, setUserId] = useState<string>('')
  const [role, setRole] = useState<'owner' | 'barber' | null>(null)
  const [barberId, setBarberId] = useState<string>('')          // barber's own barber_id
  const [shopOwnerId, setShopOwnerId] = useState<string>('')    // owner's profile id (for barber view alerts)
  const [profile, setProfile] = useState<any>(null)
  const [shop, setShop] = useState<any>(null)
  const [shopBarbers, setShopBarbers] = useState<ShopBarber[]>([])
  const [authLoading, setAuthLoading] = useState(true)

  // Revenue-specific state
  const [rev_period, rev_setPeriod] = useState<RevPeriod>('month')
  const [rev_appointments, rev_setAppointments] = useState<RevAppointment[]>([])
  const [rev_noshowCount, rev_setNoshowCount] = useState(0)
  const [rev_tips, rev_setTips] = useState<Tip[]>([])
  const [rev_loading, rev_setLoading] = useState(true)

  // Analytics-specific state (original analytics tab)
  const [analyticsPeriod, setAnalyticsPeriod] = useState<AnalyticsPeriod>('30')
  const [ana_appointments, ana_setAppointments] = useState<AnaAppointment[]>([])
  const [ana_tips, ana_setTips] = useState<Tip[]>([])
  const [ana_clientLocks, ana_setClientLocks] = useState<ClientLock[]>([])
  const [ana_reviews, ana_setReviews] = useState<any[]>([])
  const [ana_loading, ana_setLoading] = useState(true)

  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  // Auth + shared setup — runs once
  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/login'); return }
        setUserId(user.id)

        const { data: prof } = await supabase
          .from('profiles').select('*').eq('id', user.id).maybeSingle()
        setProfile(prof)

        const userRole: 'owner' | 'barber' = prof?.role === 'barber' ? 'barber' : 'owner'
        setRole(userRole)

        if (userRole === 'barber') {
          // Barber: find their shop entry
          const { data: myEntry } = await supabase
            .from('shop_barbers')
            .select('shop_id, barber_id, barber_name, alias, commission_rate, compensation_type, color')
            .eq('barber_id', user.id)
            .eq('active', true)
            .maybeSingle()

          if (!myEntry) { setAuthLoading(false); rev_setLoading(false); ana_setLoading(false); return }
          setBarberId(myEntry.barber_id)

          const { data: shopData } = await supabase
            .from('shops').select('*').eq('id', myEntry.shop_id).maybeSingle()
          setShop(shopData)
          // Find the shop owner's profile id
          if (shopData?.owner_id) setShopOwnerId(shopData.owner_id)

          const { data: allBarbers } = await supabase
            .from('shop_barbers')
            .select('barber_id, barber_name, alias, commission_rate, compensation_type, color')
            .eq('shop_id', myEntry.shop_id)
            .eq('active', true)
          setShopBarbers(allBarbers || [])
        } else {
          // Owner
          const { data: shopData } = await supabase
            .from('shops').select('*').eq('owner_id', user.id).maybeSingle()
          if (!shopData) { setAuthLoading(false); rev_setLoading(false); ana_setLoading(false); return }
          setShop(shopData)
          setShopOwnerId(user.id)

          const { data: barbers } = await supabase
            .from('shop_barbers')
            .select('barber_id, barber_name, alias, commission_rate, compensation_type, color')
            .eq('shop_id', shopData.id)
            .eq('active', true)
          setShopBarbers(barbers || [])
        }

        setAuthLoading(false)
      } catch {
        setAuthLoading(false)
      }
    }
    load()
  }, [])

  // Revenue data — load eagerly when shop is available, re-fetch on period change
  useEffect(() => {
    if (!shop) return
    fetchRevenueData()
  }, [shop, rev_period])

  async function fetchRevenueData() {
    if (!shop) return
    rev_setLoading(true)
    try {
      const { start, end } = getPeriodRange(rev_period)

      const baseQuery = role === 'barber' && barberId
        ? supabase
            .from('appointments')
            .select('id, date, time, price, client_name, status, barber_id, client_id, services(name)')
            .eq('shop_id', shop.id)
            .eq('status', 'done')
            .eq('barber_id', barberId)
            .gte('date', start)
            .lte('date', end)
            .order('date', { ascending: false })
        : supabase
            .from('appointments')
            .select('id, date, time, price, client_name, status, barber_id, client_id, services(name)')
            .eq('shop_id', shop.id)
            .eq('status', 'done')
            .gte('date', start)
            .lte('date', end)
            .order('date', { ascending: false })

      const tipsQuery = role === 'barber' && barberId
        ? supabase.from('tips').select('id, amount, created_at, barber_id').eq('shop_id', shop.id).eq('barber_id', barberId).gte('created_at', start).lte('created_at', end + 'T23:59:59')
        : supabase.from('tips').select('id, amount, created_at, barber_id').eq('shop_id', shop.id).gte('created_at', start).lte('created_at', end + 'T23:59:59')

      const noshowQuery = role === 'barber' && barberId
        ? supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('shop_id', shop.id).eq('status', 'noshow').eq('barber_id', barberId).gte('date', start).lte('date', end)
        : supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('shop_id', shop.id).eq('status', 'noshow').gte('date', start).lte('date', end)

      const [{ data: appts }, { data: tipsData }, { count: noshow }] = await Promise.all([
        baseQuery,
        tipsQuery,
        noshowQuery,
      ])

      rev_setAppointments((appts || []) as unknown as RevAppointment[])
      rev_setTips(tipsData || [])
      rev_setNoshowCount(noshow || 0)
    } catch {
      // swallow
    } finally {
      rev_setLoading(false)
    }
  }

  // Analytics data — load lazily on first switch to analytics tab
  useEffect(() => {
    if (tab !== 'analytics' || analyticsLoaded.current || !shop) return
    analyticsLoaded.current = true
    fetchAnalyticsData()
  }, [tab, shop])

  async function fetchAnalyticsData() {
    if (!shop) return
    ana_setLoading(true)
    try {
      const now = new Date()
      const start90 = fmt(new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000))
      const yearStart = `${now.getFullYear()}-01-01`
      const dataStart = yearStart < start90 ? yearStart : start90

      const apptQuery = role === 'barber' && barberId
        ? supabase.from('appointments').select('id, date, price, barber_id, status, client_id, services(name, id)').eq('shop_id', shop.id).eq('barber_id', barberId).gte('date', dataStart).order('date', { ascending: true })
        : supabase.from('appointments').select('id, date, price, barber_id, status, client_id, services(name, id)').eq('shop_id', shop.id).gte('date', dataStart).order('date', { ascending: true })

      const tipsQuery = role === 'barber' && barberId
        ? supabase.from('tips').select('id, amount, created_at, barber_id').eq('shop_id', shop.id).eq('barber_id', barberId).gte('created_at', dataStart)
        : supabase.from('tips').select('id, amount, created_at, barber_id').eq('shop_id', shop.id).gte('created_at', dataStart)

      const [{ data: appts }, { data: tipsData }, { data: locks }, { data: reviewsData }] = await Promise.all([
        apptQuery,
        tipsQuery,
        supabase.from('client_locks').select('id, client_id, locked, barber_id, last_booking_date, loyalty_protected, clients(id, full_name, phone)').eq('shop_id', shop.id),
        supabase.from('reviews').select('*').eq('shop_id', shop.id).eq('visible', true),
      ])

      ana_setAppointments((appts || []) as unknown as AnaAppointment[])
      ana_setTips(tipsData || [])
      ana_setClientLocks((locks || []) as unknown as ClientLock[])
      ana_setReviews(reviewsData || [])
    } catch {
      // swallow
    } finally {
      ana_setLoading(false)
    }
  }

  // ---- Revenue computed values ----

  const { start: rev_start, end: rev_end } = useMemo(() => getPeriodRange(rev_period), [rev_period])
  const rev_days = useMemo(() => getDaysBetween(rev_start, rev_end), [rev_start, rev_end])

  const rev_revenueByDay = useMemo(() => {
    const map: Record<string, number> = {}
    rev_appointments.forEach(a => {
      map[a.date] = (map[a.date] || 0) + (parseFloat(String(a.price)) || 0)
    })
    return map
  }, [rev_appointments])

  const rev_totalRevenue = rev_appointments.reduce((s, a) => s + (parseFloat(String(a.price)) || 0), 0)
  const rev_totalTips = rev_tips.reduce((s, t) => s + (parseFloat(String(t.amount)) || 0), 0)
  const rev_avgPerApt = rev_appointments.length > 0 ? rev_totalRevenue / rev_appointments.length : 0

  const rev_barberEarnings = useMemo(() => {
    return shopBarbers.map(b => {
      const bAppts = rev_appointments.filter(a => a.barber_id === b.barber_id)
      const serviceRev = bAppts.reduce((s, a) => s + (parseFloat(String(a.price)) || 0), 0)
      const rate = b.compensation_type === 'commission' ? (b.commission_rate || 0.7) : 1.0
      const cut = serviceRev * rate
      const bTips = rev_tips
        .filter(t => t.barber_id === b.barber_id)
        .reduce((s, t) => s + (parseFloat(String(t.amount)) || 0), 0)
      return {
        name: b.barber_name || b.alias || 'Barber',
        color: b.color || '#4B5320',
        cuts: cut,
        tips: bTips,
        total: cut + bTips,
        apptCount: bAppts.length,
      }
    }).sort((a, b) => b.total - a.total)
  }, [rev_appointments, rev_tips, shopBarbers])

  const REV_PERIODS: { key: RevPeriod; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
    { key: 'year', label: 'Year' },
  ]

  // ---- Analytics computed values ----

  const ana_now = new Date()
  const ana_today = fmt(ana_now)

  const ana_periodStart = useMemo(() => {
    const n = new Date()
    if (analyticsPeriod === '30') return fmt(new Date(n.getTime() - 30 * 24 * 60 * 60 * 1000))
    if (analyticsPeriod === '90') return fmt(new Date(n.getTime() - 90 * 24 * 60 * 60 * 1000))
    return `${n.getFullYear()}-01-01`
  }, [analyticsPeriod])

  const ana_periodAppts = useMemo(() =>
    ana_appointments.filter(a => a.date >= ana_periodStart && a.date <= ana_today && a.status === 'done'),
    [ana_appointments, ana_periodStart])

  const ana_periodTips = useMemo(() =>
    ana_tips.filter(t => t.created_at.slice(0, 10) >= ana_periodStart),
    [ana_tips, ana_periodStart])

  const ana_last30Start = useMemo(() => fmt(new Date(new Date().getTime() - 30 * 24 * 60 * 60 * 1000)), [])
  const ana_last30Days = useMemo(() => getDaysBetween(ana_last30Start, fmt(new Date())), [ana_last30Start])
  const ana_revenueByDay30 = useMemo(() => {
    const map: Record<string, number> = {}
    ana_appointments.filter(a => a.date >= ana_last30Start && a.status === 'done')
      .forEach(a => { map[a.date] = (map[a.date] || 0) + (parseFloat(String(a.price)) || 0) })
    return map
  }, [ana_appointments, ana_last30Start])

  const ana_yearAppts = ana_appointments.filter(a => a.date >= `${ana_now.getFullYear()}-01-01`)

  const ana_serviceBreakdown = useMemo(() => {
    const map: Record<string, { count: number; revenue: number }> = {}
    ana_periodAppts.forEach(a => {
      const name = (a.services as any)?.name || 'Unknown'
      if (!map[name]) map[name] = { count: 0, revenue: 0 }
      map[name].count++
      map[name].revenue += parseFloat(String(a.price)) || 0
    })
    return Object.entries(map)
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 10)
      .map(([name, v]) => ({ label: name, value: v.revenue, sub: `${v.count} × $${v.revenue.toFixed(0)}` }))
  }, [ana_periodAppts])

  const ana_barberPerf = useMemo(() => {
    return shopBarbers.map(b => {
      const bAppts = ana_periodAppts.filter(a => a.barber_id === b.barber_id)
      const rev = bAppts.reduce((s, a) => s + (parseFloat(String(a.price)) || 0), 0)
      const rate = b.compensation_type === 'commission' ? (b.commission_rate || 0.7) : 1.0
      const cut = rev * rate
      const bTips = ana_periodTips
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
  }, [ana_periodAppts, ana_periodTips, shopBarbers])

  const ana_lockedClients = ana_clientLocks.filter(l => l.locked)
  const ana_atRiskClients = ana_lockedClients.filter(l => {
    if (!l.last_booking_date) return false
    const daysSince = Math.floor((Date.now() - new Date(l.last_booking_date).getTime()) / (1000 * 60 * 60 * 24))
    return l.loyalty_protected ? daysSince > 300 : daysSince > 60
  })
  const ana_floatingClients = ana_clientLocks.filter(l => !l.locked)

  const ana_barberWithMostAtRisk = useMemo(() => {
    const map: Record<string, number> = {}
    ana_atRiskClients.forEach(l => { map[l.barber_id] = (map[l.barber_id] || 0) + 1 })
    const top = Object.entries(map).sort((a, b) => b[1] - a[1])[0]
    if (!top) return null
    const barber = shopBarbers.find(b => b.barber_id === top[0])
    return { name: barber?.barber_name || barber?.alias || 'Barber', count: top[1] }
  }, [ana_atRiskClients, shopBarbers])

  const ana_busyDays = useMemo(() => {
    const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const map: Record<number, { revenue: number; count: number }> = {}
    for (let i = 0; i < 7; i++) map[i] = { revenue: 0, count: 0 }
    ana_periodAppts.forEach(a => {
      const d = new Date(a.date + 'T12:00:00').getDay()
      map[d].count++
      map[d].revenue += parseFloat(String(a.price)) || 0
    })
    return Array.from({ length: 7 }, (_, i) => ({
      day: DAY_NAMES[i],
      count: map[i].count,
      revenue: map[i].revenue,
    }))
  }, [ana_periodAppts])

  const ana_busiestDay = ana_busyDays.reduce((best, d) => d.count > best.count ? d : best, ana_busyDays[0])

  const ana_barberReviewStats = useMemo(() => {
    const stats: Record<string, { name: string; count: number; total: number; avg: number }> = {}
    ana_reviews.forEach(r => {
      if (!r.barber_id) return
      if (!stats[r.barber_id]) stats[r.barber_id] = { name: r.barber_id, count: 0, total: 0, avg: 0 }
      stats[r.barber_id].count++
      stats[r.barber_id].total += r.rating
    })
    Object.values(stats).forEach(s => { s.avg = s.total / s.count })
    return stats
  }, [ana_reviews])

  const ana_serviceInsights = useMemo(() => {
    const map: Record<string, { count: number; revenue: number }> = {}
    ana_periodAppts.forEach(a => {
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
  }, [ana_periodAppts])

  const ana_totalBookings = ana_periodAppts.length
  const ana_avgServicePrice = ana_serviceInsights.length > 0
    ? ana_serviceInsights.reduce((s, e) => s + e.avgPrice, 0) / ana_serviceInsights.length
    : 0
  const ana_stars = ana_serviceInsights.filter(s => s.revenueShare >= 0.1 || s.avgPrice >= ana_avgServicePrice * 1.2).slice(0, 3)
  const ana_drag = ana_serviceInsights.filter(s =>
    s.avgPrice < ana_avgServicePrice * 0.7 && s.count < Math.max(1, ana_totalBookings * 0.05) && s.count > 0
  ).slice(0, 3)

  const ana_thisMonthStart = `${ana_now.getFullYear()}-${String(ana_now.getMonth() + 1).padStart(2, '0')}-01`
  const ana_lastMonthEnd = fmt(new Date(new Date(ana_thisMonthStart).getTime() - 1))
  const ana_lastMonthStart = `${ana_lastMonthEnd.slice(0, 7)}-01`

  const ana_thisMonthBookings = ana_appointments.filter(a => a.date >= ana_thisMonthStart).length
  const ana_lastMonthBookings = ana_appointments.filter(a => a.date >= ana_lastMonthStart && a.date <= ana_lastMonthEnd).length
  const ana_bookingChange = ana_lastMonthBookings > 0
    ? Math.round(((ana_thisMonthBookings - ana_lastMonthBookings) / ana_lastMonthBookings) * 100)
    : null

  const ANA_PERIODS: { key: AnalyticsPeriod; label: string }[] = [
    { key: '30', label: '30 Days' },
    { key: '90', label: '90 Days' },
    { key: 'year', label: 'Year' },
  ]

  // ---- Shared display values ----

  const ownerName = profile?.full_name || shop?.name || 'Owner'
  const initials = ownerName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()

  if (authLoading) return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-od-green border-t-transparent animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-warm-50 pb-20 md:pb-0">
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
            <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500 mb-1">Insights</div>
            <h1 className="font-serif text-2xl text-charcoal-900">{shop?.name || 'Your Shop'}</h1>
          </div>
          <button onClick={() => router.push('/dashboard')}
            className="text-xs font-semibold px-3 py-1 rounded-full border border-od-green/40 text-od-green bg-od-green/10 hover:bg-od-green/20 transition-colors">
            ← Dashboard
          </button>
        </div>

        {/* TAB SWITCHER */}
        <div className="flex gap-2 mb-6">
          {([
            { key: 'revenue', label: 'Revenue' },
            { key: 'analytics', label: 'Analytics' },
            { key: 'ai', label: 'AI Insights' },
          ] as { key: TabId; label: string }[]).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                tab === t.key ? 'bg-od-green text-white' : 'bg-warm-100 border border-warm-200 text-charcoal-500 hover:text-charcoal-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ---- REVENUE TAB ---- */}
        {tab === 'revenue' && (
          <>
            {rev_loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-6 h-6 rounded-full border-2 border-od-green border-t-transparent animate-spin" />
              </div>
            ) : (
              <>
                {/* PERIOD TABS */}
                <div className="flex gap-1 mb-6 bg-warm-100 border border-warm-200 rounded-xl p-1">
                  {REV_PERIODS.map(p => (
                    <button key={p.key} onClick={() => rev_setPeriod(p.key)}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
                        rev_period === p.key
                          ? 'bg-od-green text-white'
                          : 'text-charcoal-500 hover:text-charcoal-900'
                      }`}>
                      {p.label}
                    </button>
                  ))}
                </div>

                {/* HERO REVENUE + CHART */}
                <div className="bg-warm-100 border border-warm-200 rounded-2xl p-6 mb-4">
                  <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500 mb-1">Total Revenue</div>
                  <div className="font-serif text-5xl text-charcoal-900 leading-none mb-5">
                    ${rev_totalRevenue.toFixed(2)}
                  </div>
                  <BarChart days={rev_days} revenueByDay={rev_revenueByDay} />
                </div>

                {/* STATS ROW */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                  {[
                    { label: 'Completed Apts', value: rev_appointments.length.toString(), color: 'text-charcoal-900' },
                    { label: 'Tips Total', value: `$${rev_totalTips.toFixed(2)}`, color: 'text-green-400' },
                    { label: 'Avg / Apt', value: `$${rev_avgPerApt.toFixed(2)}`, color: 'text-od-green' },
                    {
                      label: 'No-show Rate',
                      value: (() => {
                        const total = rev_appointments.length + rev_noshowCount
                        if (total === 0) return '0%'
                        return `${Math.round((rev_noshowCount / total) * 100)}%`
                      })(),
                      color: rev_noshowCount > 0 ? 'text-red-400' : 'text-charcoal-500',
                    },
                  ].map((s, i) => (
                    <div key={i} className="bg-warm-100 border border-warm-200 rounded-xl p-4 text-center">
                      <div className={`font-serif text-2xl mb-1 ${s.color}`}>{s.value}</div>
                      <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500">{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* PER-BARBER EARNINGS TABLE */}
                {rev_barberEarnings.length > 0 && (
                  <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden mb-6">
                    <div className="px-5 py-4 border-b border-warm-200">
                      <div className="font-serif text-charcoal-900">Barber Earnings</div>
                      <div className="text-xs text-charcoal-500 mt-0.5">Commission / cut for this period</div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-warm-200 bg-warm-50">
                            <th className="text-left px-5 py-2 text-xs font-semibold tracking-widest uppercase text-charcoal-400">Barber</th>
                            <th className="text-right px-4 py-2 text-xs font-semibold tracking-widest uppercase text-charcoal-400">Cuts</th>
                            <th className="text-right px-4 py-2 text-xs font-semibold tracking-widest uppercase text-charcoal-400">Tips</th>
                            <th className="text-right px-5 py-2 text-xs font-semibold tracking-widest uppercase text-charcoal-400">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-warm-200">
                          {rev_barberEarnings.map((b, i) => (
                            <tr key={i}>
                              <td className="px-5 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: (b.color && b.color !== '#b8861f') ? b.color : '#4B5320' }} />
                                  <span className="text-charcoal-900 font-medium">{b.name}</span>
                                  <span className="text-xs text-charcoal-500">({b.apptCount})</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-charcoal-900">${b.cuts.toFixed(2)}</td>
                              <td className="px-4 py-3 text-right font-mono text-green-400">${b.tips.toFixed(2)}</td>
                              <td className="px-5 py-3 text-right font-mono font-semibold text-od-green">${b.total.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* APPOINTMENT LIST */}
                <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-warm-200">
                    <div className="font-serif text-charcoal-900">Appointments</div>
                    <div className="text-xs text-charcoal-500 mt-0.5">{rev_appointments.length} completed this period</div>
                  </div>
                  {rev_appointments.length === 0 ? (
                    <div className="p-8 text-center text-charcoal-500 text-sm">No completed appointments for this period.</div>
                  ) : (
                    <div className="divide-y divide-warm-200 max-h-96 overflow-y-auto">
                      {rev_appointments.map(a => {
                        const barber = shopBarbers.find(b => b.barber_id === a.barber_id)
                        return (
                          <div key={a.id} className="px-5 py-3 flex items-center justify-between">
                            <div>
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-xs font-mono text-od-green">
                                  {new Date(a.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </span>
                                <span className="text-xs text-charcoal-500">{a.time?.slice(0, 5)}</span>
                              </div>
                              <div className="text-sm font-semibold text-charcoal-900">{a.client_name}</div>
                              <div className="text-xs text-charcoal-500">
                                {(a.services as any)?.name || 'Service'}
                                {barber && <span className="ml-1">&middot; {barber.barber_name || barber.alias}</span>}
                              </div>
                            </div>
                            <div className="font-mono text-sm font-semibold text-charcoal-900">${parseFloat(String(a.price)).toFixed(2)}</div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {/* ---- ANALYTICS TAB ---- */}
        {tab === 'analytics' && (
          <>
            {ana_loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-6 h-6 rounded-full border-2 border-od-green border-t-transparent animate-spin" />
              </div>
            ) : (
              <>
                {/* AI INSIGHT STRIP — always above content */}
                {userId && <AIInsightStrip userId={userId} />}

                {role === 'owner' ? (
                  <>
                    <RevenueIntelligence
                      shopId={shop?.id || ''}
                      period={rev_period}
                      appointments={rev_appointments as any[]}
                      tips={rev_tips}
                    />
                    <PeakHoursHeatmap shopId={shop?.id || ''} period={rev_period} />
                    <BarberPerformanceTable
                      shopId={shop?.id || ''}
                      period={rev_period}
                      barbers={shopBarbers}
                      appointments={rev_appointments as any[]}
                      tips={rev_tips}
                    />
                    <ClientHealthDashboard
                      shopId={shop?.id || ''}
                      period={rev_period}
                      appointments={rev_appointments as any[]}
                      shopOwnerId={userId}
                    />
                    <OpportunitiesSection
                      shopId={shop?.id || ''}
                      appointments={rev_appointments as any[]}
                      barbers={shopBarbers}
                    />
                  </>
                ) : (
                  <>
                    <BarberPerformanceTable
                      shopId={shop?.id || ''}
                      period={rev_period}
                      barbers={shopBarbers}
                      appointments={rev_appointments as any[]}
                      tips={rev_tips}
                      selfBarberId={barberId}
                    />
                    <ClientHealthDashboard
                      shopId={shop?.id || ''}
                      period={rev_period}
                      appointments={rev_appointments as any[]}
                      shopOwnerId={shopOwnerId}
                      isBarber
                      barberId={barberId}
                    />
                    <OpportunitiesSection
                      shopId={shop?.id || ''}
                      appointments={rev_appointments as any[]}
                      barbers={shopBarbers}
                      isBarber
                    />
                  </>
                )}

                {/* PERIOD SELECTOR */}
                <div className="flex gap-1 mb-6 bg-warm-100 border border-warm-200 rounded-xl p-1 mt-6">
                  {ANA_PERIODS.map(p => (
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
                    <LineTrendChart days={ana_last30Days} revenueByDay={ana_revenueByDay30} />
                  </div>
                </div>

                {/* B) MONTHLY REVENUE BARS */}
                <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden mb-4">
                  <div className="px-5 py-4 border-b border-warm-200">
                    <div className="font-serif text-charcoal-900">Monthly Revenue</div>
                    <div className="text-xs text-charcoal-500 mt-0.5">{ana_now.getFullYear()} — current month highlighted</div>
                  </div>
                  <div className="p-4">
                    <MonthlyBarsChart year={ana_now.getFullYear()} appointments={ana_yearAppts} />
                  </div>
                </div>

                {/* F) BOOKING VOLUME */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-warm-100 border border-warm-200 rounded-xl p-5">
                    <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500 mb-2">This Month</div>
                    <div className="font-serif text-3xl text-charcoal-900">{ana_thisMonthBookings}</div>
                    <div className="text-xs text-charcoal-500 mt-1">bookings</div>
                    {ana_bookingChange !== null && (
                      <div className={`text-xs font-semibold mt-2 ${ana_bookingChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {ana_bookingChange >= 0 ? '▲' : '▼'} {Math.abs(ana_bookingChange)}% vs last month
                      </div>
                    )}
                  </div>
                  <div className="bg-warm-100 border border-warm-200 rounded-xl p-5">
                    <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500 mb-2">Last Month</div>
                    <div className="font-serif text-3xl text-charcoal-900">{ana_lastMonthBookings}</div>
                    <div className="text-xs text-charcoal-500 mt-1">bookings</div>
                  </div>
                </div>

                {/* C) SERVICE REVENUE BREAKDOWN */}
                {ana_serviceBreakdown.length > 0 && (() => {
                  const totalSvcRev = ana_serviceBreakdown.reduce((s, i) => s + i.value, 0)
                  const maxSvcRev = Math.max(...ana_serviceBreakdown.map(i => i.value), 1)
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
                        {ana_serviceBreakdown.map((item, i) => {
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

                {/* D) BARBER PERFORMANCE (Analytics native) */}
                {role === 'owner' && ana_barberPerf.length > 0 && (() => {
                  const shopTotal = ana_barberPerf.reduce((s, b) => s + b.value, 0)
                  return (
                    <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden mb-4">
                      <div className="px-5 py-4 border-b border-warm-200">
                        <div className="font-serif text-charcoal-900">Barber Performance</div>
                        <div className="text-xs text-charcoal-500 mt-0.5">Cuts + tips for selected period · ranked by total earnings</div>
                      </div>
                      <div className="divide-y divide-warm-200">
                        {ana_barberPerf.map((b, i) => {
                          const cuts = b.cutsTotal ?? 0
                          const tips = b.tipsTotal ?? 0
                          const avgTicket = b.avgTicket ?? 0
                          const share = shopTotal > 0 ? b.value / shopTotal : 0
                          const barberInitials = b.label.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
                          const rankColors = ['text-od-green', 'text-charcoal-500', 'text-charcoal-400']
                          return (
                            <div key={i} className="px-5 py-4">
                              <div className="flex items-start gap-3 mb-3">
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <span className={`text-xs font-bold w-4 text-right ${rankColors[i] || 'text-charcoal-400'}`}>#{i + 1}</span>
                                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                                    style={{ background: b.color || '#4B5320' }}>
                                    {barberInitials}
                                  </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-semibold text-charcoal-900 mb-0.5">{b.label}</div>
                                  <div className="text-xs text-charcoal-500">{b.apptCount ?? 0} cuts · ${avgTicket.toFixed(0)}/avg ticket</div>
                                </div>
                                <div className="text-right flex-shrink-0">
                                  <div className="font-mono text-sm font-bold text-od-green">${b.value.toFixed(0)}</div>
                                  <div className="text-xs text-charcoal-400">total</div>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2 mb-3">
                                <div className="bg-warm-200/60 rounded-lg px-3 py-2 text-center">
                                  <div className="font-mono text-sm font-semibold text-charcoal-900">${cuts.toFixed(0)}</div>
                                  <div className="text-[10px] font-semibold tracking-widest uppercase text-charcoal-500">Cuts</div>
                                </div>
                                <div className="bg-warm-200/60 rounded-lg px-3 py-2 text-center">
                                  <div className="font-mono text-sm font-semibold text-green-500">${tips.toFixed(0)}</div>
                                  <div className="text-[10px] font-semibold tracking-widest uppercase text-charcoal-500">Tips</div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-1.5 bg-warm-200 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full bg-od-green" style={{ width: `${Math.max(2, share * 100)}%` }} />
                                </div>
                                <span className="text-xs text-charcoal-400 flex-shrink-0">{Math.round(share * 100)}% of shop</span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })()}

                {/* G) BUSIEST DAYS */}
                {ana_totalBookings > 0 && (
                  <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden mb-4">
                    <div className="px-5 py-4 border-b border-warm-200">
                      <div className="font-serif text-charcoal-900">Busiest Days</div>
                      <div className="text-xs text-charcoal-500 mt-0.5">Bookings and revenue by day of week</div>
                    </div>
                    <div className="p-4">
                      {(() => {
                        const maxCount = Math.max(...ana_busyDays.map(x => x.count), 1)
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
                            {ana_busyDays.map((d, i) => {
                              const barH = d.count > 0 ? Math.max(3, (d.count / maxCount) * cH) : 0
                              const x = LEFT + i * slotW + (slotW - barW) / 2
                              const y = TOP + cH - barH
                              const isBest = d.day === ana_busiestDay.day && d.count > 0
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
                    {ana_busiestDay.count > 0 && (
                      <div className="border-t border-warm-200 px-5 py-3 bg-od-green/5">
                        <div className="text-xs text-od-green font-semibold">
                          {ana_busiestDay.day} is your busiest day — {ana_busiestDay.count} bookings, ${ana_busiestDay.revenue.toFixed(0)} revenue
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* H) SERVICE INSIGHTS */}
                {ana_serviceInsights.length > 0 && (
                  <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden mb-4">
                    <div className="px-5 py-4 border-b border-warm-200">
                      <div className="font-serif text-charcoal-900">Service Insights</div>
                      <div className="text-xs text-charcoal-500 mt-0.5">What&apos;s driving revenue — and what&apos;s not</div>
                    </div>

                    {ana_stars.length > 0 && (
                      <div className="px-5 pt-4 pb-3">
                        <div className="flex items-center gap-1.5 mb-2">
                          <span className="text-xs font-bold tracking-widest uppercase text-od-green">Stars</span>
                          <span className="text-[10px] text-charcoal-400">High revenue, above-avg ticket</span>
                        </div>
                        <div className="space-y-2">
                          {ana_stars.map((s, i) => (
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

                    {ana_drag.length > 0 && (
                      <div className={`px-5 pb-4 ${ana_stars.length > 0 ? 'pt-3 border-t border-warm-200' : 'pt-4'}`}>
                        <div className="flex items-center gap-1.5 mb-2">
                          <span className="text-xs font-bold tracking-widest uppercase text-red-400">Drag</span>
                          <span className="text-[10px] text-charcoal-400">Low ticket price, rarely booked</span>
                        </div>
                        <div className="space-y-2">
                          {ana_drag.map((s, i) => (
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

                    {ana_drag.length === 0 && ana_stars.length > 0 && (
                      <div className="px-5 pb-4 pt-3 border-t border-warm-200">
                        <div className="text-xs text-charcoal-500">No obvious drag services — your menu looks healthy.</div>
                      </div>
                    )}
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
                      <div className="font-serif text-2xl text-green-400 mb-1">{ana_lockedClients.length}</div>
                      <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500">Locked</div>
                    </div>
                    <div className="p-4 text-center">
                      <div className={`font-serif text-2xl mb-1 ${ana_atRiskClients.length > 0 ? 'text-od-green' : 'text-charcoal-600'}`}>
                        {ana_atRiskClients.length}
                      </div>
                      <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500">At Risk</div>
                    </div>
                    <div className="p-4 text-center">
                      <div className="font-serif text-2xl text-charcoal-500 mb-1">{ana_floatingClients.length}</div>
                      <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500">Floating</div>
                    </div>
                  </div>
                  {ana_barberWithMostAtRisk && (
                    <div className="border-t border-warm-200 px-5 py-3 bg-od-green/5">
                      <div className="text-xs text-od-green font-semibold">
                        Most at-risk: {ana_barberWithMostAtRisk.name} ({ana_barberWithMostAtRisk.count} clients)
                      </div>
                    </div>
                  )}
                </div>

                {/* CLIENTS LIST */}
                {ana_clientLocks.length > 0 && (
                  <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden mb-4">
                    <div className="px-5 py-4 border-b border-warm-200">
                      <div className="font-serif text-charcoal-900">Clients</div>
                      <div className="text-xs text-charcoal-500 mt-0.5">{ana_clientLocks.length} clients — tap for full profile</div>
                    </div>
                    <div className="divide-y divide-warm-200">
                      {[...ana_clientLocks].sort((a, b) => {
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

                {/* REVIEWS SECTION */}
                <div className="mb-8">
                  <h2 className="font-serif text-xl text-charcoal-900 mb-4">Reviews</h2>
                  {ana_reviews.length === 0 ? (
                    <div className="bg-warm-100 border border-warm-200 rounded-xl p-6 text-center text-charcoal-500 text-sm">
                      No reviews yet. Import from Google on the <a href="/dashboard/reviews" className="text-od-green font-semibold">Reviews page</a>.
                    </div>
                  ) : (
                    <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden">
                      {/* Shop average */}
                      <div className="px-5 py-4 border-b border-warm-200 flex items-center gap-4">
                        <span className="text-amber-500 text-2xl">★</span>
                        <div>
                          <div className="font-serif text-2xl text-charcoal-900">
                            {(ana_reviews.reduce((s, r) => s + r.rating, 0) / ana_reviews.length).toFixed(1)}
                          </div>
                          <div className="text-xs text-charcoal-500">{ana_reviews.length} total reviews</div>
                        </div>
                      </div>
                      {/* Per-barber breakdown */}
                      {Object.entries(ana_barberReviewStats).length > 0 && (
                        <div className="divide-y divide-warm-200">
                          {Object.entries(ana_barberReviewStats)
                            .sort(([, a], [, b]) => b.avg - a.avg)
                            .map(([barberId, stat]) => {
                              const barber = shopBarbers.find(b => b.barber_id === barberId)
                              const name = barber?.barber_name || barber?.alias || 'Barber'
                              return (
                                <div key={barberId} className="px-5 py-3 flex items-center justify-between">
                                  <span className="text-sm font-semibold text-charcoal-900">{name}</span>
                                  <div className="flex items-center gap-3">
                                    <span className="text-amber-500 text-sm">★ {stat.avg.toFixed(1)}</span>
                                    <span className="text-xs text-charcoal-500">{stat.count} reviews</span>
                                  </div>
                                </div>
                              )
                            })
                          }
                        </div>
                      )}
                      {/* Top barber callout */}
                      {Object.entries(ana_barberReviewStats).length > 0 && (() => {
                        const top = Object.entries(ana_barberReviewStats).sort(([, a], [, b]) => b.avg - a.avg)[0]
                        if (!top) return null
                        const [topId, topStat] = top
                        const barber = shopBarbers.find(b => b.barber_id === topId)
                        const name = barber?.barber_name || barber?.alias || 'Top barber'
                        return (
                          <div className="px-5 py-3 bg-od-green/5 border-t border-warm-200">
                            <span className="text-xs text-od-green font-semibold">★ Top rated: {name} ({topStat.avg.toFixed(1)})</span>
                          </div>
                        )
                      })()}
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {/* ---- AI INSIGHTS TAB ---- */}
        {tab === 'ai' && (
          <div className="space-y-4">
            <BriefCard recipientName={profile?.full_name} />
            <p className="text-xs text-charcoal-400 text-center">Daily briefs generate at 7am ET from the previous day&apos;s data.</p>
          </div>
        )}

      </div>
      <MobileNav />
    </div>
  )
}
