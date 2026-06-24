'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import MobileNav from '@/components/MobileNav'

export default function AppointmentHistory() {
  const [shop, setShop] = useState<any>(null)
  const [barbers, setBarbers] = useState<any[]>([])
  const [appointments, setAppointments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filterBarber, setFilterBarber] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterMonth, setFilterMonth] = useState('')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: shops } = await supabase
      .from('shops').select('*').eq('owner_id', user.id)
      .order('created_at', { ascending: true }).limit(1)
    const shop = shops?.[0] || null
    if (!shop) { router.push('/onboarding'); return }
    setShop(shop)

    const { data: barbers } = await supabase
      .from('shop_barbers').select('*').eq('shop_id', shop.id).eq('active', true)
    setBarbers(barbers || [])

    const { data: appts } = await supabase
      .from('appointments')
      .select('*, services(*)')
      .eq('shop_id', shop.id)
      .order('date', { ascending: false })
      .order('time', { ascending: false })
      .limit(200)
    setAppointments(appts || [])
    setLoading(false)
  }

  if (loading) return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center">
      <div className="text-od-green text-sm">Loading...</div>
    </div>
  )

  const filtered = appointments.filter(a => {
    if (filterBarber && a.barber_id !== filterBarber) return false
    if (filterStatus && a.status !== filterStatus) return false
    if (filterMonth && !a.date.startsWith(filterMonth)) return false
    return true
  })

  const totalRevenue = filtered.filter(a => a.status === 'done').reduce((sum, a) => sum + (parseFloat(a.price) || 0), 0)

  const paymentBadge = (status?: string) => {
    if (status === 'paid') return <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-green-500/10 text-green-500 border border-green-500/20">PAID</span>
    if (status === 'failed') return <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20">FAILED</span>
    return <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-neutral-800 text-neutral-500 border border-neutral-700">UNPAID</span>
  }

  const statusColor = (s: string) => {
    if (s === 'done') return 'bg-green-500/10 text-green-500'
    if (s === 'confirmed') return 'bg-blue-500/10 text-blue-400'
    if (s === 'noshow') return 'bg-red-500/10 text-red-400'
    if (s === 'cancelled') return 'bg-warm-200 text-charcoal-500'
    return 'bg-warm-200 text-charcoal-500'
  }

  const getBarberName = (barberId: string) => {
    const b = barbers.find(b => b.barber_id === barberId)
    return b?.barber_name || b?.alias || 'Unassigned'
  }

  const months = [...new Set(appointments.map(a => a.date?.slice(0, 7)))].slice(0, 12)

  return (
    <div className="min-h-screen bg-warm-50">
      <header className="bg-warm-100 border-b border-warm-200 px-6 h-14 flex items-center justify-between sticky top-0 z-50">
        <span className="font-serif text-od-green text-lg">ChairOS</span>
        <button onClick={() => router.push('/dashboard')} className="btn-chairos-outline">Dashboard</button>
      </header>

      <div className="p-6 max-w-4xl mx-auto pb-20 md:pb-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-serif text-2xl text-charcoal-900 mb-1">Appointment History</h1>
            <p className="text-charcoal-500 text-sm">{filtered.length} appointments · ${totalRevenue.toFixed(2)} revenue</p>
          </div>
        </div>

        {/* FILTERS */}
        <div className="flex gap-3 flex-wrap mb-6">
          <select value={filterBarber} onChange={e => setFilterBarber(e.target.value)}
            className="bg-warm-100 border border-warm-200 rounded-lg px-3 py-2 text-sm text-charcoal-900 outline-none focus:border-od-green">
            <option value="">All Barbers</option>
            {barbers.map(b => <option key={b.id} value={b.barber_id}>{b.barber_name || b.alias}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="bg-warm-100 border border-warm-200 rounded-lg px-3 py-2 text-sm text-charcoal-900 outline-none focus:border-od-green">
            <option value="">All Statuses</option>
            <option value="done">Done</option>
            <option value="confirmed">Confirmed</option>
            <option value="pending">Pending</option>
            <option value="noshow">No Show</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
            className="bg-warm-100 border border-warm-200 rounded-lg px-3 py-2 text-sm text-charcoal-900 outline-none focus:border-od-green">
            <option value="">All Months</option>
            {months.map(m => (
              <option key={m} value={m}>
                {new Date(m + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </option>
            ))}
          </select>
          {(filterBarber || filterStatus || filterMonth) && (
            <button onClick={() => { setFilterBarber(''); setFilterStatus(''); setFilterMonth('') }}
              className="px-3 py-2 bg-warm-200 border border-warm-300 rounded-lg text-xs text-charcoal-400 hover:text-charcoal-900 transition-colors">
              Clear filters
            </button>
          )}
        </div>

        <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-charcoal-500 text-sm">No appointments found.</div>
          ) : (
            <div className="divide-y divide-warm-200">
              {filtered.map(a => (
                <div key={a.id} className="px-5 py-4">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs text-charcoal-500">
                        {new Date(a.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                      <span className="font-mono text-xs text-od-green">{a.time?.slice(0,5)}</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusColor(a.status)}`}>
                        {a.status}
                      </span>
                      {paymentBadge(a.payment_status)}
                    </div>
                    <span className="font-mono text-sm text-charcoal-900 font-semibold">${a.price}</span>
                  </div>
                  <div className="text-sm font-semibold text-charcoal-900">{a.client_name}</div>
                  <div className="text-xs text-charcoal-500 mt-0.5">
                    {a.services?.name} · {getBarberName(a.barber_id)} · {a.client_phone}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <MobileNav />
    </div>
  )
}
