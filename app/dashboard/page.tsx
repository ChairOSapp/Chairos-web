'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function Dashboard() {
  const [profile, setProfile] = useState<any>(null)
  const [shop, setShop] = useState<any>(null)
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
        const { data: shop } = await supabase
          .from('shops')
          .select('*')
          .eq('owner_id', user.id)
          .single()
        setShop(shop)
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

  // Owner with no shop yet — send to onboarding
  if (profile?.role === 'owner' && !shop) {
    router.push('/onboarding')
    return null
  }

  return (
    <div className="min-h-screen bg-neutral-950">
      {/* TOPBAR */}
      <header className="bg-neutral-900 border-b border-neutral-800 px-6 h-14 flex items-center justify-between">
        <span className="font-serif text-amber-500 text-lg">ChairOS</span>
        <div className="flex items-center gap-4">
          <span className="text-neutral-400 text-sm">{profile?.full_name}</span>
          <button onClick={handleSignOut}
            className="text-xs text-neutral-500 hover:text-white transition-colors">
            Sign out
          </button>
        </div>
      </header>

      <div className="p-6">
        <h1 className="font-serif text-2xl text-white mb-1">
          Good morning, {profile?.full_name?.split(' ')[0]}
        </h1>
        <p className="text-neutral-500 text-sm mb-8">
          {shop?.name} · {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>

        {/* KPI CARDS */}
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

        {/* APPOINTMENTS */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl mb-6">
          <div className="px-6 py-4 border-b border-neutral-800 flex justify-between items-center">
            <div>
              <div className="font-serif text-white">Today's Appointments</div>
              <div className="text-xs text-neutral-500 mt-0.5">Live booking feed</div>
            </div>
            <span className="text-xs font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20 px-3 py-1 rounded-full">Live</span>
          </div>
          <div className="p-6 text-center text-neutral-500 text-sm">
            No appointments yet. Once clients start booking through your site they'll appear here in real time.
          </div>
        </div>

        {/* QUICK ACTIONS */}
        <div className="flex gap-3 flex-wrap">
          {['+ New Appointment', 'Manage Services', 'Manage Barbers', 'View Client Site'].map((action, i) => (
            <button key=