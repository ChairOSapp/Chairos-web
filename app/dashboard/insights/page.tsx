'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, usePathname } from 'next/navigation'
import OwnerNav from '@/components/OwnerNav'
import StaffNav from '@/components/StaffNav'
import MobileNav from '@/components/MobileNav'
import { Tabs, TabsList, SlidingTabsTrigger, TabsContent } from '@/components/ui/tabs'
import { StepPanel } from '@/components/motion'
import AIInsightStrip from '@/components/insights/AIInsightStrip'
import PeakHoursHeatmap from '@/components/insights/PeakHoursHeatmap'
import ClientHealthDashboard from '@/components/insights/ClientHealthDashboard'
import RevenueIntelligence from '@/components/insights/RevenueIntelligence'
import OpportunitiesSection from '@/components/insights/OpportunitiesSection'
import PrescriptiveOpportunities from '@/components/insights/PrescriptiveOpportunities'
import CrmInsightsPanel from '@/components/insights/CrmInsightsPanel'
import TodaySection, { TodayAppt } from '@/components/insights/TodaySection'
import { buildCampaignHref } from '@/lib/campaignHref'
import { useVerticalLabels } from '@/lib/VerticalContext'
import {
  ResponsiveContainer,
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'

// ---- Shared types ----

type RevPeriod = 'today' | 'week' | 'month' | 'year'

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
  const today = fmt(now)
  if (period === 'today') return { start: today, end: today }
  if (period === 'week') {
    const d = new Date(now); d.setDate(d.getDate() - 7)
    return { start: fmt(d), end: today }
  }
  if (period === 'month') {
    const d = new Date(now); d.setDate(d.getDate() - 30)
    return { start: fmt(d), end: today }
  }
  return { start: `${now.getFullYear()}-01-01`, end: today }
}

function getDaysBetween(start: string, end: string): string[] {
  const days: string[] = []
  const cur = new Date(start + 'T12:00:00')
  const endDate = new Date(end + 'T12:00:00')
  while (cur <= endDate) {
    days.push(fmt(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return days
}

function money(n: number, decimals?: number) {
  const d = decimals ?? (n < 100 ? 2 : 0)
  return `$${n.toFixed(d)}`
}

// ---- Revenue bar chart (Recharts) ----

function BarChart({ days, revenueByDay }: {
  days: string[]
  revenueByDay: Record<string, number>
}) {
  const values = days.map(d => revenueByDay[d] || 0)
  const maxVal = Math.max(...values, 1)

  if (values.every(v => v === 0)) {
    return (
      <div className="flex items-center justify-center h-28 text-charcoal-500 text-sm">
        No revenue data for this period
      </div>
    )
  }

  // Same label thinning as the old hand-rolled chart: at most 7 evenly
  // spaced day labels, empty strings elsewhere.
  const count = days.length
  const maxXLabels = Math.min(7, count)
  const labelIndices = new Set(
    Array.from({ length: maxXLabels }, (_, i) =>
      Math.floor(i * (count - 1) / Math.max(maxXLabels - 1, 1))
    )
  )
  const data = days.map((d, i) => ({
    label: labelIndices.has(i)
      ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : '',
    revenue: values[i],
  }))
  const yTicks = [...new Set([0, Math.round(maxVal / 2), maxVal])]

  return (
    <ResponsiveContainer width="100%" height={130}>
      <RechartsBarChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 0 }} barCategoryGap="20%">
        <CartesianGrid vertical={false} stroke="var(--color-border)" strokeWidth={0.8} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          interval={0}
          height={20}
          dy={6}
          tick={{ fontSize: 9, fill: 'var(--color-text-secondary)' }}
        />
        <YAxis
          width={40}
          tickLine={false}
          axisLine={false}
          domain={[0, maxVal]}
          ticks={yTicks}
          tick={{ fontSize: 9, fill: 'var(--color-text-secondary)' }}
          tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`)}
        />
        <Bar dataKey="revenue" fill="var(--color-primary)" radius={[2, 2, 0, 0]} minPointSize={2} />
      </RechartsBarChart>
    </ResponsiveContainer>
  )
}

// ---- Weekly goal bar (stored on-device) ----

function GoalBar({ weekRevenue }: { weekRevenue: number }) {
  const [goal, setGoal] = useState<number | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    try {
      const raw = localStorage.getItem('chairos_weekly_goal')
      if (raw) setGoal(parseFloat(raw) || null)
    } catch { /* ignore */ }
  }, [])

  function save() {
    const v = parseFloat(draft)
    if (!v || v <= 0) return
    setGoal(v)
    try { localStorage.setItem('chairos_weekly_goal', String(v)) } catch { /* ignore */ }
    setEditing(false)
  }

  if (goal === null && !editing) {
    return (
      <button onClick={() => { setDraft(''); setEditing(true) }}
        className="w-full text-left bg-warm-100 border border-dashed border-warm-300 rounded-xl px-5 py-4 mb-4 hover:border-od-green transition-colors">
        <div className="text-sm font-semibold text-charcoal-900">Set a weekly goal</div>
        <div className="text-xs text-charcoal-500 mt-0.5">Pick a number — we&apos;ll track your progress here.</div>
      </button>
    )
  }

  if (editing || goal === null) {
    return (
      <div className="bg-warm-100 border border-warm-200 rounded-xl px-5 py-4 mb-4">
        <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500 mb-2">Weekly goal</div>
        <div className="flex gap-2">
          <input type="number" min="1" value={draft} onChange={e => setDraft(e.target.value)}
            placeholder="e.g. 1200"
            className="flex-1 bg-warm-200 border border-warm-300 rounded-lg px-4 py-2.5 text-charcoal-900 text-sm outline-none focus:border-od-green" />
          <button onClick={save} className="btn-chairos">Save</button>
          {goal !== null && (
            <button onClick={() => setEditing(false)} className="btn-chairos-outline">Cancel</button>
          )}
        </div>
      </div>
    )
  }

  const pct = Math.min(1, weekRevenue / goal)
  return (
    <button onClick={() => { setDraft(String(goal)); setEditing(true) }}
      className="w-full text-left bg-warm-100 border border-warm-200 rounded-xl px-5 py-4 mb-4 hover:border-od-green transition-colors">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500">Weekly goal</div>
        <div className="text-xs text-charcoal-500">
          <span className="font-mono font-semibold text-charcoal-900">{money(weekRevenue)}</span> of {money(goal)}
        </div>
      </div>
      <div className="h-2 bg-warm-200 rounded-full overflow-hidden">
        <div className="h-full rounded-full bg-od-green transition-all" style={{ width: `${Math.max(2, pct * 100)}%` }} />
      </div>
      <div className="text-xs text-charcoal-500 mt-2">
        {pct >= 1 ? 'Goal hit — great week.' : `${Math.round(pct * 100)}% there · ${money(Math.max(0, goal - weekRevenue))} to go`}
        <span className="text-charcoal-400"> · tap to change</span>
      </div>
    </button>
  )
}

// ---- Section heading ----

function SectionHead({ id, title, sub }: { id: string; title: string; sub: string }) {
  return (
    <div id={id} className="mb-4 scroll-mt-32">
      <h2 className="font-serif text-xl text-charcoal-900">{title}</h2>
      <p className="text-xs text-charcoal-500 mt-0.5">{sub}</p>
    </div>
  )
}

// ---- Main page ----

export default function InsightsPage() {
  const { staffLabel } = useVerticalLabels()
  const [referralRewards, setReferralRewards] = useState<any[]>([])
  const [referralsLoading, setReferralsLoading] = useState(false)

  // Auth/profile state
  const [userId, setUserId] = useState<string>('')
  const [role, setRole] = useState<'owner' | 'barber' | null>(null)
  const [barberId, setBarberId] = useState<string>('')
  const [shopOwnerId, setShopOwnerId] = useState<string>('')
  const [profile, setProfile] = useState<any>(null)
  const [shop, setShop] = useState<any>(null)
  const [shopBarbers, setShopBarbers] = useState<ShopBarber[]>([])
  const [authLoading, setAuthLoading] = useState(true)

  // Revenue state
  const [rev_period, rev_setPeriod] = useState<RevPeriod>('month')
  const [rev_appointments, rev_setAppointments] = useState<RevAppointment[]>([])
  const [rev_noshowCount, rev_setNoshowCount] = useState(0)
  const [rev_tips, rev_setTips] = useState<Tip[]>([])
  const [rev_loading, rev_setLoading] = useState(true)
  const [rev_history, rev_setHistory] = useState<{ amount_cents: number; paid_at: string }[]>([])

  // Today state (new: run the day, not just review it)
  const [today_appts, setTodayAppts] = useState<TodayAppt[]>([])
  const [today_tips, setTodayTips] = useState(0)

  // Analytics state
  const [ana_appointments, ana_setAppointments] = useState<AnaAppointment[]>([])
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
          if (shopData?.owner_id) setShopOwnerId(shopData.owner_id)

          const { data: allBarbers } = await supabase
            .from('shop_barbers')
            .select('barber_id, barber_name, alias, commission_rate, compensation_type, color')
            .eq('shop_id', myEntry.shop_id)
            .eq('active', true)
          setShopBarbers(allBarbers || [])
        } else {
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

  // Revenue data — re-fetch on period change
  useEffect(() => {
    if (!shop) return
    fetchRevenueData()
  }, [shop, rev_period])

  // Analytics + referrals — load once the shop is known
  useEffect(() => {
    if (!shop) return
    fetchAnalyticsData()
    fetchReferralRewards()
  }, [shop])

  async function fetchRevenueData() {
    if (!userId) return
    const shopId = shop.id
    const isBarber = role === 'barber' && barberId
    rev_setLoading(true)
    try {
      const { start, end } = getPeriodRange(rev_period)
      const todayStr = fmt(new Date())

      const apptSelect = 'id, date, time, price, client_name, status, barber_id, client_id, services(name)'
      const baseQuery = isBarber
        ? supabase.from('appointments').select(apptSelect).eq('shop_id', shopId).eq('status', 'done').eq('barber_id', barberId).gte('date', start).lte('date', end).order('date', { ascending: false })
        : supabase.from('appointments').select(apptSelect).eq('shop_id', shopId).eq('status', 'done').gte('date', start).lte('date', end).order('date', { ascending: false })

      const tipsQuery = isBarber
        ? supabase.from('tips').select('id, amount, created_at, barber_id').eq('shop_id', shopId).eq('barber_id', barberId).gte('created_at', start).lte('created_at', end + 'T23:59:59')
        : supabase.from('tips').select('id, amount, created_at, barber_id').eq('shop_id', shopId).gte('created_at', start).lte('created_at', end + 'T23:59:59')

      const noshowQuery = isBarber
        ? supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('shop_id', shopId).eq('status', 'noshow').eq('barber_id', barberId).gte('date', start).lte('date', end)
        : supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('shop_id', shopId).eq('status', 'noshow').gte('date', start).lte('date', end)

      const todayApptQuery = isBarber
        ? supabase.from('appointments').select(apptSelect).eq('shop_id', shopId).eq('barber_id', barberId).eq('date', todayStr).neq('status', 'cancelled').order('time', { ascending: true })
        : supabase.from('appointments').select(apptSelect).eq('shop_id', shopId).eq('date', todayStr).neq('status', 'cancelled').order('time', { ascending: true })

      const todayTipsQuery = isBarber
        ? supabase.from('tips').select('amount').eq('shop_id', shopId).eq('barber_id', barberId).gte('created_at', todayStr).lte('created_at', todayStr + 'T23:59:59')
        : supabase.from('tips').select('amount').eq('shop_id', shopId).gte('created_at', todayStr).lte('created_at', todayStr + 'T23:59:59')

      const [{ data: appts }, { data: tipsData }, { count: noshow }, { data: historyData }, { data: todayAppts }, { data: todayTipsData }] = await Promise.all([
        baseQuery,
        tipsQuery,
        noshowQuery,
        supabase.from('square_payment_history')
          .select('amount_cents, paid_at')
          .eq('shop_id', shopId)
          .gte('paid_at', start)
          .lte('paid_at', end + 'T23:59:59'),
        todayApptQuery,
        todayTipsQuery,
      ])

      rev_setAppointments((appts || []) as unknown as RevAppointment[])
      rev_setTips(tipsData || [])
      rev_setNoshowCount(noshow || 0)
      const joinedAt = shop.created_at ? new Date(shop.created_at).getTime() : 0
      rev_setHistory(((historyData || []) as { amount_cents: number; paid_at: string }[])
        .filter(h => h.paid_at && new Date(h.paid_at).getTime() < joinedAt))
      setTodayAppts((todayAppts || []) as unknown as TodayAppt[])
      setTodayTips((todayTipsData || []).reduce((s, t: any) => s + (parseFloat(String(t.amount)) || 0), 0))
    } catch {
      // swallow
    } finally {
      rev_setLoading(false)
    }
  }

  async function fetchAnalyticsData() {
    if (!shop) return
    ana_setLoading(true)
    try {
      const now = new Date()
      const start90 = fmt(new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000))
      const yearStart = `${now.getFullYear()}-01-01`
      const dataStart = yearStart < start90 ? yearStart : start90
      const isBarber = role === 'barber' && barberId

      const apptQuery = isBarber
        ? supabase.from('appointments').select('id, date, price, barber_id, status, client_id, services(name, id)').eq('shop_id', shop.id).eq('barber_id', barberId).gte('date', dataStart).order('date', { ascending: true })
        : supabase.from('appointments').select('id, date, price, barber_id, status, client_id, services(name, id)').eq('shop_id', shop.id).gte('date', dataStart).order('date', { ascending: true })

      const [{ data: appts }, { data: locks }, { data: reviewsData }] = await Promise.all([
        apptQuery,
        supabase.from('client_locks').select('id, client_id, locked, barber_id, last_booking_date, loyalty_protected, clients(id, full_name, phone)').eq('shop_id', shop.id),
        supabase.from('reviews').select('*').eq('shop_id', shop.id).eq('visible', true),
      ])

      ana_setAppointments((appts || []) as unknown as AnaAppointment[])
      ana_setClientLocks((locks || []) as unknown as ClientLock[])
      ana_setReviews(reviewsData || [])
    } catch {
      // swallow
    } finally {
      ana_setLoading(false)
    }
  }

  async function fetchReferralRewards() {
    if (!shop) return
    setReferralsLoading(true)
    try {
      const { data } = await supabase
        .from('referral_rewards')
        .select(`
          id, status, reward_type, reward_value, created_at, earned_at, redeemed_at,
          referring:clients!referral_rewards_referring_client_id_fkey(full_name, phone),
          referred:clients!referral_rewards_referred_client_id_fkey(full_name, phone)
        `)
        .eq('shop_id', shop.id)
        .order('created_at', { ascending: false })
      setReferralRewards(data || [])
    } finally {
      setReferralsLoading(false)
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
    rev_history.forEach(h => {
      const day = h.paid_at.slice(0, 10)
      map[day] = (map[day] || 0) + (h.amount_cents || 0) / 100
    })
    return map
  }, [rev_appointments, rev_history])

  const rev_totalRevenue = rev_appointments.reduce((s, a) => s + (parseFloat(String(a.price)) || 0), 0)
    + rev_history.reduce((s, h) => s + (h.amount_cents || 0) / 100, 0)
  const rev_historyRevenue = rev_history.reduce((s, h) => s + (h.amount_cents || 0) / 100, 0)
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
        name: b.barber_name || b.alias || staffLabel,
        color: b.color || '#4B5320',
        barber_id: b.barber_id,
        cuts: cut,
        tips: bTips,
        total: cut + bTips,
        apptCount: bAppts.length,
      }
    }).sort((a, b) => b.total - a.total)
  }, [rev_appointments, rev_tips, shopBarbers])

  const myEarnings = role === 'barber' && barberId
    ? rev_barberEarnings.filter(b => b.barber_id === barberId)
    : rev_barberEarnings

  const REV_PERIODS: { key: RevPeriod; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
    { key: 'year', label: 'Year' },
  ]

  // ---- Services computed values ----

  const ana_now = new Date()
  const ana_today = fmt(ana_now)
  const svc_periodStart = rev_start

  const ana_periodAppts = useMemo(() =>
    ana_appointments.filter(a => a.date >= svc_periodStart && a.date <= ana_today && a.status === 'done'),
    [ana_appointments, svc_periodStart])

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
      .map(([name, v]) => ({ label: name, value: v.revenue, count: v.count }))
  }, [ana_periodAppts])

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

  // ---- Clients: who needs attention ----

  const atRiskList = useMemo(() => {
    const nowMs = Date.now()
    return ana_clientLocks
      .filter(l => l.locked && l.last_booking_date)
      .map(l => {
        const daysSince = Math.floor((nowMs - new Date(l.last_booking_date! + 'T12:00:00').getTime()) / (1000 * 60 * 60 * 24))
        return {
          id: l.id,
          clientId: l.clients?.id || l.client_id,
          name: l.clients?.full_name || 'Unknown client',
          phone: l.clients?.phone,
          daysSince,
        }
      })
      .filter(c => c.daysSince >= 30 && c.clientId)
      .sort((a, b) => b.daysSince - a.daysSince)
      .slice(0, 6)
  }, [ana_clientLocks])

  // ---- Weekly goal progress (last 7 days, done only) ----

  const weekRevenue = useMemo(() => {
    const weekStart = fmt(new Date(Date.now() - 7 * 86400000))
    return ana_appointments
      .filter(a => a.date >= weekStart && a.status === 'done')
      .reduce((s, a) => s + (parseFloat(String(a.price)) || 0), 0)
  }, [ana_appointments])

  // ---- Reviews ----

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

  // ---- Shared display values ----

  const ownerName = profile?.full_name || shop?.name || 'Owner'
  const initials = ownerName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
  const isSoloChair = role === 'barber' && shopOwnerId === userId
  const isShopOwner = shopOwnerId === userId && !!shopOwnerId
  const myBarberRow = shopBarbers.find(b => b.barber_id === userId)
  const soloBarberName = myBarberRow?.barber_name || myBarberRow?.alias || ownerName

  const tabs: { id: string; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: 'money', label: 'Money' },
    { id: 'clients', label: 'Clients' },
    { id: 'actions', label: 'Actions' },
    { id: 'services', label: 'Services' },
    { id: 'reviews', label: 'Reviews' },
    { id: 'referrals', label: 'Referrals' },
  ]
  if (isShopOwner) tabs.push({ id: 'shop', label: 'Shop' })

  // Real tabs, deep-linkable via ?tab=. Unknown ids (or the owner-only Shop
  // tab for non-owners) fall back to Today.
  const [activeTab, setActiveTab] = useState('today')
  const pathname = usePathname()
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab')
    if (
      t &&
      ['today', 'money', 'clients', 'actions', 'services', 'reviews', 'referrals', 'shop'].includes(t)
    ) {
      setActiveTab(t)
    }
  }, [])
  const safeTab = tabs.some(t => t.id === activeTab) ? activeTab : 'today'
  const selectTab = (id: string) => {
    setActiveTab(id)
    router.replace(`${pathname}?tab=${id}`, { scroll: false })
  }

  if (authLoading) return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-od-green border-t-transparent animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-warm-50 md:pb-0">
      {isSoloChair ? (
        <StaffNav
          shopName={shop?.name || ''}
          barberName={soloBarberName}
          color={myBarberRow?.color || '#b8861f'}
          initial={soloBarberName[0]?.toUpperCase() || 'S'}
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

      <div className="p-6 max-w-3xl mx-auto pb-24 md:pb-8">

        {/* HEADER */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500 mb-1">Insights</div>
            <h1 className="font-serif text-2xl text-charcoal-900">{shop?.name || 'Your Shop'}</h1>
          </div>
          <button onClick={() => router.push(role === 'barber' ? '/dashboard/chair' : '/dashboard')} className="btn-chairos-outline">Dashboard</button>
        </div>

        {/* SECTION TABS — sticky bar; panels swap in place below, no anchor jumping */}
        <Tabs value={safeTab} onValueChange={selectTab}>
          <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-30 -mx-6 px-6 py-2 bg-warm-50/95 backdrop-blur mb-6">
            <TabsList aria-label="Insights sections">
              {tabs.map(t => (
                <SlidingTabsTrigger key={t.id} value={t.id} pillLayoutId="insights-tab-pill">
                  {t.label}
                </SlidingTabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="today">
            <StepPanel>

        {/* THIS MORNING — the daily brief, once */}
        {userId && <AIInsightStrip userId={userId} />}

        {/* TODAY — how's my day looking? */}
        {rev_loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 rounded-full border-2 border-od-green border-t-transparent animate-spin" />
          </div>
        ) : (
          <TodaySection
            appts={today_appts}
            tipsToday={today_tips}
            barbers={shopBarbers}
            scopeBarberId={role === 'barber' ? barberId : null}
            staffLabel={staffLabel}
          />
        )}
            </StepPanel>
          </TabsContent>

          <TabsContent value="money">
            <StepPanel>
        {/* MONEY — am I making what I should? */}
        <SectionHead id="money" title="Money" sub="What you earned, and whether it's on track." />
        {rev_loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 rounded-full border-2 border-od-green border-t-transparent animate-spin" />
          </div>
        ) : (
          <>
            <div className="flex gap-1 mb-4 bg-warm-100 border border-warm-200 rounded-xl p-1">
              {REV_PERIODS.map(p => (
                <button key={p.key} onClick={() => rev_setPeriod(p.key)}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    rev_period === p.key ? 'bg-od-green text-white' : 'text-charcoal-500 hover:text-charcoal-900'
                  }`}>
                  {p.label}
                </button>
              ))}
            </div>

            <div className="bg-warm-100 border border-warm-200 rounded-2xl p-6 mb-4">
              <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500 mb-1">Total Revenue</div>
              <div className="font-serif text-5xl text-charcoal-900 leading-none mb-1">
                {money(rev_totalRevenue)}
              </div>
              {rev_historyRevenue > 0 && (
                <div className="text-xs text-charcoal-500 mb-4">
                  Includes {money(rev_historyRevenue)} from your Square history before ChairOS
                </div>
              )}
              <div className="mb-5" />
              <BarChart days={rev_days} revenueByDay={rev_revenueByDay} />
            </div>

            <GoalBar weekRevenue={weekRevenue} />

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {[
                { label: 'Completed', value: rev_appointments.length.toString(), color: 'text-charcoal-900' },
                { label: 'Tips', value: money(rev_totalTips), color: 'text-green-400' },
                { label: 'Avg / Cut', value: money(rev_avgPerApt), color: 'text-od-green' },
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

            <RevenueIntelligence
              shopId={shop?.id || ''}
              period={rev_period}
              appointments={rev_appointments as any[]}
              tips={rev_tips}
            />

            {myEarnings.length > 0 && (
              <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden mb-4">
                <div className="px-5 py-4 border-b border-warm-200">
                  <div className="font-serif text-charcoal-900">
                    {role === 'barber' ? 'My Earnings' : `${staffLabel} Earnings`}
                  </div>
                  <div className="text-xs text-charcoal-500 mt-0.5">Your cut for this period</div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-warm-200 bg-warm-50">
                        <th className="text-left px-5 py-2 text-xs font-semibold tracking-widest uppercase text-charcoal-400">{role === 'barber' ? 'Me' : staffLabel}</th>
                        <th className="text-right px-4 py-2 text-xs font-semibold tracking-widest uppercase text-charcoal-400">Cuts</th>
                        <th className="text-right px-4 py-2 text-xs font-semibold tracking-widest uppercase text-charcoal-400">Tips</th>
                        <th className="text-right px-5 py-2 text-xs font-semibold tracking-widest uppercase text-charcoal-400">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-warm-200">
                      {myEarnings.map((b, i) => (
                        <tr key={i}>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: (b.color && b.color !== '#b8861f') ? b.color : '#4B5320' }} />
                              <span className="text-charcoal-900 font-medium">{b.name}</span>
                              <span className="text-xs text-charcoal-500">({b.apptCount})</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-charcoal-900">{money(b.cuts)}</td>
                          <td className="px-4 py-3 text-right font-mono text-green-400">{money(b.tips)}</td>
                          <td className="px-5 py-3 text-right font-mono font-semibold text-od-green">{money(b.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
            </StepPanel>
          </TabsContent>

          <TabsContent value="clients">
            <StepPanel>
        {/* CLIENTS — who needs me? */}
        <SectionHead id="clients" title="Clients" sub="Who's coming back, who's fading, who needs a nudge." />
        {ana_loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 rounded-full border-2 border-od-green border-t-transparent animate-spin" />
          </div>
        ) : (
          <>
            <ClientHealthDashboard
              shopId={shop?.id || ''}
              period={rev_period}
              appointments={rev_appointments as any[]}
              shopOwnerId={isShopOwner ? userId : shopOwnerId}
              isBarber={role === 'barber'}
              barberId={barberId}
            />

            {atRiskList.length > 0 && (
              <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden mb-4">
                <div className="px-5 py-4 border-b border-warm-200">
                  <div className="font-serif text-charcoal-900">Needs you most</div>
                  <div className="text-xs text-charcoal-500 mt-0.5">Gone quiet the longest — one tap to win them back</div>
                </div>
                <div className="divide-y divide-warm-200">
                  {atRiskList.map(c => (
                    <div key={c.id} className="px-5 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <button
                          onClick={() => c.clientId && router.push(`/dashboard/clients/${c.clientId}`)}
                          className="text-sm font-semibold text-charcoal-900 hover:text-od-green transition-colors text-left truncate"
                        >
                          {c.name}
                        </button>
                        <div className="text-xs text-charcoal-500 mt-0.5">
                          {c.daysSince === 0 ? 'Last visit today' : `${c.daysSince}d since last visit`}
                        </div>
                      </div>
                      <button
                        onClick={() => c.clientId && router.push(buildCampaignHref({
                          intent: `Win back ${c.name} — ${c.daysSince}d since last visit`,
                          title: `Win back ${c.name}`,
                          clientIds: [c.clientId],
                        }))}
                        className="btn-chairos-outline flex-shrink-0 py-1.5! px-3! text-xs"
                      >
                        Win back
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
            </StepPanel>
          </TabsContent>

          <TabsContent value="actions">
            <StepPanel>
        {/* ACTIONS — what should I do next? */}
        <SectionHead id="actions" title="Actions" sub="What your numbers say to do next — not just what happened." />
        {role === 'owner' && (
          <PrescriptiveOpportunities
            shopId={shop?.id || ''}
            shopHours={shop?.hours || null}
            barbers={shopBarbers}
          />
        )}
        <OpportunitiesSection
          shopId={shop?.id || ''}
          appointments={rev_appointments as any[]}
          barbers={shopBarbers}
          isBarber={role === 'barber'}
        />
            </StepPanel>
          </TabsContent>

          <TabsContent value="services">
            <StepPanel>
        {/* SERVICES — what's making money? */}
        <SectionHead id="services" title="Services" sub="What's driving revenue — and what isn't pulling its weight." />
        {ana_loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 rounded-full border-2 border-od-green border-t-transparent animate-spin" />
          </div>
        ) : ana_serviceBreakdown.length > 0 ? (
          <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden mb-4">
            <div className="px-5 py-4 border-b border-warm-200 flex items-center justify-between">
              <div>
                <div className="font-serif text-charcoal-900">Service Revenue</div>
                <div className="text-xs text-charcoal-500 mt-0.5">For the selected period</div>
              </div>
              <div className="text-right">
                <div className="font-mono text-sm font-semibold text-charcoal-900">
                  {money(ana_serviceBreakdown.reduce((s, i) => s + i.value, 0))}
                </div>
                <div className="text-xs text-charcoal-500">total</div>
              </div>
            </div>
            <div className="divide-y divide-warm-200">
              {(() => {
                const totalSvcRev = ana_serviceBreakdown.reduce((s, i) => s + i.value, 0)
                const maxSvcRev = Math.max(...ana_serviceBreakdown.map(i => i.value), 1)
                return ana_serviceBreakdown.map((item, i) => {
                  const avg = item.count > 0 ? item.value / item.count : 0
                  const share = item.value / maxSvcRev
                  const insight = ana_serviceInsights.find(s => s.name === item.label)
                  const isStar = ana_stars.some(s => s.name === item.label)
                  const isDrag = ana_drag.some(s => s.name === item.label)
                  return (
                    <div key={i} className="px-5 py-3.5">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-charcoal-900">{item.label}</span>
                          {isStar && (
                            <span className="text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full bg-od-green/10 text-od-green border border-od-green/20">
                              Star
                            </span>
                          )}
                          {isDrag && (
                            <span className="text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 border border-red-500/20">
                              Drag
                            </span>
                          )}
                        </div>
                        <span className="font-mono text-sm font-semibold text-charcoal-900">{money(item.value)}</span>
                      </div>
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-xs text-charcoal-500">{item.count} bookings</span>
                        <span className="text-xs text-charcoal-400">·</span>
                        <span className="text-xs text-charcoal-500">{money(avg)}/avg</span>
                        <span className="text-xs text-charcoal-400">·</span>
                        <span className="text-xs text-charcoal-400">{Math.round((item.value / totalSvcRev) * 100)}% of revenue</span>
                      </div>
                      <div className="h-1.5 bg-warm-200 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-od-green" style={{ width: `${Math.max(2, share * 100)}%` }} />
                      </div>
                      {isDrag && (
                        <div className="text-xs text-charcoal-500 mt-1.5">Rarely booked at a low ticket — consider raising the price or dropping it.</div>
                      )}
                      {isStar && insight && insight.revenueShare >= 0.1 && (
                        <div className="text-xs text-charcoal-500 mt-1.5">Your money-maker — protect its slots.</div>
                      )}
                    </div>
                  )
                })
              })()}
            </div>
          </div>
        ) : (
          <div className="bg-warm-100 border border-warm-200 rounded-xl p-6 text-center text-charcoal-500 text-sm mb-4">
            No service data for this period yet.
          </div>
        )}
            </StepPanel>
          </TabsContent>

          <TabsContent value="reviews">
            <StepPanel>
        {/* REVIEWS — what are clients saying? */}
        <SectionHead id="reviews" title="Reviews" sub="Your reputation, at a glance." />
        <div className="mb-4">
          {ana_loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 rounded-full border-2 border-od-green border-t-transparent animate-spin" />
            </div>
          ) : ana_reviews.length === 0 ? (
            <div className="bg-warm-100 border border-warm-200 rounded-xl p-6 text-center text-charcoal-500 text-sm">
              No reviews yet. Import from Google on the <a href="/dashboard/reviews" className="text-od-green font-semibold">Reviews page</a>.
            </div>
          ) : (
            <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-warm-200 flex items-center gap-4">
                <span className="text-amber-500 text-2xl">★</span>
                <div>
                  <div className="font-serif text-2xl text-charcoal-900">
                    {(ana_reviews.reduce((s, r) => s + r.rating, 0) / ana_reviews.length).toFixed(1)}
                  </div>
                  <div className="text-xs text-charcoal-500">{ana_reviews.length} total reviews</div>
                </div>
                <button onClick={() => router.push('/dashboard/reviews')} className="btn-chairos-outline ml-auto py-1.5! px-3! text-xs">
                  All reviews
                </button>
              </div>
              {Object.entries(ana_barberReviewStats).length > 0 && (
                <div className="divide-y divide-warm-200">
                  {Object.entries(ana_barberReviewStats)
                    .sort(([, a], [, b]) => b.avg - a.avg)
                    .map(([bId, stat]) => {
                      const barber = shopBarbers.find(b => b.barber_id === bId)
                      const name = barber?.barber_name || barber?.alias || staffLabel
                      return (
                        <div key={bId} className="px-5 py-3 flex items-center justify-between">
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
            </div>
          )}
        </div>
            </StepPanel>
          </TabsContent>

          <TabsContent value="referrals">
            <StepPanel>
        {/* REFERRALS — who's bringing in business? */}
        <SectionHead id="referrals" title="Referrals" sub="Clients bringing you new clients." />
        <div className="mb-4">
          {!shop?.referral_program_enabled && (
            <div className="bg-warm-100 border border-warm-200 rounded-xl p-4 mb-4 text-sm text-charcoal-500">
              The referral program is off. Turn it on in Shop Settings to start tracking referrals.
            </div>
          )}
          {referralsLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 rounded-full border-2 border-od-green border-t-transparent animate-spin" />
            </div>
          ) : referralRewards.length === 0 ? (
            <div className="bg-warm-100 border border-warm-200 rounded-xl p-8 text-center text-charcoal-500 text-sm">
              No referral activity yet.
            </div>
          ) : (
            <div className="space-y-2">
              {referralRewards.map((r: any) => {
                const referring = Array.isArray(r.referring) ? r.referring[0] : r.referring
                const referred = Array.isArray(r.referred) ? r.referred[0] : r.referred
                const statusStyle: Record<string, string> = {
                  pending: 'bg-warm-200 text-charcoal-500',
                  earned: 'bg-amber-950/40 text-amber-400',
                  redeemed: 'bg-od-green/10 text-od-green',
                }
                const rewardLabel = r.reward_type === 'percent_off' ? `${r.reward_value}% off` : `$${r.reward_value} off`
                return (
                  <div key={r.id} className="bg-warm-100 border border-warm-200 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-charcoal-900">
                        <span className="font-semibold">{referring?.full_name || 'Unknown'}</span> referred{' '}
                        <span className="font-semibold">{referred?.full_name || 'Unknown'}</span>
                      </span>
                      <span className={`text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full ${statusStyle[r.status] || ''}`}>
                        {r.status}
                      </span>
                    </div>
                    <div className="text-xs text-charcoal-500">
                      Reward: {rewardLabel} · Referred {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {r.earned_at && ` · Earned ${new Date(r.earned_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                      {r.redeemed_at && ` · Redeemed ${new Date(r.redeemed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

            </StepPanel>
          </TabsContent>

          <TabsContent value="shop">
            <StepPanel>
        {/* SHOP — owner-only: how's the whole shop doing? */}
        {isShopOwner && (
          <>
            <SectionHead id="shop" title="Shop" sub="The whole operation — team, hours, and where clients come from." />
            <PeakHoursHeatmap shopId={shop?.id || ''} period={rev_period} />
            <CrmInsightsPanel shopId={shop?.id || ''} />
          </>
        )}
            </StepPanel>
          </TabsContent>
        </Tabs>

      </div>
      <MobileNav />
    </div>
  )
}
