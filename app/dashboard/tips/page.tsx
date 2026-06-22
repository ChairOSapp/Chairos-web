'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import MobileNav from '@/components/MobileNav'
import OwnerNav from '@/components/OwnerNav'

export default function TipsPage() {
  const [shop, setShop] = useState<any>(null)
  const [barbers, setBarbers] = useState<any[]>([])
  const [tips, setTips] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filterBarber, setFilterBarber] = useState('')
  const [filterMonth, setFilterMonth] = useState('')
  const [profile, setProfile] = useState<any>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setUserId(user.id)

    const { data: profileData } = await supabase
      .from('profiles').select('full_name').eq('id', user.id).maybeSingle()
    setProfile(profileData)

    const { data: shops } = await supabase
      .from('shops').select('*').eq('owner_id', user.id)
      .order('created_at', { ascending: true }).limit(1)
    const shop = shops?.[0] || null
    if (!shop) { router.push('/onboarding'); return }
    setShop(shop)

    const { data: barbersData } = await supabase
      .from('shop_barbers').select('*')
      .eq('shop_id', shop.id)
    setBarbers(barbersData || [])

    const { data: tipsData } = await supabase
      .from('tips')
      .select('*, appointments(client_name, date, time, services(name))')
      .eq('shop_id', shop.id)
      .order('created_at', { ascending: false })
      .limit(200)
    setTips(tipsData || [])

    setLoading(false)
  }

  async function toggleCashout(tipId: string, current: boolean) {
    await supabase.from('tips').update({ cashed_out: !current }).eq('id', tipId)
    setTips(prev => prev.map(t => t.id === tipId ? { ...t, cashed_out: !current } : t))
  }

  const getBarberName = (barberId: string) => {
    const b = barbers.find(b => b.barber_id === barberId)
    return b?.barber_name || b?.alias || 'Unknown'
  }

  const getBarberColor = (barberId: string) => {
    const COLORS = ['#b8861f','#4a7fb5','#3aab6e','#e07850','#9b6db5','#c06060']
    const idx = barbers.findIndex(b => b.barber_id === barberId)
    return barbers[idx]?.color || COLORS[idx % COLORS.length] || '#b8861f'
  }

  if (loading) return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-od-green border-t-transparent animate-spin" />
    </div>
  )

  const filtered = tips.filter(t => {
    if (filterBarber && t.barber_id !== filterBarber) return false
    if (filterMonth && !t.created_at.startsWith(filterMonth)) return false
    return true
  })

  const totalAll = filtered.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0)
  const totalPending = filtered.filter(t => !t.cashed_out).reduce((s, t) => s + (parseFloat(t.amount) || 0), 0)
  const totalPaidOut = filtered.filter(t => t.cashed_out).reduce((s, t) => s + (parseFloat(t.amount) || 0), 0)

  const months = [...new Set(tips.map(t => t.created_at?.slice(0, 7)))].filter(Boolean).slice(0, 12)

  const byBarber = barbers.filter(b => b.barber_id).map(b => ({
    barber: b,
    total: filtered.filter(t => t.barber_id === b.barber_id).reduce((s, t) => s + (parseFloat(t.amount) || 0), 0),
    pending: filtered.filter(t => t.barber_id === b.barber_id && !t.cashed_out).reduce((s, t) => s + (parseFloat(t.amount) || 0), 0),
    count: filtered.filter(t => t.barber_id === b.barber_id).length,
  })).filter(b => b.count > 0)

  return (
    <div className="min-h-screen bg-warm-50">
      <OwnerNav
        shopName={shop?.name || ''}
        ownerName={profile?.full_name || ''}
        initials={profile?.full_name?.split(' ').map((w: string) => w[0]).join('').substring(0,2).toUpperCase() || 'OS'}
        userId={userId || undefined}
      />

      <div className="p-5 max-w-2xl mx-auto pb-24">
        <div className="mb-6">
          <h1 className="font-serif text-2xl text-charcoal-900 mb-1">Tips</h1>
          <p className="text-charcoal-500 text-sm">{shop?.name}</p>
        </div>

        {shop?.barbers_collect_own_payments ? (
          <div className="bg-warm-100 border border-warm-200 rounded-xl p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-od-green/10 border border-od-green/20 flex items-center justify-center mx-auto mb-4">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="20" height="20" className="text-od-green">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
              </svg>
            </div>
            <div className="font-serif text-charcoal-900 text-lg mb-2">Barbers collect their own tips</div>
            <p className="text-sm text-charcoal-500 mb-4">Your shop is set up so each barber receives tips directly through their own Square account. You don't handle tip payouts.</p>
            <a href="/dashboard/settings" className="inline-flex items-center gap-1.5 text-xs font-semibold text-od-green hover:underline">
              Change in Settings →
            </a>
          </div>
        ) : (
        <>
        {/* SUMMARY TILES */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'Total Tips', value: `$${totalAll.toFixed(2)}`, color: 'text-charcoal-900' },
            { label: 'Pending', value: `$${totalPending.toFixed(2)}`, color: 'text-od-green' },
            { label: 'Paid Out', value: `$${totalPaidOut.toFixed(2)}`, color: 'text-green-400' },
          ].map((s, i) => (
            <div key={i} className="bg-warm-100 border border-warm-200 rounded-xl p-4 text-center">
              <div className={`font-serif text-2xl mb-1 ${s.color}`}>{s.value}</div>
              <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500">{s.label}</div>
            </div>
          ))}
        </div>

        {/* BY BARBER */}
        {byBarber.length > 0 && (
          <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden mb-5">
            <div className="px-5 py-3 border-b border-warm-200 text-xs font-semibold tracking-widest uppercase text-charcoal-500">By Barber</div>
            <div className="divide-y divide-warm-200">
              {byBarber.map((b, i) => {
                const color = getBarberColor(b.barber.barber_id)
                return (
                  <div key={i} className="px-5 py-4 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center font-serif text-sm font-bold flex-shrink-0"
                      style={{ background: color + '22', border: `1.5px solid ${color}44`, color }}>
                      {(b.barber.barber_name || b.barber.alias || '?')[0].toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-charcoal-900">{b.barber.barber_name || b.barber.alias}</div>
                      <div className="text-xs text-charcoal-500 mt-0.5">{b.count} tips</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-mono font-semibold text-charcoal-900">${b.total.toFixed(2)}</div>
                      {b.pending > 0 && (
                        <div className="text-xs text-od-green mt-0.5">${b.pending.toFixed(2)} pending</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* FILTERS */}
        <div className="flex gap-3 flex-wrap mb-4">
          <select value={filterBarber} onChange={e => setFilterBarber(e.target.value)}
            className="bg-warm-100 border border-warm-200 rounded-lg px-3 py-2 text-sm text-charcoal-900 outline-none focus:border-od-green">
            <option value="">All Barbers</option>
            {barbers.filter(b => b.barber_id).map(b => (
              <option key={b.id} value={b.barber_id}>{b.barber_name || b.alias}</option>
            ))}
          </select>
          <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
            className="bg-warm-100 border border-warm-200 rounded-lg px-3 py-2 text-sm text-charcoal-900 outline-none focus:border-od-green">
            <option value="">All Time</option>
            {months.map(m => (
              <option key={m} value={m}>
                {new Date(m + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </option>
            ))}
          </select>
          {(filterBarber || filterMonth) && (
            <button onClick={() => { setFilterBarber(''); setFilterMonth('') }}
              className="px-3 py-2 bg-warm-200 border border-warm-300 rounded-lg text-xs text-charcoal-400 hover:text-charcoal-900 transition-colors">
              Clear
            </button>
          )}
        </div>

        {/* TIP LIST */}
        <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-warm-200 flex items-center justify-between">
            <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500">
              {filtered.length} tips
            </div>
            <div className="text-xs text-charcoal-500">Tap to mark paid out</div>
          </div>
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-charcoal-500 text-sm">No tips found.</div>
          ) : (
            <div className="divide-y divide-warm-200">
              {filtered.map(t => {
                const color = getBarberColor(t.barber_id)
                return (
                  <div key={t.id}
                    onClick={() => toggleCashout(t.id, t.cashed_out)}
                    className="px-5 py-4 flex items-center gap-3 cursor-pointer hover:bg-warm-200/30 transition-colors">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center font-serif text-xs font-bold flex-shrink-0"
                      style={{ background: color + '22', border: `1.5px solid ${color}44`, color }}>
                      {getBarberName(t.barber_id)[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-charcoal-900">{t.appointments?.client_name || 'Client'}</div>
                      <div className="text-xs text-charcoal-500 mt-0.5">
                        {getBarberName(t.barber_id)}
                        {t.appointments?.date ? ` · ${new Date(t.appointments.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
                        {t.appointments?.services?.name ? ` · ${t.appointments.services.name}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="font-mono text-sm font-semibold text-green-400">+${parseFloat(t.amount).toFixed(2)}</div>
                      <div className={`text-xs font-semibold px-2 py-1 rounded-full border ${
                        t.cashed_out
                          ? 'bg-green-500/10 text-green-500 border-green-500/20'
                          : 'bg-od-green/10 text-od-green border-od-green/20'
                      }`}>
                        {t.cashed_out ? 'Paid out' : 'Pending'}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        </>
        )}
      </div>
      <MobileNav />
    </div>
  )
}
