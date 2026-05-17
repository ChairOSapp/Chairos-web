'use client'
import React, { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import OwnerNav from '@/components/OwnerNav'
import MobileNav from '@/components/MobileNav'

const TipInput = React.memo(({ appointmentId, barberId, shopId, onTipAdded }: {
  appointmentId: string
  barberId: string | null
  shopId: string
  onTipAdded: () => void
}) => {
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  async function handleAddTip() {
    const amount = parseFloat(value)
    if (!amount || amount <= 0 || !barberId) return
    setSaving(true)

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

    setValue('')
    setSaving(false)
    onTipAdded()
  }

  return (
    <div className="flex items-center gap-1">
      <span className="text-neutral-500 text-xs">$</span>
      <input
        type="number"
        inputMode="decimal"
        min="0"
        step="0.01"
        placeholder="0.00"
        value={value}
        onChange={e => {
          const val = e.target.value
          if (val !== '' && parseFloat(val) < 0) return
          setValue(val)
        }}
        autoComplete="off"
        className="w-14 bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-xs text-white outline-none focus:border-green-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        onClick={handleAddTip}
        disabled={saving || !value}
        className="bg-green-500/20 hover:bg-green-500 text-green-400 hover:text-white border border-green-500/30 rounded px-2 py-1.5 text-xs transition-colors disabled:opacity-50">
        {saving ? '...' : '+ Tip'}
      </button>
    </div>
  )
})
TipInput.displayName = 'TipInput'

export default function Dashboard() {
  const [profile, setProfile] = useState<any>(null)
  const [shop, setShop] = useState<any>(null)
  const [barbers, setBarbers] = useState<any[]>([])
  const [services, setServices] = useState<any[]>([])
  const [appointments, setAppointments] = useState<any[]>([])
  const [upcomingAppointments, setUpcomingAppointments] = useState<any[]>([])
  const [tips, setTips] = useState<any[]>([])
  const [clientLocks, setClientLocks] = useState<any[]>([])
  const [yesterdayAppointments, setYesterdayAppointments] = useState<any[]>([])
  const [yesterdayTips, setYesterdayTips] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [shopId, setShopId] = useState<string | null>(null)
  const [apptTab, setApptTab] = useState<'today'|'upcoming'>('today')
  const [toast, setToast] = useState<{msg: string, type: 'success'|'error'} | null>(null)
  const [addingTip, setAddingTip] = useState<string | null>(null)
  const [cashingOut, setCashingOut] = useState<string | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const showToast = (msg: string, type: 'success'|'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const getToday = () => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
  }

  const loadAppointmentsAndTips = useCallback(async (sid: string) => {
    const today = getToday()

    const { data: todayAppts } = await supabase
      .from('appointments').select('*, services(*)')
      .eq('shop_id', sid).eq('date', today)
      .order('time', { ascending: true })
    setAppointments(todayAppts || [])

    const { data: upcoming } = await supabase
      .from('appointments').select('*, services(*)')
      .eq('shop_id', sid).gt('date', today)
      .order('date', { ascending: true })
      .order('time', { ascending: true })
    setUpcomingAppointments(upcoming || [])

    const { data: tips } = await supabase
      .from('tips').select('*')
      .eq('shop_id', sid).gte('created_at', today)
    setTips(tips || [])
  }, [])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: profile } = await supabase
        .from('profiles').select('*').eq('id', user.id).maybeSingle()
      setProfile(profile)

      if (profile?.role === 'barber') { router.push('/dashboard/barber'); return }

      if (profile?.role === 'owner') {
        const { data: shops } = await supabase
          .from('shops').select('*').eq('owner_id', user.id)
          .order('created_at', { ascending: true }).limit(1)
        const shop = shops?.[0] || null
        if (!shop) { router.push('/onboarding'); return }
        setShop(shop)
        setShopId(shop.id)

        const { data: barbers } = await supabase
          .from('shop_barbers').select('*')
          .eq('shop_id', shop.id).eq('active', true)
        setBarbers(barbers || [])

        const { data: services } = await supabase
          .from('services').select('*')
          .eq('shop_id', shop.id).eq('active', true)
        setServices(services || [])

        const { data: locks } = await supabase
          .from('client_locks')
          .select('id, locked, barber_id, shop_id, booking_count, first_booking_date, last_booking_date, loyalty_protected, updated_at, client_id, clients(id, full_name, phone, email, total_visits, last_visit_date)')
          .eq('shop_id', shop.id)
        setClientLocks(locks || [])

        await loadAppointmentsAndTips(shop.id)

        // Yesterday's data
        const yesterday = new Date()
        yesterday.setDate(yesterday.getDate() - 1)
        const yesterdayStr = yesterday.toISOString().split('T')[0]

        const { data: yesterdayAppts } = await supabase
          .from('appointments')
          .select('price, status')
          .eq('shop_id', shop.id)
          .eq('date', yesterdayStr)
        setYesterdayAppointments(yesterdayAppts || [])

        const { data: yesterdayTipsData } = await supabase
          .from('tips')
          .select('amount')
          .eq('shop_id', shop.id)
          .gte('created_at', `${yesterdayStr}T00:00:00`)
          .lte('created_at', `${yesterdayStr}T23:59:59`)
        setYesterdayTips(yesterdayTipsData || [])
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
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'shop_barbers', filter: `shop_id=eq.${shopId}` },
        async () => {
          const { data: updatedBarbers } = await supabase
            .from('shop_barbers').select('*')
            .eq('shop_id', shopId).eq('active', true)
          setBarbers(updatedBarbers || [])
        })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [shopId])

  async function updateAppointmentStatus(id: string, status: string) {
    const { error } = await supabase.from('appointments').update({ status }).eq('id', id)
    if (error) showToast(error.message, 'error')
  }

  async function updateAppointmentBarber(id: string, barberId: string) {
    const { error } = await supabase.from('appointments').update({ barber_id: barberId || null }).eq('id', id)
    if (error) showToast(error.message, 'error')
  }

  async function cashOutTips(barberId: string) {
    if (!shop) return
    setCashingOut(barberId)
    const { error } = await supabase.from('tips')
      .update({ cashed_out: true, cashed_out_at: new Date().toISOString() })
      .eq('barber_id', barberId).eq('shop_id', shop.id).eq('cashed_out', false)
    if (error) showToast(error.message, 'error')
    else showToast('Tips cashed out')
    setCashingOut(null)
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
  const doneCount = appointments.filter(a => a.status === 'done').length
  const noShowCount = appointments.filter(a => a.status === 'noshow').length
  const noShowRate = appointments.length > 0 ? Math.round((noShowCount / appointments.length) * 100) : null

  const tipsByBarber = barbers.map(b => ({
    ...b,
    tips: tips.filter(t => t.barber_id === b.barber_id),
    pendingTips: tips.filter(t => t.barber_id === b.barber_id && !t.cashed_out)
      .reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0)
  }))

  const locksByBarber = barbers.map(b => {
    const barberLocks = clientLocks.filter(l => l.barber_id === b.barber_id)
    const locked = barberLocks.filter(l => l.locked)
    const atRisk = locked.filter(l => {
      if (!l.last_booking_date) return false
      const daysSince = Math.floor((Date.now() - new Date(l.last_booking_date).getTime()) / (1000 * 60 * 60 * 24))
      return l.loyalty_protected ? daysSince > 300 : daysSince > 60
    })
    return { ...b, locked: locked.length, atRisk: atRisk.length, loyaltyProtected: locked.filter(l => l.loyalty_protected).length }
  })

  const totalLocked = clientLocks.filter(l => l.locked).length
  const totalAtRisk = locksByBarber.reduce((sum, b) => sum + b.atRisk, 0)
  const totalFloating = clientLocks.filter(l => !l.locked).length

  const statusColor = (s: string) => {
    if (s === 'done') return 'text-green-500'
    if (s === 'confirmed') return 'text-blue-400'
    if (s === 'noshow') return 'text-red-400'
    return 'text-neutral-500'
  }

  const displayAppts = apptTab === 'today' ? appointments : upcomingAppointments

  const ApptTable = React.memo(({ appts }: { appts: any[] }) => (
    appts.length === 0 ? (
      <div className="p-6 text-center text-neutral-500 text-sm">
        {apptTab === 'today'
          ? <>No appointments today. Share <span className="text-amber-500 font-mono">chairos.cc/book/{shop?.shop_code}</span> to start taking bookings.</>
          : 'No upcoming appointments scheduled.'}
      </div>
    ) : (
      <div className="divide-y divide-neutral-800">
        {appts.map((a) => (
          <div key={a.id} className="px-5 py-4">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="flex items-center gap-3">
                <div className="font-mono text-sm text-amber-500 font-semibold w-16 flex-shrink-0">
                  {a.time?.slice(0,5)}
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">{a.client_name}</div>
                  <div className="text-xs text-neutral-500">{a.client_phone}</div>
                </div>
              </div>
              {apptTab === 'upcoming' && (
                <div className="text-xs font-mono text-neutral-400 flex-shrink-0">
                  {new Date(a.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 ml-19 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="text-xs text-white font-medium truncate">{a.services?.name}</div>
                <div className="text-xs text-neutral-500">${a.price}</div>
              </div>
              <select
                value={a.barber_id || ''}
                onChange={e => updateAppointmentBarber(a.id, e.target.value)}
                className="bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1.5 text-xs text-white outline-none focus:border-amber-500 max-w-32">
                <option value="">Unassigned</option>
                {barbers.map(b => (
                  <option key={b.id} value={b.barber_id || ''}>{b.barber_name || b.alias}</option>
                ))}
              </select>
              <select
                value={a.status}
                onChange={e => updateAppointmentStatus(a.id, e.target.value)}
                className={`bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-amber-500 ${statusColor(a.status)}`}>
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="done">Done</option>
                <option value="noshow">No Show</option>
                <option value="cancelled">Cancelled</option>
              </select>
              {a.status === 'done' && (
                <TipInput
                  appointmentId={a.id}
                  barberId={a.barber_id}
                  shopId={shop.id}
                  onTipAdded={() => shopId && loadAppointmentsAndTips(shopId)}
                />
              )}
            </div>
          </div>
        ))}
      </div>
    )
  ))

  return (
    <div className="min-h-screen bg-neutral-950">
      {toast && (
        <div className={`fixed bottom-20 md:bottom-6 right-6 z-50 px-4 py-3 rounded-lg text-sm font-medium shadow-lg ${
          toast.type === 'error' ? 'bg-red-900 border border-red-700 text-red-200' : 'bg-neutral-800 border border-green-700 text-green-300'
        }`}>
          {toast.msg}
        </div>
      )}

      <OwnerNav shopName={shop?.name} ownerName={profile?.full_name} initials={initials} />

      <div className="p-6 max-w-6xl mx-auto pb-20 md:pb-0">

        {/* GREETING */}
        <div className="mb-6">
          <div className="text-xs font-semibold tracking-widest uppercase text-neutral-500 mb-1">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
          <div className="font-serif text-2xl text-white">
            {new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'},{' '}
            {profile?.full_name?.split(' ')[0] || shop?.name?.split(' ')[0] || 'Boss'}.
          </div>
          <div className="text-sm text-neutral-500 mt-1">
            {appointments.length > 0
              ? `${appointments.length} appointment${appointments.length !== 1 ? 's' : ''} on the books today.`
              : 'No appointments scheduled yet today.'}
          </div>
        </div>

        {/* YESTERDAY RECAP */}
        {yesterdayAppointments.length > 0 && (
          <div className="mb-6">
            <div className="text-xs font-semibold tracking-widest uppercase text-neutral-500 mb-3">Yesterday</div>
            <button
              onClick={() => router.push('/dashboard/appointments/history')}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-xl p-5 text-left hover:border-neutral-700 transition-colors">
              <div className="flex items-center justify-between mb-4">
                <div className="text-xs font-semibold tracking-widest uppercase text-neutral-500">
                  {new Date(new Date().setDate(new Date().getDate() - 1)).toLocaleDateString('en-US', { weekday: 'long' })}'s recap
                </div>
                <div className="text-xs text-amber-500">View full report →</div>
              </div>
              <div className="flex items-center gap-0 divide-x divide-neutral-800">
                {[
                  {
                    label: 'Revenue',
                    value: `$${yesterdayAppointments.filter(a => a.status === 'done').reduce((s, a) => s + (parseFloat(a.price) || 0), 0).toFixed(0)}`,
                    color: 'text-amber-500'
                  },
                  {
                    label: 'Appointments',
                    value: yesterdayAppointments.length.toString(),
                    color: 'text-white'
                  },
                  {
                    label: 'Tips',
                    value: `$${yesterdayTips.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0).toFixed(0)}`,
                    color: 'text-green-400'
                  },
                  {
                    label: 'No-shows',
                    value: yesterdayAppointments.filter(a => a.status === 'noshow').length.toString(),
                    color: yesterdayAppointments.filter(a => a.status === 'noshow').length > 0 ? 'text-red-400' : 'text-white'
                  },
                ].map((stat, i) => (
                  <div key={i} className="flex-1 px-4 first:pl-0 last:pr-0 text-center">
                    <div className={`font-serif text-2xl mb-1 ${stat.color}`}>{stat.value}</div>
                    <div className="text-xs text-neutral-500">{stat.label}</div>
                  </div>
                ))}
              </div>
            </button>
          </div>
        )}

        <div className="text-xs font-semibold tracking-widest uppercase text-neutral-500 mb-3">Today</div>

        {/* KPI CARDS */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <button onClick={() => router.push('/dashboard/appointments/history')}
            className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 text-left hover:border-amber-500/50 transition-colors">
            <div className="text-xs font-semibold tracking-widest uppercase text-neutral-500 mb-3">Today's Revenue</div>
            <div className="font-serif text-3xl text-white mb-1">${todayRevenue.toFixed(2)}</div>
            <div className="text-xs text-neutral-500">{doneCount} completed</div>
          </button>
          <button onClick={() => setApptTab('today')}
            className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 text-left hover:border-amber-500/50 transition-colors">
            <div className="text-xs font-semibold tracking-widest uppercase text-neutral-500 mb-3">Today's Bookings</div>
            <div className="font-serif text-3xl text-white mb-1">{appointments.length}</div>
            <div className="text-xs text-neutral-500">{upcomingAppointments.length} upcoming</div>
          </button>
          <button onClick={() => router.push('/dashboard/appointments/history?status=noshow')}
            className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 text-left hover:border-amber-500/50 transition-colors">
            <div className="text-xs font-semibold tracking-widest uppercase text-neutral-500 mb-3">No-Show Rate</div>
            <div className="font-serif text-3xl text-white mb-1">{noShowRate !== null ? `${noShowRate}%` : '—'}</div>
            <div className="text-xs text-neutral-500">{noShowCount} no-shows</div>
          </button>
          <button onClick={() => router.push('/dashboard/clients')}
            className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 text-left hover:border-amber-500/50 transition-colors">
            <div className="text-xs font-semibold tracking-widest uppercase text-neutral-500 mb-3">Tips Today</div>
            <div className="font-serif text-3xl text-green-400 mb-1">${totalTips.toFixed(2)}</div>
            <div className="text-xs text-neutral-500">Across all barbers</div>
          </button>
        </div>

        <div className="text-xs font-semibold tracking-widest uppercase text-neutral-500 mb-3 mt-6">Client lock</div>
        {/* CLIENT LOCK */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-neutral-800 flex justify-between items-center">
            <div>
              <div className="font-serif text-white flex items-center gap-2">
                Client Lock
                <span className="text-xs font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded-full">Proprietary</span>
              </div>
              <div className="text-xs text-neutral-500 mt-0.5">Client retention intelligence — updates on every completed appointment</div>
            </div>
          </div>
          <div className="grid grid-cols-3 divide-x divide-neutral-800 border-b border-neutral-800">
            <button onClick={() => router.push('/dashboard/clients')} className="p-5 text-center hover:bg-neutral-800/50 transition-colors w-full">
              <div className="font-serif text-3xl text-green-400 mb-1">{totalLocked}</div>
              <div className="text-xs font-semibold tracking-widest uppercase text-neutral-500">Locked</div>
              <div className="text-xs text-neutral-600 mt-1">Claimed by a barber</div>
            </button>
            <button onClick={() => router.push('/dashboard/clients')} className="p-5 text-center hover:bg-neutral-800/50 transition-colors w-full">
              <div className="font-serif text-3xl text-amber-500 mb-1">{totalAtRisk}</div>
              <div className="text-xs font-semibold tracking-widest uppercase text-neutral-500">At Risk</div>
              <div className="text-xs text-neutral-600 mt-1">Approaching lapse window</div>
            </button>
            <button onClick={() => router.push('/dashboard/clients')} className="p-5 text-center hover:bg-neutral-800/50 transition-colors w-full">
              <div className="font-serif text-3xl text-red-400 mb-1">{totalFloating}</div>
              <div className="text-xs font-semibold tracking-widest uppercase text-neutral-500">Floating</div>
              <div className="text-xs text-neutral-600 mt-1">Not assigned — revenue risk</div>
            </button>
          </div>
          {locksByBarber.length === 0 ? (
            <div className="p-6 text-center text-neutral-500 text-sm">Client Lock activates after clients complete appointments.</div>
          ) : (
            <div className="divide-y divide-neutral-800">
              {locksByBarber.map((b, i) => (
                <div key={b.id} className="px-5 py-4 flex items-center gap-4">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center font-serif text-sm font-bold flex-shrink-0"
                    style={{ background: (b.color || COLORS[i % COLORS.length]) + '22', border: `2px solid ${b.color || COLORS[i % COLORS.length]}`, color: b.color || COLORS[i % COLORS.length] }}>
                    {(b.barber_name || b.alias || '?')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white">{b.barber_name || b.alias}</div>
                    <div className="text-xs text-neutral-500 mt-0.5">
                      {b.loyaltyProtected > 0 && <span className="text-amber-500 mr-2">★ {b.loyaltyProtected} loyalty</span>}
                      {b.locked} locked
                    </div>
                  </div>
                  <div className="flex gap-4 text-center">
                    <div>
                      <div className="font-serif text-lg text-green-400">{b.locked}</div>
                      <div className="text-xs text-neutral-600">Locked</div>
                    </div>
                    <div>
                      <div className={`font-serif text-lg ${b.atRisk > 0 ? 'text-amber-500' : 'text-neutral-600'}`}>{b.atRisk}</div>
                      <div className="text-xs text-neutral-600">At Risk</div>
                    </div>
                    <div>
                      <div className={`font-serif text-lg ${b.loyaltyProtected > 0 ? 'text-amber-500' : 'text-neutral-600'}`}>{b.loyaltyProtected}</div>
                      <div className="text-xs text-neutral-600">Loyalty</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="text-xs font-semibold tracking-widest uppercase text-neutral-500 mb-3 mt-6">Schedule</div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-2 bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-neutral-800 flex justify-between items-center">
              <div className="flex gap-1 bg-neutral-800 rounded-lg p-1">
                <button onClick={() => setApptTab('today')}
                  className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${apptTab === 'today' ? 'bg-neutral-700 text-white' : 'text-neutral-500'}`}>
                  Today ({appointments.length})
                </button>
                <button onClick={() => setApptTab('upcoming')}
                  className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${apptTab === 'upcoming' ? 'bg-neutral-700 text-white' : 'text-neutral-500'}`}>
                  Upcoming ({upcomingAppointments.length})
                </button>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => router.push('/dashboard/appointments/history')}
                  className="text-xs text-neutral-500 hover:text-amber-500 transition-colors">
                  History
                </button>
                <span className="text-xs font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20 px-3 py-1 rounded-full">Live</span>
              </div>
            </div>
            <ApptTable appts={displayAppts} />
          </div>

          <div>
            <div className="text-xs font-semibold tracking-widest uppercase text-neutral-500 mb-3">Shop</div>
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-neutral-800">
              <div className="font-serif text-white">Shop Info</div>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <div className="text-xs font-semibold tracking-widest uppercase text-neutral-500 mb-1">Booking Link</div>
                <div className="font-mono text-xs text-amber-500 break-all">
                  {shop?.slug ? `chairos.cc/shop/${shop.slug}` : `chairos.cc/book/${shop?.shop_code}`}
                </div>
                <button
                  onClick={() => {
                    const link = shop?.slug
                      ? `https://chairos.cc/book/${shop.shop_code}`
                      : `https://chairos.cc/book/${shop?.shop_code}`
                    navigator.clipboard.writeText(link)
                    setLinkCopied(true)
                    setTimeout(() => setLinkCopied(false), 2000)
                  }}
                  className="text-xs font-semibold text-amber-500 hover:text-amber-400 transition-colors mt-1">
                  {linkCopied ? '✓ Copied!' : 'Copy link'}
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
        </div>

        {/* TIPS */}
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
                  <button onClick={() => b.barber_id && cashOutTips(b.barber_id)}
                    disabled={b.pendingTips === 0 || cashingOut === b.barber_id}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      b.pendingTips > 0 && cashingOut !== b.barber_id
                        ? 'bg-green-500/20 hover:bg-green-500 text-green-400 hover:text-white border border-green-500/30'
                        : 'bg-neutral-800 text-neutral-600 border border-neutral-700 cursor-not-allowed'
                    }`}>
                    {cashingOut === b.barber_id ? 'Cashing…' : b.pendingTips > 0 ? 'Cash Out' : 'Paid Out'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* THE FLOOR */}
        <div className="mb-6">
          <div className="text-xs font-semibold tracking-widest uppercase text-neutral-500 mb-3 mt-6">The floor</div>
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="text-xs font-semibold tracking-widest uppercase text-neutral-500">Who's in</div>
              <div className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-green-500">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                Live
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              {barbers.map((b, i) => {
                const color = b.color || COLORS[i % COLORS.length]
                const isOn = b.active && b.barber_id
                return (
                  <div key={b.id}
                    className={`flex items-center gap-3 rounded-xl px-4 py-3 border flex-1 min-w-36 transition-colors ${
                      isOn
                        ? 'bg-neutral-800/50 border-neutral-700'
                        : 'bg-neutral-900 border-neutral-800 opacity-50'
                    }`}>
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center font-serif text-sm font-bold flex-shrink-0"
                      style={{
                        background: isOn ? color + '22' : '#1a1a1a',
                        border: `1.5px solid ${isOn ? color + '66' : '#2a2a2a'}`,
                        color: isOn ? color : '#4a4a4a'
                      }}>
                      {(b.barber_name || b.alias || '?')[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-white truncate">{b.barber_name || b.alias}</div>
                      <div className={`text-xs mt-0.5 ${isOn ? 'text-green-500' : 'text-neutral-600'}`}>
                        {!b.barber_id ? 'Pending' : isOn ? 'On the floor' : 'Off the floor'}
                      </div>
                    </div>
                  </div>
                )
              })}
              {barbers.length === 0 && (
                <div className="text-sm text-neutral-500 py-2">No barbers added yet.</div>
              )}
            </div>
            <button
              onClick={() => router.push('/dashboard/barbers')}
              className="mt-4 w-full py-2 text-xs text-neutral-500 hover:text-amber-500 transition-colors border-t border-neutral-800 text-center">
              Manage barbers →
            </button>
          </div>
        </div>

        {/* SERVICES */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden mb-6">
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

      <MobileNav />
    </div>
  )
}