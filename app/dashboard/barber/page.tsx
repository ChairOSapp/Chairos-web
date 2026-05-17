'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import BarberNav from '@/components/BarberNav'
import BarberMobileNav from '@/components/BarberMobileNav'

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
  const [showBooking, setShowBooking] = useState(false)
  const [bookingName, setBookingName] = useState('')
  const [bookingPhone, setBookingPhone] = useState('')
  const [bookingService, setBookingService] = useState('')
  const [bookingTime, setBookingTime] = useState('')
  const [bookingPrice, setBookingPrice] = useState('')
  const [services, setServices] = useState<any[]>([])
  const [bookingSubmitting, setBookingSubmitting] = useState(false)
  const [bookingSuccess, setBookingSuccess] = useState('')
  const [statusUpdating, setStatusUpdating] = useState<{[key: string]: boolean}>({})
  const [barberTipInput, setBarberTipInput] = useState<{[key: string]: string}>({})
  const [addingTip, setAddingTip] = useState<{[key: string]: boolean}>({})
  const [tippedAppointments, setTippedAppointments] = useState<Set<string>>(new Set())
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

    const { data: existingTips } = await supabase
      .from('tips')
      .select('appointment_id')
      .eq('barber_id', uid)
      .gte('created_at', today)
    if (existingTips && existingTips.length > 0) {
      setTippedAppointments(new Set(existingTips.map((t: any) => t.appointment_id)))
    }

    const { data: locks } = await supabase
      .from('client_locks')
      .select('id, locked, barber_id, shop_id, booking_count, first_booking_date, last_booking_date, loyalty_protected, updated_at, client_id, clients(id, full_name, phone, email, total_visits, last_visit_date)')
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
        .maybeSingle()
      setProfile(profile)

      const { data: shopBarber } = await supabase
        .from('shop_barbers')
        .select('*, shops(*)')
        .eq('barber_id', user.id)
        .eq('active', true)
        .maybeSingle()

      if (!shopBarber) { router.push('/join'); return }
      setShopBarber(shopBarber)
      setOnFloor(shopBarber.on_floor !== false)
      setShop(shopBarber.shops)
      setBarberId(user.id)
      setShopId(shopBarber.shop_id)

      const { data: services } = await supabase
        .from('services').select('*')
        .eq('shop_id', shopBarber.shop_id).eq('active', true)
        .order('price', { ascending: true })
      setServices(services || [])

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
      .update({ on_floor: newStatus })
      .eq('id', shopBarber.id)
  }

  async function updateStatus(appointmentId: string, status: string) {
    setStatusUpdating(prev => ({ ...prev, [appointmentId]: true }))
    await supabase.from('appointments').update({ status }).eq('id', appointmentId)
    setAppointments(prev => prev.map(a => a.id === appointmentId ? { ...a, status } : a))
    setStatusUpdating(prev => ({ ...prev, [appointmentId]: false }))
  }

  async function addBarberTip(appointmentId: string) {
    const amount = parseFloat(barberTipInput[appointmentId] || '0')
    if (!amount || amount <= 0 || !barberId || !shopId) return
    setAddingTip(prev => ({ ...prev, [appointmentId]: true }))

    const { data: existing } = await supabase
      .from('tips')
      .select('id')
      .eq('appointment_id', appointmentId)
      .eq('barber_id', barberId)
      .maybeSingle()

    if (existing) {
      await supabase.from('tips').update({ amount }).eq('id', existing.id)
    } else {
      await supabase.from('tips').insert({
        appointment_id: appointmentId,
        barber_id: barberId,
        shop_id: shopId,
        amount,
        cashed_out: false
      })
    }

    setBarberTipInput(prev => ({ ...prev, [appointmentId]: '' }))
    setAddingTip(prev => ({ ...prev, [appointmentId]: false }))
    setTippedAppointments(prev => new Set([...prev, appointmentId]))
    if (barberId && shopId) await loadLiveData(barberId, shopId)
  }

  async function handleWalkIn() {
    if (!bookingName || !bookingPhone || !bookingService || !bookingTime) return
    setBookingSubmitting(true)

    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
    const [t, period] = bookingTime.split(' ')
    const [hours, minutes] = t.split(':')
    let h = parseInt(hours)
    if (period === 'PM' && h !== 12) h += 12
    if (period === 'AM' && h === 12) h = 0
    const time24 = `${h.toString().padStart(2,'0')}:${minutes}:00`
    const svc = services.find(s => s.id === bookingService)

    await supabase.from('appointments').insert({
      shop_id: shopId,
      barber_id: barberId,
      service_id: bookingService,
      client_name: bookingName,
      client_phone: bookingPhone,
      date: today,
      time: time24,
      price: parseFloat(bookingPrice) || svc?.price || 0,
      status: 'confirmed',
    })

    // Notify owner
    const { data: shopData } = await supabase
      .from('shops').select('owner_id').eq('id', shopId).maybeSingle()
    if (shopData?.owner_id) {
      await supabase.from('notifications').insert({
        user_id: shopData.owner_id,
        shop_id: shopId,
        type: 'booking',
        title: 'Walk-in booked',
        body: `${bookingName} · ${svc?.name} · ${bookingTime} · booked by ${shopBarber?.barber_name || shopBarber?.alias}`,
        read: false
      })
    }

    setBookingName(''); setBookingPhone(''); setBookingService(''); setBookingTime(''); setBookingPrice('')
    setShowBooking(false)
    setBookingSuccess('Walk-in booked!')
    setTimeout(() => setBookingSuccess(''), 3000)
    setBookingSubmitting(false)
    if (barberId && shopId) await loadLiveData(barberId, shopId)
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
        userId={barberId || undefined}
      />

      <div className="p-6 max-w-2xl mx-auto pb-20 md:pb-0">

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

        {/* WALK-IN BOOKING */}
        {bookingSuccess && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-xl px-5 py-3 mb-6 text-sm text-green-400 font-semibold">
            {bookingSuccess}
          </div>
        )}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden mb-6">
          <button onClick={() => setShowBooking(!showBooking)}
            className="w-full px-5 py-4 flex items-center justify-between hover:bg-neutral-800 transition-colors">
            <div className="flex items-center gap-3">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 4v16m8-8H4"/>
              </svg>
              <div className="text-sm font-semibold text-white">Book a Walk-In</div>
            </div>
            <svg className={`transition-transform ${showBooking ? 'rotate-180' : ''}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          {showBooking && (
            <div className="border-t border-neutral-800 p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-1">Client Name *</label>
                  <input value={bookingName} onChange={e => setBookingName(e.target.value)} placeholder="Name"
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-amber-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-1">Phone *</label>
                  <input type="tel" value={bookingPhone} onChange={e => setBookingPhone(e.target.value)} placeholder="Phone"
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-amber-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-1">Service *</label>
                <select value={bookingService} onChange={e => { setBookingService(e.target.value); const s = services.find(sv => sv.id === e.target.value); if(s) setBookingPrice(String(s.price)) }}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-amber-500">
                  <option value="">Select service...</option>
                  {services.map(s => <option key={s.id} value={s.id}>{s.name} — ${s.price}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-1">Time *</label>
                  <select value={bookingTime} onChange={e => setBookingTime(e.target.value)}
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-amber-500">
                    <option value="">Select time...</option>
                    {['8:00 AM','8:30 AM','9:00 AM','9:30 AM','10:00 AM','10:30 AM','11:00 AM','11:30 AM','12:00 PM','12:30 PM','1:00 PM','1:30 PM','2:00 PM','2:30 PM','3:00 PM','3:30 PM','4:00 PM','4:30 PM','5:00 PM','5:30 PM','6:00 PM','6:30 PM','7:00 PM'].map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-1">Price</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-neutral-400 text-sm">$</span>
                    <input type="number" value={bookingPrice} onChange={e => setBookingPrice(e.target.value)}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-lg pl-7 pr-3 py-2 text-white text-sm outline-none focus:border-amber-500" />
                  </div>
                </div>
              </div>
              <button onClick={handleWalkIn} disabled={bookingSubmitting || !bookingName || !bookingPhone || !bookingService || !bookingTime}
                className="w-full bg-amber-500 hover:bg-amber-400 text-black font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50">
                {bookingSubmitting ? 'Booking...' : 'Book Walk-In'}
              </button>
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
                <div key={a.id} className={`px-5 py-4 border-b border-neutral-800 last:border-0 ${a.status === 'confirmed' ? 'bg-blue-500/5' : a.status === 'done' ? 'bg-green-500/5' : ''}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm text-amber-500 font-semibold">{a.time?.slice(0,5)}</span>
                      <select
                        value={a.status}
                        disabled={statusUpdating[a.id]}
                        onChange={e => updateStatus(a.id, e.target.value)}
                        className={`bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1 text-xs font-semibold outline-none transition-colors ${
                          a.status === 'done' ? 'text-green-400 border-green-500/30' :
                          a.status === 'confirmed' ? 'text-blue-400 border-blue-500/30' :
                          a.status === 'noshow' ? 'text-red-400' :
                          'text-neutral-400'
                        }`}>
                        <option value="pending">Pending</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="done">Done</option>
                        <option value="noshow">No Show</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </div>
                    <span className="text-xs font-mono text-amber-500 font-semibold">${a.price}</span>
                  </div>
                  <div className="text-sm font-semibold text-white mb-0.5">{a.client_name}</div>
                  <div className="text-xs text-neutral-500 mb-3">{a.services?.name} · {a.client_phone}</div>
                  {a.status === 'done' && !tippedAppointments.has(a.id) && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-neutral-500">Tip $</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={barberTipInput[a.id] || ''}
                        onChange={e => {
                          const val = e.target.value
                          if (parseFloat(val) < 0) return
                          setBarberTipInput(prev => ({ ...prev, [a.id]: val }))
                        }}
                        className="w-20 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-1.5 text-sm text-white outline-none focus:border-green-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <button
                        onClick={() => addBarberTip(a.id)}
                        disabled={addingTip[a.id] || !barberTipInput[a.id]}
                        className="bg-green-500/20 hover:bg-green-500 text-green-400 hover:text-white border border-green-500/30 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50">
                        {addingTip[a.id] ? '...' : '+ Tip'}
                      </button>
                    </div>
                  )}
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
      <BarberMobileNav />
    </div>
  )
}