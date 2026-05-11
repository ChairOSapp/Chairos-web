'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import BarberNav from '@/components/BarberNav'

export default function BarberDashboard() {
  const [profile, setProfile] = useState<any>(null)
  const [shopBarber, setShopBarber] = useState<any>(null)
  const [shop, setShop] = useState<any>(null)
  const [appointments, setAppointments] = useState<any[]>([])
  const [tips, setTips] = useState<any[]>([])
  const [clientLocks, setClientLocks] = useState<any[]>([])
  const [boothRent, setBoothRent] = useState<any>(null)
  const [showEarnings, setShowEarnings] = useState(false)
  const [onFloor, setOnFloor] = useState(true)
  const [loading, setLoading] = useState(true)
  const [barberId, setBarberId] = useState<string | null>(null)
  const [shopId, setShopId] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const getToday = () => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
  }

  const loadLiveData = useCallback(async (uid: string, sid: string) => {
    const today = getToday()

    const { data: appointments } = await supabase
      .from('appointments')
      .select('*, services(*)')
      .eq('barber_id', uid)
      .eq('date', today)
      .order('time', { ascending: true })
    setAppointments(appointments || [])

    const { data: tips } = await supabase
      .from('tips')
      .select('*')
      .eq('barber_id', uid)
      .gte('created_at', today)
    setTips(tips || [])

    const { data: locks } = await supabase
      .from('client_locks')
      .select('*, clients(*)')
      .eq('barber_id', uid)
    setClientLocks(locks || [])
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

      const { data: shopBarber } = await supabase
        .from('shop_barbers')
        .select('*, shops(*)')
        .eq('barber_id', user.id)
        .eq('active', true)
        .single()

      if (!shopBarber) { router.push('/join'); return }
      setShopBarber(shopBarber)
      setOnFloor(shopBarber.active !== false)
      setShop(shopBarber.shops)
      setBarberId(user.id)
      setShopId(shopBarber.shop_id)

      await loadLiveData(user.id, shopBarber.shop_id)

      if (shopBarber.compensation_type === 'booth_rent') {
        const { data: rent } = await supabase
          .from('booth_rent_payments')
          .select('*')
          .eq('barber_id', user.id)
          .eq('paid', false)
          .order('due_date', { ascending: true })
          .limit(1)
        setBoothRent(rent?.[0] || null)
      }

      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    if (!barberId || !shopId) return
    const channel = supabase
      .channel(`barber-${barberId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'appointments',
        filter: `barber_id=eq.${barberId}`
      }, () => loadLiveData(barberId, shopId))
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'tips',
        filter: `barber_id=eq.${barberId}`
      }, () => loadLiveData(barberId, shopId))
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'client_locks',
        filter: `barber_id=eq.${barberId}`
      }, () => loadLiveData(barberId, shopId))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [barberId, shopId])

  async function toggleFloor() {
    const newStatus = !onFloor
    setOnFloor(newStatus)
    await supabase.from('shop_barbers')
      .update({ active: newStatus })
      .eq('id', shopBarber.id)
  }

  if (loading) return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
      <div className="text-amber-500 text-sm">Loading...</div>
    </div>
  )

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = profile?.full_name?.split(' ')[0] || shopBarber?.barber_name || 'Barber'
  const color = shopBarber?.color || '#b8861f'
  const initial = firstName[0].toUpperCase()

  const todayRevenue = appointments
    .filter(a => a.status === 'done')
    .reduce((sum, a) => sum + (parseFloat(a.price) || 0), 0)
  const barberCut = shopBarber?.compensation_type === 'commission'
    ? todayRevenue * (shopBarber?.commission_rate || 0.7)
    : todayRevenue
  const totalTips = tips.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0)
  const pendingTips = tips.filter(t => !t.cashed_out).reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0)
  const cashedTips = tips.filter(t => t.cashed_out).reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0)

  // Client Lock metrics
  const lockedClients = clientLocks.filter(l => l.locked)
  const atRiskClients = lockedClients.filter(l => {
    if (!l.last_booking_date) return false
    const daysSince = Math.floor((Date.now() - new Date(l.last_booking_date).getTime()) / (1000 * 60 * 60 * 24))
    return l.loyalty_protected ? daysSince > 300 : daysSince > 60
  })
  const loyaltyClients = lockedClients.filter(l => l.loyalty_protected)

  return (
    <div className="min-h-screen bg-neutral-950">

      <BarberNav
        shopName={shop?.name || ''}
        barberName={shopBarber?.barber_name || shopBarber?.alias || ''}
        color={shopBarber?.color || '#b8861f'}
        initial={initial}
        photoUrl={shopBarber?.photo_url || undefined}
      />

      <div className="p-6 max-w-2xl mx-auto">

        <div className="mb-6">
          <h1 className="font-serif text-2xl text-white mb-1">{greeting}, {firstName}</h1>
          <p className="text-neutral-500 text-sm">{today}</p>
        </div>

        {/* IDENTITY CARD */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 mb-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0"
            style={{ border: `2px solid ${color}` }}>
            {shopBarber?.photo_url ? (
              <img src={shopBarber.photo_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center font-serif text-xl font-bold"
                style={{ background: color + '22', color }}>
                {initial}
              </div>
            )}
          </div>
          <div className="flex-1">
            <div className="font-serif text-lg text-white">{shopBarber?.barber_name || shopBarber?.alias}</div>
            <div className="text-xs text-neutral-500 uppercase tracking-widest mt-0.5">{shop?.name}</div>
          </div>
          <div className="text-right">
            <button
              onClick={toggleFloor}
              className={`text-xs font-semibold uppercase tracking-widest px-3 py-1.5 rounded-full border transition-colors ${
                onFloor
                  ? 'bg-green-500/10 border-green-500/30 text-green-500 hover:bg-green-500/20'
                  : 'bg-neutral-800 border-neutral-700 text-neutral-500 hover:border-amber-500 hover:text-amber-500'
              }`}>
              {onFloor ? '● On Floor' : '○ Off Floor'}
            </button>
            <div className="text-xs text-neutral-500 mt-1">
              {shopBarber?.compensation_type === 'commission'
                ? `${Math.round((shopBarber?.commission_rate || 0.7) * 100)}% commission`
                : `Booth rent $${shopBarber?.booth_rent_amount}/wk`}
            </div>
          </div>
        </div>

        {/* BOOTH RENT ALERT */}
        {boothRent && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold tracking-widest uppercase text-amber-500 mb-1">Booth Rent Due</div>
                <div className="font-serif text-2xl text-white">${boothRent.total_due}</div>
                <div className="text-xs text-neutral-400 mt-1">
                  Due {new Date(boothRent.due_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                  {boothRent.late_fee_amount > 0 && (
                    <span className="text-red-400 ml-2">+${boothRent.late_fee_amount} late fee</span>
                  )}
                </div>
              </div>
              <button
                onClick={async () => {
                  await supabase.from('booth_rent_payments')
                    .update({ paid: true, paid_at: new Date().toISOString() })
                    .eq('id', boothRent.id)
                  setBoothRent(null)
                }}
                className="bg-amber-500 hover:bg-amber-400 text-black font-semibold px-4 py-2 rounded-lg text-sm transition-colors">
                Mark Paid
              </button>
            </div>
          </div>
        )}

        {/* CLIENT LOCK */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-neutral-800 flex justify-between items-center">
            <div>
              <div className="font-serif text-white flex items-center gap-2">
                My Client Lock
                <span className="text-xs font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded-full">
                  Live
                </span>
              </div>
              <div className="text-xs text-neutral-500 mt-0.5">Your client retention at a glance</div>
            </div>
          </div>
          <div className="grid grid-cols-3 divide-x divide-neutral-800">
            <div className="p-4 text-center">
              <div className="font-serif text-2xl text-green-400 mb-1">{lockedClients.length}</div>
              <div className="text-xs font-semibold tracking-widest uppercase text-neutral-500">Locked</div>
              <div className="text-xs text-neutral-600 mt-0.5">Your clients</div>
            </div>
            <div className="p-4 text-center">
              <div className={`font-serif text-2xl mb-1 ${atRiskClients.length > 0 ? 'text-amber-500' : 'text-neutral-600'}`}>
                {atRiskClients.length}
              </div>
              <div className="text-xs font-semibold tracking-widest uppercase text-neutral-500">At Risk</div>
              <div className="text-xs text-neutral-600 mt-0.5">Need rebooking</div>
            </div>
            <div className="p-4 text-center">
              <div className={`font-serif text-2xl mb-1 ${loyaltyClients.length > 0 ? 'text-amber-500' : 'text-neutral-600'}`}>
                {loyaltyClients.length}
              </div>
              <div className="text-xs font-semibold tracking-widest uppercase text-neutral-500">Loyalty</div>
              <div className="text-xs text-neutral-600 mt-0.5">12+ months</div>
            </div>
          </div>
          {atRiskClients.length > 0 && (
            <div className="border-t border-neutral-800 px-5 py-3 bg-amber-500/5">
              <div className="text-xs font-semibold text-amber-500 mb-2">At Risk — Reach Out</div>
              <div className="space-y-1.5">
                {atRiskClients.slice(0, 3).map((l, i) => (
                  <div key={i} className="flex justify-between items-center">
                    <span className="text-xs text-white">{l.clients?.full_name || l.clients?.phone || 'Client'}</span>
                    <span className="text-xs text-neutral-500">
                      Last visit {new Date(l.last_booking_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                ))}
                {atRiskClients.length > 3 && (
                  <div className="text-xs text-neutral-600">+{atRiskClients.length - 3} more</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* SCHEDULE */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-neutral-800 flex justify-between items-center">
            <div>
              <div className="font-serif text-white">Today's Schedule</div>
              <div className="text-xs text-neutral-500 mt-0.5">{appointments.length} appointments</div>
            </div>
            <span className="text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 px-3 py-1 rounded-full">
              Live
            </span>
          </div>
          {appointments.length === 0 ? (
            <div className="p-6 text-center text-neutral-500 text-sm">
              No appointments today. Your schedule updates in real time.
            </div>
          ) : (
            <div className="divide-y divide-neutral-800">
              {appointments.map((a) => (
                <div key={a.id} className={`px-5 py-4 flex items-center gap-4 ${a.status === 'confirmed' ? 'bg-blue-500/5' : ''}`}>
                  <div className="font-mono text-sm text-amber-500 w-12 flex-shrink-0">{a.time?.slice(0,5)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white truncate">{a.client_name}</div>
                    <div className="text-xs text-neutral-500 truncate">
                      {a.services?.name}{a.client_phone ? ` · ${a.client_phone}` : ''}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      a.status === 'done' ? 'bg-green-500/10 text-green-500' :
                      a.status === 'confirmed' ? 'bg-blue-500/10 text-blue-400' :
                      a.status === 'noshow' ? 'bg-red-500/10 text-red-400' :
                      'bg-neutral-800 text-neutral-500'
                    }`}>{a.status}</span>
                    <div className="text-xs text-neutral-400">${a.price}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* EARNINGS TOGGLE */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden mb-6">
          <button
            onClick={() => setShowEarnings(!showEarnings)}
            className="w-full px-5 py-4 flex items-center justify-between hover:bg-neutral-800 transition-colors">
            <div className="flex items-center gap-3">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={showEarnings ? '#f59e0b' : '#6b7280'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <div className="text-left">
                <div className="text-sm font-semibold text-white">My Earnings</div>
                <div className="text-xs text-neutral-500">Tap to {showEarnings ? 'hide' : 'show'} — private</div>
              </div>
            </div>
            <svg className={`transition-transform ${showEarnings ? 'rotate-180' : ''}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>

          {showEarnings && (
            <div className="border-t border-neutral-800">
              <div className="grid grid-cols-2 divide-x divide-neutral-800">
                <div className="p-5">
                  <div className="text-xs font-semibold tracking-widest uppercase text-neutral-500 mb-2">My Cut Today</div>
                  <div className="font-serif text-2xl text-white mb-1">${barberCut.toFixed(2)}</div>
                  <div className="text-xs text-neutral-500">
                    {shopBarber?.compensation_type === 'commission'
                      ? `${Math.round((shopBarber?.commission_rate || 0.7) * 100)}% of $${todayRevenue.toFixed(2)}`
                      : 'Service revenue'}
                  </div>
                </div>
                <div className="p-5">
                  <div className="text-xs font-semibold tracking-widest uppercase text-neutral-500 mb-2">Tips Today</div>
                  <div className="font-serif text-2xl text-green-400 mb-1">${totalTips.toFixed(2)}</div>
                  <div className="text-xs text-neutral-500">
                    {pendingTips > 0
                      ? <span className="text-amber-500">${pendingTips.toFixed(2)} pending cashout</span>
                      : cashedTips > 0
                        ? <span className="text-green-500">${cashedTips.toFixed(2)} cashed out</span>
                        : 'No tips yet today'}
                  </div>
                </div>
              </div>
              <div className="border-t border-neutral-800 p-5">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="text-xs font-semibold tracking-widest uppercase text-neutral-500 mb-1">Total Today</div>
                    <div className="font-serif text-2xl text-amber-500">${(barberCut + totalTips).toFixed(2)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-neutral-500 mb-1">Appointments</div>
                    <div className="font-serif text-2xl text-white">{appointments.filter(a => a.status === 'done').length}</div>
                    <div className="text-xs text-neutral-500">completed</div>
                  </div>
                </div>
              </div>

              {pendingTips > 0 && (
                <div className="border-t border-neutral-800 px-5 py-4 bg-amber-500/5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-amber-500">Tips Pending Cashout</div>
                      <div className="text-xs text-neutral-500 mt-0.5">Your owner will cash these out</div>
                    </div>
                    <div className="font-serif text-xl text-amber-500">${pendingTips.toFixed(2)}</div>
                  </div>
                </div>
              )}

              {cashedTips > 0 && (
                <div className="border-t border-neutral-800 px-5 py-4 bg-green-500/5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-green-500">Tips Cashed Out</div>
                      <div className="text-xs text-neutral-500 mt-0.5">Paid out today</div>
                    </div>
                    <div className="font-serif text-xl text-green-500">${cashedTips.toFixed(2)}</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}