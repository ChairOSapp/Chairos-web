'use client'
import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import OwnerNav from '@/components/OwnerNav'
import MobileNav from '@/components/MobileNav'
import TrialCountdownBanner from '@/components/TrialCountdownBanner'
import PaywallBanner from '@/components/PaywallBanner'
import BriefCard from '@/components/BriefCard'
import { getBillingStatus } from '@/lib/billing'

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
    const { data: existing } = await supabase.from('tips').select('id').eq('appointment_id', appointmentId).eq('barber_id', barberId).maybeSingle()
    if (existing) {
      await supabase.from('tips').update({ amount }).eq('id', existing.id)
    } else {
      await supabase.from('tips').insert({ appointment_id: appointmentId, barber_id: barberId, shop_id: shopId, amount, cashed_out: false })
    }
    setValue('')
    setSaving(false)
    onTipAdded()
  }

  return (
    <div className="flex items-center gap-1">
      <span className="text-charcoal-500 text-xs">$</span>
      <input
        type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00"
        value={value}
        onChange={e => { const v = e.target.value; if (v !== '' && parseFloat(v) < 0) return; setValue(v) }}
        autoComplete="off"
        className="w-14 bg-warm-200 border border-warm-300 rounded px-2 py-1.5 text-xs text-charcoal-900 outline-none focus:border-od-green [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button onClick={handleAddTip} disabled={saving || !value}
        className="bg-green-500/20 hover:bg-green-500 text-green-400 hover:text-white border border-green-500/30 rounded px-2 py-1.5 text-xs transition-colors disabled:opacity-50">
        {saving ? '...' : '+ Tip'}
      </button>
    </div>
  )
})
TipInput.displayName = 'TipInput'

function getWeekDays(): Date[] {
  const now = new Date()
  const day = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1))
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function PaymentBadge({ status }: { status?: string }) {
  if (status === 'paid') return (
    <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-green-500/10 text-green-500 border border-green-500/20">PAID</span>
  )
  if (status === 'failed') return (
    <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20">FAILED</span>
  )
  return (
    <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-warm-200 text-charcoal-400 border border-warm-300">UNPAID</span>
  )
}
export default function Dashboard() {
  const [profile, setProfile] = useState<any>(null)
  const [shop, setShop] = useState<any>(null)
  const [barbers, setBarbers] = useState<any[]>([])
  const [allBarbers, setAllBarbers] = useState<any[]>([])
  const [services, setServices] = useState<any[]>([])
  const [todayAppointments, setTodayAppointments] = useState<any[]>([])
  const [weekAppointments, setWeekAppointments] = useState<any[]>([])
  const [tips, setTips] = useState<any[]>([])
  const [clientLocks, setClientLocks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [shopId, setShopId] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<string>(() => toDateStr(new Date()))
  const [toast, setToast] = useState<{msg: string; type: 'success'|'error'} | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const todayStr = toDateStr(new Date())
  const weekDays = getWeekDays()

  const showToast = (msg: string, type: 'success'|'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const loadSchedule = useCallback(async (sid: string) => {
    const today = toDateStr(new Date())
    const todayUTC = new Date().toISOString().split('T')[0] + 'T00:00:00Z'
    const days = getWeekDays()
    const weekStart = toDateStr(days[0])
    const weekEnd = toDateStr(days[6])

    const [{ data: todayAppts }, { data: weekAppts }, { data: tipsData }] = await Promise.all([
      supabase.from('appointments').select('*, services(*)').eq('shop_id', sid).eq('date', today).order('time', { ascending: true }),
      supabase.from('appointments').select('*, services(*)').eq('shop_id', sid).gte('date', weekStart).lte('date', weekEnd).order('date').order('time', { ascending: true }),
      supabase.from('tips').select('*').eq('shop_id', sid).gte('created_at', todayUTC),
    ])

    setTodayAppointments(todayAppts || [])
    setWeekAppointments(weekAppts || [])
    setTips(tipsData || [])
  }, [])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      let { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()

      // Re-fetch after a short delay when returning from Stripe checkout so the
      // webhook has time to land before we read subscription state.
      const params = new URLSearchParams(window.location.search)
      if (params.get('subscribed') === '1') {
        await new Promise(r => setTimeout(r, 2500))
        const { data: fresh } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
        if (fresh) prof = fresh
        window.history.replaceState({}, '', '/dashboard')
      }

      setProfile(prof)
      if (prof?.role === 'barber') { router.push('/dashboard/barber'); return }
      if (getBillingStatus(prof) === 'blocked') { router.push('/subscribe'); return }

      if (prof?.role === 'owner') {
        const { data: shops } = await supabase.from('shops').select('*').eq('owner_id', user.id).order('created_at', { ascending: true }).limit(1)
        const shopData = shops?.[0] || null
        if (!shopData) { router.push('/onboarding'); return }
        setShop(shopData)
        setShopId(shopData.id)

        const [{ data: barbersData }, { data: allBarbersData }, { data: svcs }, { data: locks }] = await Promise.all([
          supabase.from('shop_barbers').select('*').eq('shop_id', shopData.id).eq('active', true),
          supabase.from('shop_barbers').select('*').eq('shop_id', shopData.id).order('joined_at', { ascending: true }),
          supabase.from('services').select('*').eq('shop_id', shopData.id).eq('active', true),
          supabase.from('client_locks').select('id, locked, barber_id, shop_id, last_booking_date, loyalty_protected, client_id').eq('shop_id', shopData.id),
        ])

        setBarbers(barbersData || [])
        setAllBarbers(allBarbersData || [])
        setServices(svcs || [])
        setClientLocks(locks || [])
        await loadSchedule(shopData.id)
      }

      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    if (!shopId) return
    const channel = supabase
      .channel(`shop-${shopId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `shop_id=eq.${shopId}` }, () => loadSchedule(shopId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tips', filter: `shop_id=eq.${shopId}` }, () => loadSchedule(shopId))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'shop_barbers', filter: `shop_id=eq.${shopId}` }, async () => {
        const { data: updated } = await supabase.from('shop_barbers').select('*').eq('shop_id', shopId).order('joined_at', { ascending: true })
        setAllBarbers(updated || [])
        setBarbers((updated || []).filter((b: any) => b.active))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [shopId])

  async function updateAppointmentStatus(id: string, status: string) {
    const { error } = await supabase.from('appointments').update({ status }).eq('id', id)
    if (error) showToast(error.message, 'error')
    else if (shopId) loadSchedule(shopId)
  }

  async function updateAppointmentBarber(id: string, barberId: string) {
    const { error } = await supabase.from('appointments').update({ barber_id: barberId || null }).eq('id', id)
    if (error) showToast(error.message, 'error')
  }

  if (loading) return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-od-green border-t-transparent animate-spin" />
    </div>
  )

  const ownerName = profile?.full_name || shop?.name || 'Owner'
  const initials = ownerName.split(' ').map((w: string) => w[0]).join('').substring(0,2).toUpperCase()
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = profile?.full_name?.split(' ')[0] || shop?.name?.split(' ')[0] || 'Boss'

  const todayRevenue = todayAppointments.filter(a => a.status === 'done').reduce((s, a) => s + (parseFloat(a.price) || 0), 0)
  const totalTips = tips.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0)
  const doneCount = todayAppointments.filter(a => a.status === 'done').length
  const noShowCount = todayAppointments.filter(a => a.status === 'noshow').length
  const noShowRate = todayAppointments.length > 0 ? Math.round((noShowCount / todayAppointments.length) * 100) : 0

  const scheduleAppts = weekAppointments.filter(a => a.date === selectedDate)
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''))

  const daysWithAppts = new Set(weekAppointments.map(a => a.date))

  const totalLocked = clientLocks.filter(l => l.locked).length
  const totalAtRisk = clientLocks.filter(l => {
    if (!l.locked || !l.last_booking_date) return false
    const days = Math.floor((Date.now() - new Date(l.last_booking_date).getTime()) / 86400000)
    return l.loyalty_protected ? days > 300 : days > 60
  }).length
  const totalFloating = clientLocks.filter(l => !l.locked).length

  const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
    done: { label: 'Done', cls: 'text-od-green bg-od-green/10' },
    confirmed: { label: 'Confirmed', cls: 'text-blue-500 bg-blue-50' },
    pending: { label: 'Pending', cls: 'text-charcoal-500 bg-warm-200' },
    noshow: { label: 'No-show', cls: 'text-red-500 bg-red-50' },
    cancelled: { label: 'Cancelled', cls: 'text-charcoal-400 bg-warm-200' },
  }

  return (
    <div className="min-h-screen bg-warm-50">
      {toast && (
        <div className={`fixed bottom-20 md:bottom-6 right-6 z-50 px-4 py-3 rounded-lg text-sm font-medium shadow-lg ${
          toast.type === 'error' ? 'bg-red-50 border border-red-200 text-red-600' : 'bg-warm-200 border border-od-green/30 text-od-green'
        }`}>
          {toast.msg}
        </div>
      )}

      <OwnerNav shopName={shop?.name || ''} ownerName={ownerName} initials={initials} userId={profile?.id} />

      <div className="p-5 max-w-2xl mx-auto pb-24 md:pb-8">

        {/* 1. TRIAL BANNER */}
        <TrialCountdownBanner
          subscriptionStatus={profile?.subscription_status ?? null}
          trialEnd={profile?.trial_end ?? null}
          stripeCustomerId={profile?.stripe_customer_id ?? null}
        />
        <PaywallBanner
          subscriptionStatus={profile?.subscription_status ?? null}
          subscriptionEndDate={profile?.subscription_end_date ?? null}
        />

        <BriefCard recipientName={ownerName} />

        {/* 2. HEADER */}
        <div className="mb-5">
          <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500 mb-0.5">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
          <div className="font-serif text-2xl text-charcoal-900">
            {greeting}, {firstName}.
          </div>
        </div>

        {/* 3. TODAY AT A GLANCE */}
        <div className="bg-warm-100 border border-warm-200 rounded-2xl p-5 mb-5">
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500">Today at a glance</div>
            <div className="flex gap-2">
              <button onClick={() => router.push('/dashboard/revenue')} className="btn-chairos">Revenue</button>
              <button onClick={() => router.push('/dashboard/analytics')} className="btn-chairos-outline">CRM</button>
            </div>
          </div>
          <div className="font-serif text-5xl text-charcoal-900 leading-none mb-4">
            ${todayRevenue.toFixed(2)}
          </div>
          <div className="grid grid-cols-2 gap-3 pt-4 border-t border-warm-200">
            <div className="bg-warm-50 rounded-xl p-3">
              <div className="font-serif text-xl text-charcoal-900">{doneCount} / {todayAppointments.length}</div>
              <div className="text-xs text-charcoal-500 mt-0.5">Appointments done</div>
            </div>
            <button onClick={() => router.push('/dashboard/tips')}
              className="bg-warm-50 rounded-xl p-3 text-left hover:bg-warm-200 transition-colors">
              <div className="font-serif text-xl text-green-500">${totalTips.toFixed(0)}</div>
              <div className="text-xs text-charcoal-500 mt-0.5">Tips today</div>
            </button>
            <div className="bg-warm-50 rounded-xl p-3">
              <div className={`font-serif text-xl ${noShowCount > 0 ? 'text-red-400' : 'text-charcoal-900'}`}>
                {noShowRate}%
              </div>
              <div className="text-xs text-charcoal-500 mt-0.5">No-show rate</div>
            </div>
            <button onClick={() => router.push('/dashboard/appointments/history')}
              className="bg-warm-50 rounded-xl p-3 text-left hover:bg-warm-200 transition-colors">
              <div className="font-serif text-xl text-charcoal-900">History</div>
              <div className="text-xs text-charcoal-500 mt-0.5">View all</div>
            </button>
          </div>
        </div>

        {/* 4. CALENDAR */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500">Schedule</div>
            <button onClick={() => router.push('/dashboard/calendar')} className="btn-chairos">Open Calendar</button>
          </div>
          <button
            onClick={() => router.push('/dashboard/calendar')}
            className="w-full bg-warm-100 border border-warm-200 rounded-2xl p-5 text-left hover:bg-warm-200/60 transition-colors group">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-1">Today</div>
                <div className="font-serif text-2xl text-charcoal-900">
                  {todayAppointments.length} <span className="text-charcoal-500 text-lg">appointments</span>
                </div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-[#0d9488]/10 border border-[#0d9488]/20 flex items-center justify-center group-hover:bg-[#0d9488]/20 transition-colors">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0d9488" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
              </div>
            </div>
            {todayAppointments.slice(0, 3).map(a => {
              const barber = barbers.find(b => b.barber_id === a.barber_id)
              return (
                <div key={a.id} className="flex items-center gap-3 py-1.5 border-t border-warm-200 first:border-0">
                  <span className="font-mono text-xs text-[#0d9488] w-10 flex-shrink-0">{a.time?.slice(0,5) || '—'}</span>
                  <span className="text-sm font-medium text-charcoal-900 flex-1 truncate">{a.client_name}</span>
                  {barber && <span className="text-xs text-charcoal-400 flex-shrink-0">{barber.barber_name || barber.alias}</span>}
                </div>
              )
            })}
            {todayAppointments.length > 3 && (
              <div className="text-xs text-charcoal-400 pt-2 border-t border-warm-200">+{todayAppointments.length - 3} more · tap to open calendar</div>
            )}
            {todayAppointments.length === 0 && (
              <div className="text-sm text-charcoal-400 pt-2 border-t border-warm-200">No appointments today · tap to open calendar</div>
            )}
          </button>
        </div>

        {/* 5. THE FLOOR — compact pills */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500">The floor</div>
            <button onClick={() => router.push('/dashboard/barbers')} className="btn-chairos-outline">Manage</button>
          </div>
          <div className="bg-warm-100 border border-warm-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs text-charcoal-500">
                {allBarbers.filter((b: any) => b.on_floor && b.barber_id).length} of {allBarbers.filter((b: any) => !!b.barber_id).length} barbers in
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {allBarbers.map((b: any) => {
                const isLinked = !!b.barber_id
                const isOn = b.on_floor && isLinked
                return (
                  <div key={b.id}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${
                      isOn
                        ? 'bg-green-500/10 border-green-500/20 text-green-600'
                        : isLinked
                          ? 'bg-warm-200 border-warm-300 text-charcoal-500'
                          : 'bg-warm-200 border-warm-300 text-charcoal-400'
                    }`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${isOn ? 'bg-green-500' : 'bg-warm-400'}`} />
                    {b.barber_name || b.alias}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* 6. CLIENT LOCK — compact */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500">Client lock</div>
            <button onClick={() => router.push('/dashboard/analytics')} className="btn-chairos-outline">Analytics</button>
          </div>
          <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden">
            <div className="grid grid-cols-3 divide-x divide-warm-200">
              {[
                { label: 'Locked', count: totalLocked, color: 'text-od-green', href: '/dashboard/clients' },
                { label: 'At Risk', count: totalAtRisk, color: 'text-amber-600', href: '/dashboard/clients' },
                { label: 'Floating', count: totalFloating, color: 'text-red-400', href: '/dashboard/clients' },
              ].map((s) => (
                <button key={s.label} onClick={() => router.push(s.href)}
                  className="p-4 text-center hover:bg-warm-200/50 transition-colors">
                  <div className={`font-serif text-3xl mb-1 ${s.color}`}>{s.count}</div>
                  <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500">{s.label}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 7. SHOP — compact */}
        <div className="mb-5">
          <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500 mb-3">Shop</div>
          <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden">
            <div className="divide-y divide-warm-200">
              <div className="flex items-center justify-between px-5 py-3">
                <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500">Booking link</div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-od-green">
                    {shop?.slug ? `chairos.cc/shop/${shop.slug}` : `chairos.cc/book/${shop?.shop_code}`}
                  </span>
                  <button
                    onClick={() => {
                      const link = shop?.slug ? `https://chairos.cc/shop/${shop.slug}` : `https://chairos.cc/book/${shop?.shop_code}`
                      navigator.clipboard.writeText(link)
                      setLinkCopied(true)
                      setTimeout(() => setLinkCopied(false), 2000)
                    }}
                    className="text-xs font-semibold text-od-green hover:text-od-green-light transition-colors">
                    {linkCopied ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between px-5 py-3">
                <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500">Shop code</div>
                <div className="font-mono text-sm text-charcoal-900">{shop?.shop_code}</div>
              </div>
            </div>
          </div>
        </div>

      </div>
      <MobileNav />
    </div>
  )
}
