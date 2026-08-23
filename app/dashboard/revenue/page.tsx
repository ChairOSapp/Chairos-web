'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import OwnerNav from '@/components/OwnerNav'
import MobileNav from '@/components/MobileNav'
import { useVerticalLabels } from '@/lib/VerticalContext'

type Period = 'today' | 'week' | 'month' | 'year'

interface Appointment {
  id: string
  date: string
  time: string
  price: number
  client_name: string
  status: string
  barber_id: string
  services: { name: string } | null
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

function getPeriodRange(period: Period): { start: string; end: string } {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
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
    const pad = (n: number) => String(n).padStart(2, '0')
    days.push(`${cur.getFullYear()}-${pad(cur.getMonth() + 1)}-${pad(cur.getDate())}`)
    cur.setDate(cur.getDate() + 1)
  }
  return days
}

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

export default function RevenuePage() {
  const { staffLabel } = useVerticalLabels()
  const [period, setPeriod] = useState<Period>('month')
  const [profile, setProfile] = useState<any>(null)
  const [shop, setShop] = useState<any>(null)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [noshowCount, setNoshowCount] = useState(0)
  const [tips, setTips] = useState<Tip[]>([])
  const [shopBarbers, setShopBarbers] = useState<ShopBarber[]>([])
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

      if (prof?.role === 'barber') { router.push('/dashboard/chair'); return }

      const { data: shopData } = await supabase
        .from('shops').select('*').eq('owner_id', user.id).maybeSingle()
      if (!shopData) { setLoading(false); return }
      setShop(shopData)

      const { data: barbers } = await supabase
        .from('shop_barbers')
        .select('barber_id, barber_name, alias, commission_rate, compensation_type, color')
        .eq('shop_id', shopData.id)
        .eq('active', true)
      setShopBarbers(barbers || [])

      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    if (!shop) return
    fetchPeriodData()
  }, [shop, period])

  async function fetchPeriodData() {
    if (!shop) return
    const { start, end } = getPeriodRange(period)

    const [{ data: appts }, { data: tipsData }, { count: noshow }] = await Promise.all([
      supabase
        .from('appointments')
        .select('id, date, time, price, client_name, status, barber_id, services(name)')
        .eq('shop_id', shop.id)
        .eq('status', 'done')
        .gte('date', start)
        .lte('date', end)
        .order('date', { ascending: false }),
      supabase
        .from('tips')
        .select('id, amount, created_at, barber_id')
        .eq('shop_id', shop.id)
        .gte('created_at', start)
        .lte('created_at', end + 'T23:59:59'),
      supabase
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .eq('shop_id', shop.id)
        .eq('status', 'noshow')
        .gte('date', start)
        .lte('date', end),
    ])

    setAppointments((appts || []) as unknown as Appointment[])
    setTips(tipsData || [])
    setNoshowCount(noshow || 0)
  }

  const { start, end } = useMemo(() => getPeriodRange(period), [period])
  const days = useMemo(() => getDaysBetween(start, end), [start, end])

  const revenueByDay = useMemo(() => {
    const map: Record<string, number> = {}
    appointments.forEach(a => {
      map[a.date] = (map[a.date] || 0) + (parseFloat(String(a.price)) || 0)
    })
    return map
  }, [appointments])

  const totalRevenue = appointments.reduce((s, a) => s + (parseFloat(String(a.price)) || 0), 0)
  const totalTips = tips.reduce((s, t) => s + (parseFloat(String(t.amount)) || 0), 0)
  const avgPerApt = appointments.length > 0 ? totalRevenue / appointments.length : 0

  const barberEarnings = useMemo(() => {
    return shopBarbers.map(b => {
      const bAppts = appointments.filter(a => a.barber_id === b.barber_id)
      const serviceRev = bAppts.reduce((s, a) => s + (parseFloat(String(a.price)) || 0), 0)
      const rate = b.compensation_type === 'commission' ? (b.commission_rate || 0.7) : 1.0
      const cut = serviceRev * rate
      const bTips = tips
        .filter(t => t.barber_id === b.barber_id)
        .reduce((s, t) => s + (parseFloat(String(t.amount)) || 0), 0)
      return {
        name: b.barber_name || b.alias || staffLabel,
        color: b.color || '#4B5320',
        cuts: cut,
        tips: bTips,
        total: cut + bTips,
        apptCount: bAppts.length,
      }
    }).sort((a, b) => b.total - a.total)
  }, [appointments, tips, shopBarbers])

  const showLabels = period === 'today' || period === 'week'
  const ownerName = profile?.full_name || shop?.name || 'Owner'
  const initials = ownerName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()

  const PERIODS: { key: Period; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
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
            <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500 mb-1">Revenue</div>
            <h1 className="font-serif text-2xl text-charcoal-900">{shop?.name || 'Your Shop'}</h1>
          </div>
          <button onClick={() => router.push('/dashboard')} className="btn-chairos-outline">Dashboard</button>
        </div>

        {/* PERIOD TABS */}
        <div className="flex gap-1 mb-6 bg-warm-100 border border-warm-200 rounded-xl p-1">
          {PERIODS.map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
                period === p.key
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
            ${totalRevenue.toFixed(2)}
          </div>
          <BarChart days={days} revenueByDay={revenueByDay} />
        </div>

        {/* STATS ROW */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Completed Apts', value: appointments.length.toString(), color: 'text-charcoal-900' },
            { label: 'Tips Total', value: `$${totalTips.toFixed(2)}`, color: 'text-green-400' },
            { label: 'Avg / Apt', value: `$${avgPerApt.toFixed(2)}`, color: 'text-od-green' },
            {
            label: 'No-show Rate',
            value: (() => {
              const total = appointments.length + noshowCount
              if (total === 0) return '0%'
              return `${Math.round((noshowCount / total) * 100)}%`
            })(),
            color: noshowCount > 0 ? 'text-red-400' : 'text-charcoal-500',
          },
          ].map((s, i) => (
            <div key={i} className="bg-warm-100 border border-warm-200 rounded-xl p-4 text-center">
              <div className={`font-serif text-2xl mb-1 ${s.color}`}>{s.value}</div>
              <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500">{s.label}</div>
            </div>
          ))}
        </div>

        {/* PER-BARBER EARNINGS TABLE */}
        {barberEarnings.length > 0 && (
          <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden mb-6">
            <div className="px-5 py-4 border-b border-warm-200">
              <div className="font-serif text-charcoal-900">{staffLabel} Earnings</div>
              <div className="text-xs text-charcoal-500 mt-0.5">Commission / cut for this period</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-warm-200 bg-warm-50">
                    <th className="text-left px-5 py-2 text-xs font-semibold tracking-widest uppercase text-charcoal-400">{staffLabel}</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold tracking-widest uppercase text-charcoal-400">Cuts</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold tracking-widest uppercase text-charcoal-400">Tips</th>
                    <th className="text-right px-5 py-2 text-xs font-semibold tracking-widest uppercase text-charcoal-400">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-warm-200">
                  {barberEarnings.map((b, i) => (
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
            <div className="text-xs text-charcoal-500 mt-0.5">{appointments.length} completed this period</div>
          </div>
          {appointments.length === 0 ? (
            <div className="p-8 text-center text-charcoal-500 text-sm">No completed appointments for this period.</div>
          ) : (
            <div className="divide-y divide-warm-200 max-h-96 overflow-y-auto">
              {appointments.map(a => {
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

      </div>
      <MobileNav />
    </div>
  )
}
