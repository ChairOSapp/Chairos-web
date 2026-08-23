'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import StaffMobileNav from '@/components/StaffMobileNav'

type Appointment = {
  id: string
  date: string
  time: string
  price: number
  client_name: string
  client_phone: string
  services: { name: string } | null
}

type Tip = {
  id: string
  amount: number
  created_at: string
  appointment_id: string
}

type DrillMode = null | 'appointments' | 'cut' | 'tips'
type TimeFilter = 'day' | 'week' | 'month' | 'year' | 'all'

export default function BarberEarningsPage() {
  const [shopBarber, setShopBarber] = useState<any>(null)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [tips, setTips] = useState<Tip[]>([])
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(new Date().getFullYear())
  const [drillMode, setDrillMode] = useState<DrillMode>(null)
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('month')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { loadData() }, [year])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: sb } = await supabase
      .from('shop_barbers').select('*, shops(*)')
      .eq('barber_id', user.id).eq('active', true).maybeSingle()
    if (!sb) { router.push('/join'); return }
    setShopBarber(sb)

    const { data: appts } = await supabase
      .from('appointments')
      .select('id, date, time, price, client_name, client_phone, services(name)')
      .eq('barber_id', user.id)
      .eq('status', 'done')
      .gte('date', `${year}-01-01`)
      .lte('date', `${year}-12-31`)
      .order('date', { ascending: false })
    setAppointments((appts || []) as any)

    const { data: t } = await supabase
      .from('tips')
      .select('id, amount, created_at, appointment_id')
      .eq('barber_id', user.id)
      .gte('created_at', `${year}-01-01`)
      .lte('created_at', `${year}-12-31T23:59:59`)
    setTips(t || [])

    setLoading(false)
  }

  const commissionRate = shopBarber?.compensation_type === 'commission'
    ? (shopBarber?.commission_rate || 0.7)
    : 1.0

  const getFilteredDates = (filter: TimeFilter) => {
    const now = new Date()
    switch (filter) {
      case 'day':
        return now.toISOString().split('T')[0]
      case 'week': {
        const d = new Date(now)
        d.setDate(d.getDate() - 7)
        return d.toISOString().split('T')[0]
      }
      case 'month': {
        const d = new Date(now)
        d.setMonth(d.getMonth() - 1)
        return d.toISOString().split('T')[0]
      }
      case 'year':
        return `${year}-01-01`
      default:
        return null
    }
  }

  const filteredAppointments = useMemo(() => {
    const since = getFilteredDates(timeFilter)
    if (!since) return appointments
    return appointments.filter(a => a.date >= since)
  }, [appointments, timeFilter, year])

  const filteredTips = useMemo(() => {
    const since = getFilteredDates(timeFilter)
    if (!since) return tips
    return tips.filter(t => t.created_at.split('T')[0] >= since)
  }, [tips, timeFilter, year])

  const totalRevenue = filteredAppointments.reduce((s, a) => s + (parseFloat(String(a.price)) || 0), 0)
  const totalCut = totalRevenue * commissionRate
  const totalTips = filteredTips.reduce((s, t) => s + (parseFloat(String(t.amount)) || 0), 0)
  const totalEarnings = totalCut + totalTips

  const byDay = useMemo(() => {
    const map: Record<string, { cut: number; tips: number; count: number }> = {}
    filteredAppointments.forEach(a => {
      if (!map[a.date]) map[a.date] = { cut: 0, tips: 0, count: 0 }
      map[a.date].cut += (parseFloat(String(a.price)) || 0) * commissionRate
      map[a.date].count++
    })
    filteredTips.forEach(t => {
      const day = t.created_at.split('T')[0]
      if (!map[day]) map[day] = { cut: 0, tips: 0, count: 0 }
      map[day].tips += parseFloat(String(t.amount)) || 0
    })
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0])).map(([date, v]) => ({ date, ...v, total: v.cut + v.tips }))
  }, [filteredAppointments, filteredTips, commissionRate])

  const byService = useMemo(() => {
    const map: Record<string, { count: number; cut: number }> = {}
    filteredAppointments.forEach(a => {
      const name = a.services?.name || 'Unknown'
      if (!map[name]) map[name] = { count: 0, cut: 0 }
      map[name].count++
      map[name].cut += (parseFloat(String(a.price)) || 0) * commissionRate
    })
    return Object.entries(map).sort((a, b) => b[1].cut - a[1].cut).map(([name, v]) => ({ name, ...v }))
  }, [filteredAppointments, commissionRate])

  const color = shopBarber?.color || '#b8861f'

  const TIME_FILTERS: { key: TimeFilter; label: string }[] = [
    { key: 'day', label: 'Today' },
    { key: 'week', label: '7 Days' },
    { key: 'month', label: '30 Days' },
    { key: 'year', label: 'Year' },
    { key: 'all', label: 'All' },
  ]

  if (loading) return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-od-green border-t-transparent animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-warm-50">
      <header className="bg-warm-100 border-b border-warm-200 px-6 h-14 flex items-center justify-between sticky top-0 z-50">
        <span className="font-serif text-od-green text-lg">ChairOS</span>
        {drillMode ? (
          <button onClick={() => setDrillMode(null)} className="btn-chairos-outline">Back</button>
        ) : (
          <button onClick={() => router.push('/dashboard/chair')} className="btn-chairos-outline">Dashboard</button>
        )}
      </header>

      <div className="p-6 max-w-2xl mx-auto pb-24">

        {/* YEAR + TIME FILTER */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <button onClick={() => setYear(y => y - 1)}
              className="w-8 h-8 bg-warm-200 border border-warm-300 rounded-lg text-charcoal-400 hover:text-charcoal-900 text-sm transition-colors">←</button>
            <span className="font-mono text-charcoal-900 font-semibold w-12 text-center">{year}</span>
            <button onClick={() => setYear(y => y + 1)}
              disabled={year >= new Date().getFullYear()}
              className="w-8 h-8 bg-warm-200 border border-warm-300 rounded-lg text-charcoal-400 hover:text-charcoal-900 text-sm transition-colors disabled:opacity-30">→</button>
          </div>
          <div className="flex gap-1">
            {TIME_FILTERS.map(f => (
              <button key={f.key} onClick={() => setTimeFilter(f.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${timeFilter === f.key ? 'text-black' : 'bg-warm-200 text-charcoal-500 hover:text-charcoal-900'}`}
                style={timeFilter === f.key ? { background: color } : {}}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {drillMode === null && (
          <>
            {/* TOTAL EARNINGS HERO */}
            <div className="bg-warm-100 border border-warm-200 rounded-2xl p-6 mb-4 text-center">
              <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500 mb-2">Total Earnings</div>
              <div className="font-serif text-5xl mb-1" style={{ color }}>${totalEarnings.toFixed(2)}</div>
              <div className="text-xs text-charcoal-500">{filteredAppointments.length} appointments</div>
            </div>

            {/* EARNINGS BAR CHART */}
            {byDay.length > 0 && (() => {
              const barColor = shopBarber?.color || '#4B5320'
              const chartDays = byDay.slice().reverse()
              const values = chartDays.map(d => d.total)
              const maxVal = Math.max(...values, 1)
              const LEFT = 44; const RIGHT = 4; const TOP = 6; const BOT = 20
              const W = 600; const H = 120
              const cW = W - LEFT - RIGHT; const cH = H - TOP - BOT
              const slotW = cW / chartDays.length
              const barW = Math.max(2, slotW - 2)
              const yTicks = [0, Math.round(maxVal / 2), maxVal]
              const xIndices = chartDays.length <= 7
                ? chartDays.map((_, i) => i)
                : [0, Math.floor(chartDays.length * 0.25), Math.floor(chartDays.length * 0.5), Math.floor(chartDays.length * 0.75), chartDays.length - 1].filter((v, i, a) => a.indexOf(v) === i)
              return (
                <div className="bg-warm-100 border border-warm-200 rounded-xl p-4 mb-4">
                  <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500 mb-3">Daily Earnings</div>
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
                    {chartDays.map((d, i) => {
                      const barH = Math.max(2, (d.total / maxVal) * cH)
                      const x = LEFT + i * slotW + (slotW - barW) / 2
                      const y = TOP + cH - barH
                      return <rect key={d.date} x={x} y={y} width={barW} height={barH} fill={barColor} rx="1" opacity="0.85" />
                    })}
                    {xIndices.map(i => {
                      const label = new Date(chartDays[i].date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                      const x = LEFT + i * slotW + slotW / 2
                      return (
                        <text key={i} x={x} y={H - 3} textAnchor="middle" fontSize="9" fill="#9e9589" fontFamily="sans-serif">
                          {label}
                        </text>
                      )
                    })}
                  </svg>
                </div>
              )
            })()}

            {/* THREE CLICKABLE TILES */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              <button onClick={() => setDrillMode('appointments')}
                className="bg-warm-100 border border-warm-200 rounded-xl p-4 text-center hover:border-od-green/50 transition-colors group">
                <div className="font-serif text-2xl text-charcoal-900 mb-1 group-hover:text-od-green transition-colors">{filteredAppointments.length}</div>
                <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500">Cuts</div>
                <div className="text-xs text-charcoal-600 mt-1">Tap for details</div>
              </button>
              <button onClick={() => setDrillMode('cut')}
                className="bg-warm-100 border border-warm-200 rounded-xl p-4 text-center hover:border-od-green/50 transition-colors group">
                <div className="font-serif text-2xl text-charcoal-900 mb-1 group-hover:text-od-green transition-colors">${totalCut.toFixed(0)}</div>
                <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500">My Cut</div>
                <div className="text-xs text-charcoal-600 mt-1">Tap for details</div>
              </button>
              <button onClick={() => setDrillMode('tips')}
                className="bg-warm-100 border border-warm-200 rounded-xl p-4 text-center hover:border-green-500/50 transition-colors group">
                <div className="font-serif text-2xl text-green-400 mb-1">${totalTips.toFixed(0)}</div>
                <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500">Tips</div>
                <div className="text-xs text-charcoal-600 mt-1">Tap for details</div>
              </button>
            </div>

            {/* BY SERVICE BREAKDOWN */}
            {byService.length > 0 && (
              <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden mb-4">
                <div className="px-5 py-4 border-b border-warm-200">
                  <div className="font-serif text-charcoal-900">By Service</div>
                </div>
                <div className="divide-y divide-warm-200">
                  {byService.map((s, i) => (
                    <div key={i} className="px-5 py-3 flex items-center justify-between">
                      <div>
                        <div className="text-sm text-charcoal-900 font-medium">{s.name}</div>
                        <div className="text-xs text-charcoal-500">{s.count} cuts</div>
                      </div>
                      <div className="font-mono text-sm font-semibold" style={{ color }}>${s.cut.toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* BY DAY */}
            {byDay.length > 0 && (
              <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-warm-200">
                  <div className="font-serif text-charcoal-900">By Day</div>
                </div>
                <div className="divide-y divide-warm-200">
                  {byDay.slice(0, 10).map((d, i) => (
                    <div key={i} className="px-5 py-3 flex items-center justify-between">
                      <div>
                        <div className="text-sm text-charcoal-900">
                          {new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </div>
                        <div className="text-xs text-charcoal-500">{d.count} cuts · ${d.tips.toFixed(2)} tips</div>
                      </div>
                      <div className="font-mono text-sm font-semibold" style={{ color }}>${d.total.toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {filteredAppointments.length === 0 && (
              <div className="bg-warm-100 border border-warm-200 rounded-xl p-8 text-center text-charcoal-500 text-sm">
                No completed appointments for this period.
              </div>
            )}
          </>
        )}

        {/* DRILL — APPOINTMENTS */}
        {drillMode === 'appointments' && (
          <div>
            <div className="mb-4">
              <div className="font-serif text-2xl text-charcoal-900 mb-1">{filteredAppointments.length} Cuts</div>
              <div className="text-charcoal-500 text-sm">${totalCut.toFixed(2)} earned</div>
            </div>
            <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden">
              {filteredAppointments.length === 0 ? (
                <div className="p-8 text-center text-charcoal-500 text-sm">No appointments for this period.</div>
              ) : (
                <div className="divide-y divide-warm-200">
                  {filteredAppointments.map(a => (
                    <div key={a.id} className="px-5 py-4">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-od-green">{a.time?.slice(0,5)}</span>
                          <span className="text-xs text-charcoal-500">
                            {new Date(a.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                        <span className="font-mono text-sm font-semibold" style={{ color }}>${(parseFloat(String(a.price)) * commissionRate).toFixed(2)}</span>
                      </div>
                      <div className="text-sm font-semibold text-charcoal-900">{a.client_name}</div>
                      <div className="text-xs text-charcoal-500">{a.services?.name} · ${parseFloat(String(a.price)).toFixed(2)} service</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* DRILL — MY CUT */}
        {drillMode === 'cut' && (
          <div>
            <div className="mb-4">
              <div className="font-serif text-2xl text-charcoal-900 mb-1">My Cut</div>
              <div className="text-charcoal-500 text-sm">
                {shopBarber?.compensation_type === 'commission'
                  ? `${Math.round(commissionRate * 100)}% commission on all services`
                  : `Booth rent — you keep 100%`}
              </div>
            </div>
            <div className="bg-warm-100 border border-warm-200 rounded-xl p-5 mb-4">
              {[
                { label: 'Total Service Revenue', value: `$${totalRevenue.toFixed(2)}`, dim: true },
                { label: 'Your Rate', value: shopBarber?.compensation_type === 'commission' ? `${Math.round(commissionRate * 100)}%` : '100%', dim: true },
                { label: 'Your Cut', value: `$${totalCut.toFixed(2)}`, color: true },
              ].map((row, i) => (
                <div key={i} className={`flex justify-between items-center py-3 ${i < 2 ? 'border-b border-warm-200' : ''}`}>
                  <span className="text-sm text-charcoal-400">{row.label}</span>
                  <span className={`font-mono font-semibold ${row.color ? 'text-od-green text-lg' : 'text-charcoal-900 text-sm'}`}>{row.value}</span>
                </div>
              ))}
            </div>
            <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-warm-200 text-xs font-semibold tracking-widest uppercase text-charcoal-500">By Month</div>
              <div className="divide-y divide-warm-200">
                {Array.from({ length: 12 }, (_, i) => {
                  const month = i + 1
                  const monthAppts = appointments.filter(a => new Date(a.date).getMonth() + 1 === month)
                  const rev = monthAppts.reduce((s, a) => s + (parseFloat(String(a.price)) || 0), 0)
                  const cut = rev * commissionRate
                  if (monthAppts.length === 0) return null
                  return (
                    <div key={i} className="px-5 py-3 flex justify-between items-center">
                      <div>
                        <div className="text-sm text-charcoal-900">{new Date(year, i).toLocaleDateString('en-US', { month: 'long' })}</div>
                        <div className="text-xs text-charcoal-500">{monthAppts.length} cuts</div>
                      </div>
                      <div className="font-mono text-sm font-semibold" style={{ color }}>${cut.toFixed(2)}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* DRILL — TIPS */}
        {drillMode === 'tips' && (
          <div>
            <div className="mb-4">
              <div className="font-serif text-2xl text-charcoal-900 mb-1">Tips</div>
              <div className="text-charcoal-500 text-sm">${totalTips.toFixed(2)} total · {filteredTips.length} tips</div>
            </div>
            <div className="bg-warm-100 border border-warm-200 rounded-xl p-5 mb-4 text-center">
              <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500 mb-1">Average Tip</div>
              <div className="font-serif text-3xl text-green-400">
                ${filteredTips.length > 0 ? (totalTips / filteredTips.length).toFixed(2) : '0.00'}
              </div>
            </div>
            <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden">
              {filteredTips.length === 0 ? (
                <div className="p-8 text-center text-charcoal-500 text-sm">No tips for this period.</div>
              ) : (
                <div className="divide-y divide-warm-200">
                  {filteredTips.map(t => {
                    const appt = appointments.find(a => a.id === t.appointment_id)
                    return (
                      <div key={t.id} className="px-5 py-4 flex items-center justify-between">
                        <div>
                          <div className="text-sm font-semibold text-charcoal-900">{appt?.client_name || 'Client'}</div>
                          <div className="text-xs text-charcoal-500">
                            {new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            {appt?.services?.name ? ` · ${appt.services.name}` : ''}
                          </div>
                        </div>
                        <div className="font-mono text-sm font-semibold text-green-400">+${parseFloat(String(t.amount)).toFixed(2)}</div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

      </div>
      <StaffMobileNav />
    </div>
  )
}
