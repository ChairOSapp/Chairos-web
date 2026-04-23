'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function Dashboard() {
  const [profile, setProfile] = useState<any>(null)
  const [shop, setShop] = useState<any>(null)
  const [barbers, setBarbers] = useState<any[]>([])
  const [services, setServices] = useState<any[]>([])
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

  const COLORS = ['#b8861f','#4a7fb5','#3aab6e','#e07850','#9b6db5','#c06060']
  const initials = shop?.name?.split(' ').map((w: string) => w[0]).join('').substring(0,2).toUpperCase() || 'CH'
  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

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
          {[
            { label: "Today's Revenue", value: '$0', sub: 'No bookings yet' },
            { label: 'Appointments', value: '0', sub: 'None today' },
            { label: 'No-Show Rate', value: '—', sub: 'No data yet' },
            { label: 'Monthly Revenue', value: '$0', sub: 'Just getting started' },
          ].map((k, i) => (
            <div key={i} className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
              <div className="text-xs font-semibold tracking-widest uppercase text-neutral-500 mb-3">{k.label}</div>
              <div className="font-serif text-3xl text-white mb-1">{k.value}</div>
              <div className="text-xs text-neutral-500">{k.sub}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-2 bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-neutral-800 flex justify-between items-center">
              <div>
                <div className="font-serif text-white">Today's Appointments</div>
                <div className="text-xs text-neutral-500 mt-0.5">Live booking feed</div>
              </div>
              <span className="text-xs font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20 px-3 py-1 rounded-full">Live</span>
            </div>
            <div className="p-6 text-center text-neutral-500 text-sm">
              No appointments yet. Share your shop link to start taking bookings.
            </div>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-neutral-800">
              <div className="font-serif text-white">Shop Info</div>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <div className="text-xs font-semibold tracking-widest uppercase text-neutral-500 mb-1">Shop Code</div>
                <div className="font-mono text-lg font-bold text-amber-500 tracking-widest">{shop?.shop_code || '—'}</div>
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