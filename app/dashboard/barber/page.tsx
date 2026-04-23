'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function BarberDashboard() {
  const [profile, setProfile] = useState<any>(null)
  const [shopBarber, setShopBarber] = useState<any>(null)
  const [shop, setShop] = useState<any>(null)
  const [appointments, setAppointments] = useState<any[]>([])
  const [tips, setTips] = useState<any[]>([])
  const [boothRent, setBoothRent] = useState<any>(null)
  const [showEarnings, setShowEarnings] = useState(false)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

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

      // Get barber's shop link
      const { data: shopBarber } = await supabase
        .from('shop_barbers')
        .select('*, shops(*)')
        .eq('barber_id', user.id)
        .eq('active', true)
        .single()

      if (!shopBarber) { router.push('/join'); return }
      setShopBarber(shopBarber)
      setShop(shopBarber.shops)

      // Today's appointments
      const today = new Date().toISOString().split('T')[0]
      const { data: appointments } = await supabase
        .from('appointments')
        .select('*, services(*)')
        .eq('barber_id', user.id)
        .eq('date', today)
        .order('time', { ascending: true })
      setAppointments(appointments || [])

      // Today's tips
      const { data: tips } = await supabase
        .from('tips')
        .select('*')
        .eq('barber_id', user.id)
        .gte('created_at', today)
      setTips(tips || [])

      // Booth rent if applicable
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

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
      <div className="text-amber-500 text-sm">Loading...</div>
    </div>
  )

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = profile?.full_name?.split(' ')[0] || 'Barber'
  const color = shopBarber?.color || '#b8861f'
  const initial = firstName[0].toUpperCase()

  // Earnings calculations
  const todayRevenue = appointments
    .filter(a => a.status === 'done')
    .reduce((sum, a) => sum + (parseFloat(a.price) || 0), 0)
  const barberCut = shopBarber?.compensation_type === 'commission'
    ? todayRevenue * (shopBarber?.commission_rate || 0.7)
    : todayRevenue
  const totalTips = tips.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0)
  const pendingTips = tips.filter(t => !t.cashed_out).reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0)

  return (
    <div className="min-h-screen bg-neutral-950">

      <header className="bg-neutral-900 border-b border-neutral-800 px-6 h-14 flex items-center justify-between sticky top-0 z-10">
        <span className="font-serif text-amber-500 text-lg">ChairOS</span>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-sm text-white font-medium">{profile?.full_name}</div>
            <div className="text-xs text-neutral-500">{shop?.name}</div>
          </div>
          <div className="w-8 h-8 rounded-full flex items-center justify-center font-serif text-sm font-bold"
            style={{ background: color + '22', border: `2px solid ${color}`, color }}>
            {initial}
          </div>
          <button onClick={handleSignOut} className="text-xs text-neutral-500 hover:text-white transition-colors">
            Sign out
          </button>
        </div>
      </header>

      <div className="p-6 max-w-2xl mx-auto">

        {/* GREETING */}
        <div className="mb-6">
          <h1 className="font-serif text-2xl text-white mb-1">{greeting}, {firstName}</h1>
          <p className="text-neutral-500 text-sm">{today}</p>
        </div>

        {/* BARBER HERO CARD */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 mb-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center font-serif text-xl font-bold flex-shrink-0"
            style={{ background: color + '22', border: `2px solid ${color}`, color }}>
            {initial}
          </div>
          <div className="flex-1">
            <div className="font-serif text-lg text-white">{shopBarber?.barber_name || shopBarber?.alias}</div>
            <div className="text-xs text-neutral-500 uppercase tracking-widest mt-0.5">{shop?.name}</div>
          </div>
          <div className="text-right">
            <div className="text-xs font-semibold text-green-500 uppercase tracking-widest">● On the Floor</div>
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

        {/* SCHEDULE */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-neutral-800 flex justify-between items-center">
            <div>
              <div className="font-serif text-white">Today's Schedule</div>
              <div className="text-xs text-neutral-500 mt-0.5">{appointments.length} appointments</div>
            </div>
            <span className="text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 px-3 py-1 rounded-full">
              Active
            </span>
          </div>
          {appointments.length === 0 ? (
            <div className="p-6 text-center text-neutral-500 text-sm">
              No appointments today. Your schedule will appear here once clients start booking.
            </div>
          ) : (
            <div className="divide-y divide-neutral-800">
              {appointments.map((a) => (
                <div key={a.id} className="px-5 py-3 flex items-center gap-4">
                  <div className="text-xs font-mono text-neutral-400 w-16 flex-shrink-0">{a.time?.slice(0,5)}</div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-white">{a.client_name}</div>
                    <div className="text-xs text-neutral-500">{a.services?.name} · {a.services?.duration_minutes} mins</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm text-amber-500">${a.price}</div>
                    <div className={`text-xs font-semibold mt-0.5 ${
                      a.status === 'done' ? 'text-green-500' :
                      a.status === 'confirmed' ? 'text-blue-400' : 'text-neutral-500'
                    }`}>{a.status}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* EARNINGS TOGGLE */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
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
              <div className="grid grid-cols-3 divide-x divide-neutral-800">
                <div className="p-4">
                  <div className="text-xs font-semibold tracking-widest uppercase text-neutral-500 mb-2">My Cut Today</div>
                  <div className="font-serif text-2xl text-white">${barberCut.toFixed(2)}</div>
                  <div className="text-xs text-neutral-500 mt-1">
                    {shopBarber?.compensation_type === 'commission'
                      ? `${Math.round((shopBarber?.commission_rate || 0.7) * 100)}% of $${todayRevenue.toFixed(2)}`
                      : 'After booth rent'}
                  </div>
                </div>
                <div className="p-4">
                  <div className="text-xs font-semibold tracking-widest uppercase text-neutral-500 mb-2">Tips Today</div>
                  <div className="font-serif text-2xl text-green-400">${totalTips.toFixed(2)}</div>
                  {pendingTips > 0 && (
                    <div className="text-xs text-amber-500 mt-1">${pendingTips.toFixed(2)} pending cashout</div>
                  )}
                </div>
                <div className="p-4">
                  <div className="text-xs font-semibold tracking-widest uppercase text-neutral-500 mb-2">Total Today</div>
                  <div className="font-serif text-2xl text-amber-500">${(barberCut + totalTips).toFixed(2)}</div>
                  <div className="text-xs text-neutral-500 mt-1">Cut + tips</div>
                </div>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}