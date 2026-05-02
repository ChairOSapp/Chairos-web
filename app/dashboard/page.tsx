'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function Dashboard() {
  const [profile, setProfile] = useState<any>(null)
  const [shop, setShop] = useState<any>(null)
  const [barbers, setBarbers] = useState<any[]>([])
  const [services, setServices] = useState<any[]>([])
  const [appointments, setAppointments] = useState<any[]>([])
  const [upcomingAppointments, setUpcomingAppointments] = useState<any[]>([])
  const [tips, setTips] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [shopId, setShopId] = useState<string | null>(null)
  const [tipInput, setTipInput] = useState<{[key: string]: string}>({})
  const [apptTab, setApptTab] = useState<'today'|'upcoming'>('today')
  const router = useRouter()
  const supabase = createClient()

  const getToday = () => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
  }

  const loadAppointmentsAndTips = useCallback(async (sid: string) => {
    const today = getToday()

    const { data: todayAppts } = await supabase
      .from('appointments')
      .select('*, services(*)')
      .eq('shop_id', sid)
      .eq('date', today)
      .order('time', { ascending: true })
    setAppointments(todayAppts || [])

    const { data: upcoming } = await supabase
      .from('appointments')
      .select('*, services(*)')
      .eq('shop_id', sid)
      .gt('date', today)
      .order('date', { ascending: true })
      .order('time', { ascending: true })
    setUpcomingAppointments(upcoming || [])

    const { data: tips } = await supabase
      .from('tips')
      .select('*')
      .eq('shop_id', sid)
      .gte('created_at', today)
    setTips(tips || [])
  }, [])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      setProfile(profile)

      if (profile?.role === 'barber') { router.push('/dashboard/barber'); return }

      if (profile?.role === 'owner') {
        const { data: shops } = await supabase
          .from('shops')
          .select('*')
          .eq('owner_id', user.id)
          .order('created_at', { ascending: true })
          .limit(1)
        const shop = shops?.[0] || null
        if (!shop) { router.push('/onboarding'); return }
        setShop(shop)
        setShopId(shop.id)

        const { data: barbers } = await supabase
          .from('shop_barbers')
          .select('*')
          .eq('shop_id', shop.id)
          .eq('active', true)
        setBarbers(barbers || [])

        const { data: services } = await supabase
          .from('services')
          .select('*')
          .eq('shop_id', shop.id)
          .eq('active', true)
        setServices(services || [])

        await loadAppointmentsAndTips(shop.id)
      }

      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    if (!shopId) return
    const channel = supabase
      .channel(`dashboard-${shopId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `shop_id=eq.${shopId}` },
        () => loadAppointmentsAndTips(shopId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tips', filter: `shop_id=eq.${shopId}` },
        () => loadAppointmentsAndTips(shopId))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [shopId])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  async function updateAppointmentStatus(id: string, status: string) {
    await supabase.from('appointments').update({ status }).eq('id', id)
  }

  async function updateAppointmentBarber(id: string, barberId: string) {
    await supabase.from('appointments').update({ barber_id: barberId || null }).eq('id', id)
  }

  async function addTip(appointmentId: string, barberId: string | null) {
    const amount = parseFloat(tipInput[appointmentId] || '0')
    if (!amount || amount <= 0 || !barberId || !shop) return
    const barber = barbers.find(b => b.barber_id === barberId)
    const tipSplitRate = barber?.tip_split_rate || 1.0
    await supabase.from('tips').insert({
      appointment_id: appointmentId,
      barber_id: barberId,
      shop_id: shop.id,
      amount: amount * tipSplitRate,
      cashed_out: false
    })
    setTipInput(prev => ({ ...prev, [appointmentId]: '' }))
  }

  async function cashOutTips(barberId: string) {
    if (!shop) return
    await supabase.from('tips')
      .update({ cashed_out: true, cashed_out_at: new Date().toISOString() })
      .eq('barber_id', barberId)
      .eq('shop_id', shop.id)
      .eq('cashed_out', false)
  }

  if (loading) return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
      <div className="text-amber-500 text-sm">Loading...</div>
    </div>
  )

  const COLORS = ['#b8861f','#4a7fb5','#3aab6e','#e07850','#9b6db5','#c06060']
  const initials = shop?.name?.split(' ').map((w: string) => w[0]).join('').substring(0,2).toUpperCase() || 'CH'
  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const todayRevenue = appointments.filter(a => a.status === 'done').reduce((sum, a) => sum + (parseFloat(a.price) || 0), 0)
  const totalTips = tips.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0)
  const pendingCount = appointments.filter(a => a.status === 'pending').length
  const doneCount = appointments.filter(a => a.status === 'done').length
  const noShowCount = appointments.filter(a => a.status === 'noshow').length
  const noShowRate = appointments.length > 0 ? Math.round((noShowCount / appointments.length) * 100) : null

  const tipsByBarber = barbers.map(b => ({
    ...b,
    tips: tips.filter(t => t.barber_id === b.barber_id),
    pendingTips: tips.filter(t => t.barber_id === b.barber_id && !t.cashed_out)
      .reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0)
  }))

  const statusColor = (s: string) => {
    if (s === 'done') return 'text-green-500'
    if (s === 'confirmed') return 'text-blue-400'
    if (s === 'noshow') return 'text-red-400'
    return 'text-neutral-500'
  }

  const getBarberName = (barberId: string | null) => {
    if (!barberId) return 'Unassigned'
    const b = barbers.find(b => b.barber_id === barberId)
    return b?.barber_name || b?.alias || 'Unknown'
  }

  const displayAppts = apptTab === 'today' ? appointments : upcomingAppointments

  const ApptTable = ({ appts }: { appts: any[] }) => (
    appts.length === 0 ? (
      <div className="p-6 text-center text-neutral-500 text-sm">
        {apptTab === 'today'
          ? <>No appointments today. Share <span className="text-amber-500 font-mono">chairos.cc/book/{shop?.shop_code}</span> to start taking bookings.</>
          : 'No upcoming appointments scheduled.'}
      </div>
    ) : (
      <div className="divide-y divide-neutral-800">
        <div className="grid grid-cols-12 gap-1 px-5 py-2 bg-neutral-800/50">
          <div className="col-span-1 text-xs font-semibold tracking-widest uppercase text-neutral-500">Time</div>
          <div className="col-span-2 text-xs font-semibold tracking-widest uppercase text-neutral-500">Client</div>
          <div className="col-span-2 text-xs font-semibold tracking-widest uppercase text-neutral-500">Service</div>
          <div className="col-span-2 text-xs font-semibold tracking-widest uppercase text-neutral-500">Barber</div>
          <div className="col-span-2 text-xs font-semibold tracking-widest uppercase text-neutral-500">Status</div>
          <div className="col-span-2 text-xs font-semibold tracking-widest uppercase text-neutral-500">Tip</div>
          {apptTab === 'upcoming' && <div className="col-span-1 text-xs font-semibold tracking-widest uppercase text-neutral-500">Date</div>}
        </div>
        {appts.map((a) => (
          <div key={a.id} className="px-5 py-3">
            <div className="grid grid-cols-12 gap-1 items-center">
              <div className="col-span-1 font-mono text-xs text-neutral-400">{a.time?.slice(0,5)}</div>
              <div className="col-span-2">
                <div className="text-xs font-medium text-white truncate">{a.client_name}</div>
                <div className="text-xs text-neutral-500 truncate">{a.client_phone}</div>
              </div>
              <div className="col-span-2">
                <div className="text-xs text-white truncate">{a.services?.name}</div>
                <div className="text-xs text-neutral-500">${a.price}</div>
              </div>
              <div className="col-span-2">
                <select
                  value={a.barber_id || ''}
                  onChange={e => updateAppointmentBarber(a.id, e.target.value)}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded px-1.5 py-1 text-xs text-white outline-none focus:border-amber-500">
                  <option value="">Unassigned</option>
                  {barbers.map(b => (
                    <option key={b.id} value={b.barber_id || ''}>
                      {b.barber_name || b.alias}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <select
                  value={a.status}
                  onChange={e => updateAppointmentStatus(a.id, e.target.value)}
                  className={`w-full bg-neutral-800 border border-neutral-700 rounded px-1.5 py-1 text-xs outline-none focus:border-amber-500 ${statusColor(a.status)}`}>
                  <option value="pending">Pending</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="done">Done</option>
                  <option value="noshow">No Show</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div className="col-span-2">
                {a.status === 'done' ? (
                  <div className="flex items-center gap-1">
                    <span className="text-neutral-500 text-xs">$</span>
                    <input
                      type="number"
                      placeholder="0"
                      value={tipInput[a.id] || ''}
                      onChange={e => setTipInput(prev => ({ ...prev, [a.id]: e.target.value }))}
                      className="w-10 bg-neutral-800 border border-neutral-700 rounded px-1 py-1 text-xs text-white outline-none focus:border-green-500"
                    />
                    <button
                      onClick={() => addTip(a.id, a.barber_id)}
                      className="bg-green-500/20 hover:bg-green-500 text-green-400 hover:text-white border border-green-500/30 rounded px-1.5 py-1 text-xs transition-colors">
                      +
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-neutral-600">—</span>
                )}
              </div>
              {apptTab === 'upcoming' && (
                <div className="col-span-1 text-xs text-neutral-400 font-mono">
                  {new Date(a.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    )
  )

  return (
    <div className="min-h-screen bg-neutral-950">

      <header className="bg-neutral-900 border-b border-neutral-800 px-6 h-14 flex items-center justify-between sticky top-0 z-10">
        <span className="font-serif text-amber-500 text-lg">ChairOS</span>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-sm text-white font-medium">{profile?.full_name}</div>
            <div className="text-xs text-neutral-500">{shop?.name}</div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center font-serif text-amber-500 text-sm">
            {initials}
          </div>
          <button onClick={handleSignOut} className="text-xs text-neutral-500 hover:text-white transition-colors">
            Sign out
          </button>
        </div>
      </header>

      <div className="p-6 max-w-6xl mx-auto">

        <div className="mb-8">
          <h1 className="font-serif text-2xl text-white mb-1">
            {greeting}, {profile?.full_name?.split(' ')[0]}
          </h1>
          <p className="text-neutral-500 text-sm">{dateStr}</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
            <div className="text-xs font-semibold tracking-widest uppercase text-neutral-500 mb-3">Today's Revenue</div>
            <div className="font-serif text-3xl text-white mb-1">${todayRevenue.toFixed(2)}</div>
            <div className="text-xs text-neutral-500">{doneCount} completed</div>
          </div>
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
            <div className="text-xs font-semibold tracking-widest uppercase text-neutral-500 mb-3">Today's Bookings</div>
            <div className="font-serif text-3xl text-white mb-1">{appointments.length}</div>
            <div className="text-xs text-neutral-500">{upcomingAppointments.length} upcoming</div>
          </div>
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
            <div className="text-xs font-semibold tracking-widest uppercase text-neutral-500 mb-3">No-Show Rate</div>
            <div className="font-serif text-3xl text-white mb-1">{noShowRate !== null ? `${noShowRate}%` : '—'}</div>
            <div className="text-xs text-neutral-500">{noShowCount} no-shows</div>
          </div>
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
            <div className="text-xs font-semibold tracking-widest uppercase text-neutral-500 mb-3">Tips Today</div>
            <div className="font-serif text-3xl text-green-400 mb-1">${totalTips.toFixed(2)}</div>
            <div className="text-xs text-neutral-500">Across all barbers</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">

          <div className="lg:col-span-2 bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-neutral-800 flex justify-between items-center">
              <div className="flex gap-1 bg-neutral-800 rounded-lg p-1">
                <button
                  onClick={() => setApptTab('today')}
                  className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${apptTab === 'today' ? 'bg-neutral-700 text-white' : 'text-neutral-500'}`}>
                  Today ({appointments.length})
                </button>
                <button
                  onClick={() => setApptTab('upcoming')}
                  className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${apptTab === 'upcoming' ? 'bg-neutral-700 text-white' : 'text-neutral-500'}`}>
                  Upcoming ({upcomingAppointments.length})
                </button>
              </div>
              <span className="text-xs font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20 px-3 py-1 rounded-full">Live</span>
            </div>
            <ApptTable appts={displayAppts} />
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-neutral-800">
              <div className="font-serif text-white">Shop Info</div>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <div className="text-xs font-semibold tracking-widest uppercase text-neutral-500 mb-1">Booking Link</div>
                <div className="font-mono text-xs text-amber-500 break-all">chairos.cc/book/{shop?.shop_code}</div>
                <button
                  onClick={() => navigator.clipboard.writeText(`https://chairos.cc/book/${shop?.shop_code}`)}
                  className="mt-2 text-xs text-neutral-500 hover:text-amber-500 transition-colors">
                  Copy link
                </button>
              </div>
              <div>
                <div className="text-xs font-semibold tracking-widest uppercase text-neutral-500 mb-1">Shop Code</div>
                <div className="font-mono text-lg font-bold text-amber-500 tracking-widest">{shop?.shop_code}</div>
                <div className="text-xs text-neutral-600 mt-1">Share with barbers to join</div>
              </div>
              <div>
                <div className="text-xs font-semibold tracking-widest uppercase text-neutral-500 mb-1">Location</div>
                <div className="text-sm text-white">{shop?.address || '—'}</div>
                <div className="text-xs text-neutral-500">{shop?.city || '—'}</div>
              </div>
              <div>
                <div className="text-xs font-semibold tracking-widest uppercase text-neutral-500 mb-1">Phone</div>
                <div className="text-sm text-white">{shop?.phone || '—'}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-neutral-800 flex justify-between items-center">
            <div>
              <div className="font-serif text-white">Daily Tips</div>
              <div className="text-xs text-neutral-500 mt-0.5">Cashout tracker — barbers see this in real time</div>
            </div>
            <div className="font-serif text-lg text-green-400">${totalTips.toFixed(2)}</div>
          </div>
          {barbers.length === 0 ? (
            <div className="p-5 text-center text-neutral-500 text-sm">No barbers added yet.</div>
          ) : (
            <div className="divide-y divide-neutral-800">
              {tipsByBarber.map((b, i) => (
                <div key={b.id} className="px-5 py-4 flex items-center gap-4">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center font-serif text-sm font-bold flex-shrink-0"
                    style={{ background: (b.color || COLORS[i % COLORS.length]) + '22', border: `2px solid ${b.color || COLORS[i % COLORS.length]}`, color: b.color || COLORS[i % COLORS.length] }}>
                    {(b.barber_name || b.alias || '?')[0].toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-white">{b.barber_name || b.alias}</div>
                    <div className="text-xs text-neutral-500">{b.tips.length} tip{b.tips.length !== 1 ? 's' : ''} today</div>
                  </div>
                  <div className="text-right mr-4">
                    <div className="font-mono text-lg text-green-400">${b.pendingTips.toFixed(2)}</div>
                    <div className="text-xs text-neutral-500">pending cashout</div>
                  </div>
                  <button
                    onClick={() => b.barber_id && cashOutTips(b.barber_id)}
                    disabled={b.pendingTips === 0}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      b.pendingTips > 0
                        ? 'bg-green-500/20 hover:bg-green-500 text-green-400 hover:text-white border border-green-500/30'
                        : 'bg-neutral-800 text-neutral-600 border border-neutral-700 cursor-not-allowed'
                    }`}>
                    {b.pendingTips > 0 ? 'Cash Out' : 'Paid Out'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-neutral-800 flex justify-between items-center">
              <div className="font-serif text-white">Your Barbers</div>
              <span className="text-xs text-neutral-500">{barbers.length} active</span>
            </div>
            {barbers.length === 0 ? (
              <div className="p-5 text-center text-neutral-500 text-sm">No barbers added yet.</div>
            ) : (
              <div className="divide-y divide-neutral-800">
                {barbers.map((b, i) => (
                  <div key={b.id} className="px-5 py-3 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center font-serif text-sm font-bold flex-shrink-0"
                      style={{ background: (b.color || COLORS[i % COLORS.length]) + '22', border: `2px solid ${b.color || COLORS[i % COLORS.length]}`, color: b.color || COLORS[i % COLORS.length] }}>
                      {(b.barber_name || b.alias || '?')[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white">{b.barber_name || b.alias}</div>
                      <div className="text-xs text-neutral-500">
                        {b.compensation_type === 'commission'
                          ? `${Math.round((b.commission_rate || 0.7) * 100)}% commission`
                          : `Booth rent $${b.booth_rent_amount}/wk`}
                      </div>
                    </div>
                    <div className={`text-xs font-semibold px-2 py-0.5 rounded-full ${b.barber_id ? 'bg-green-500/10 text-green-500' : 'bg-neutral-800 text-neutral-500'}`}>
                      {b.barber_id ? 'Linked' : 'Pending'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-neutral-800 flex justify-between items-center">
              <div className="font-serif text-white">Services</div>
              <span className="text-xs text-neutral-500">{services.length} active</span>
            </div>
            {services.length === 0 ? (
              <div className="p-5 text-center text-neutral-500 text-sm">No services added yet.</div>
            ) : (
              <div className="divide-y divide-neutral-800 max-h-72 overflow-y-auto">
                {services.map((s) => (
                  <div key={s.id} className="px-5 py-3 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-white">{s.name}</div>
                      <div className="text-xs text-neutral-500">{s.duration_minutes} mins</div>
                    </div>
                    <div className="font-mono text-sm text-amber-500 font-semibold">${s.price}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3 flex-wrap">
          {[
            { label: '+ New Appointment', href: '/dashboard/appointments/new' },
            { label: 'Manage Services', href: '/dashboard/services' },
            { label: 'Manage Barbers', href: '/dashboard/barbers' },
            { label: 'Invite Barber', href: '/dashboard/invite' },
          ].map((action, i) => (
            <button key={i} onClick={() => router.push(action.href)}
              className="px-4 py-2.5 bg-neutral-900 border border-neutral-800 rounded-lg text-sm text-neutral-400 hover:border-amber-500 hover:text-amber-500 transition-colors">
              {action.label}
            </button>
          ))}
        </div>

      </div>
    </div>
  )
}