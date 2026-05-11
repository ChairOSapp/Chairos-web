'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import MobileNav from '@/components/MobileNav'

export default function ClientsPage() {
  const [shop, setShop] = useState<any>(null)
  const [barbers, setBarbers] = useState<any[]>([])
  const [clientLocks, setClientLocks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'locked'|'atrisk'|'floating'>('locked')
  const [reassigning, setReassigning] = useState<string | null>(null)
  const [success, setSuccess] = useState('')
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
      .from('shop_barbers').select('*')
      .eq('shop_id', shop.id).eq('active', true)
    setBarbers(barbers || [])

    const { data: locks } = await supabase
      .from('client_locks')
      .select('*, clients(*)')
      .eq('shop_id', shop.id)
    setClientLocks(locks || [])

    setLoading(false)
  }

  async function reassignClient(lockId: string, newBarberId: string) {
    setReassigning(lockId)
    const barber = barbers.find(b => b.barber_id === newBarberId)
    if (!barber) { setReassigning(null); return }

    await supabase.from('client_locks').update({
      barber_id: newBarberId,
      updated_at: new Date().toISOString()
    }).eq('id', lockId)

    setSuccess('Client reassigned.')
    setTimeout(() => setSuccess(''), 3000)
    setReassigning(null)
    await loadData()
  }

  async function releaseClient(lockId: string) {
    if (!confirm('Release this client lock? They will become floating and available to any barber.')) return
    await supabase.from('client_locks').update({
      locked: false,
      updated_at: new Date().toISOString()
    }).eq('id', lockId)
    setSuccess('Client lock released.')
    setTimeout(() => setSuccess(''), 3000)
    await loadData()
  }

  if (loading) return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
      <div className="text-amber-500 text-sm">Loading...</div>
    </div>
  )

  const lockedClients = clientLocks.filter(l => l.locked)
  const atRiskClients = lockedClients.filter(l => {
    if (!l.last_booking_date) return false
    const daysSince = Math.floor((Date.now() - new Date(l.last_booking_date).getTime()) / (1000 * 60 * 60 * 24))
    return l.loyalty_protected ? daysSince > 300 : daysSince > 60
  })
  const floatingClients = clientLocks.filter(l => !l.locked)

  const displayClients = activeTab === 'locked' ? lockedClients
    : activeTab === 'atrisk' ? atRiskClients
    : floatingClients

  const COLORS = ['#b8861f','#4a7fb5','#3aab6e','#e07850','#9b6db5','#c06060']

  const getBarberColor = (barberId: string) => {
    const idx = barbers.findIndex(b => b.barber_id === barberId)
    return COLORS[idx % COLORS.length] || '#b8861f'
  }

  const getBarberName = (barberId: string) => {
    const b = barbers.find(b => b.barber_id === barberId)
    return b?.barber_name || b?.alias || 'Unknown'
  }

  return (
    <div className="min-h-screen bg-neutral-950">
      <header className="bg-neutral-900 border-b border-neutral-800 px-6 h-14 flex items-center justify-between sticky top-0 z-50">
        <span className="font-serif text-amber-500 text-lg">ChairOS</span>
        <button onClick={() => router.push('/dashboard')} className="text-xs text-neutral-500 hover:text-white transition-colors">← Dashboard</button>
      </header>

      <div className="p-6 max-w-3xl mx-auto pb-20 md:pb-6">
        <div className="mb-6">
          <h1 className="font-serif text-2xl text-white mb-1">Client Lock</h1>
          <p className="text-neutral-500 text-sm">{shop?.name} · Owner override enabled</p>
        </div>

        {success && <p className="text-green-400 text-sm bg-green-950 border border-green-900 rounded-lg p-3 mb-6">{success}</p>}

        {/* SUMMARY CARDS */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { key: 'locked', label: 'Locked', count: lockedClients.length, color: 'text-green-400', desc: 'Claimed by a barber' },
            { key: 'atrisk', label: 'At Risk', count: atRiskClients.length, color: 'text-amber-500', desc: 'Approaching lapse' },
            { key: 'floating', label: 'Floating', count: floatingClients.length, color: 'text-red-400', desc: 'Not assigned' },
          ].map(tab => (
            <button key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`bg-neutral-900 border rounded-xl p-4 text-center transition-all ${
                activeTab === tab.key ? 'border-amber-500/50' : 'border-neutral-800 hover:border-neutral-700'
              }`}>
              <div className={`font-serif text-3xl mb-1 ${tab.color}`}>{tab.count}</div>
              <div className="text-xs font-semibold tracking-widest uppercase text-neutral-400">{tab.label}</div>
              <div className="text-xs text-neutral-600 mt-1 hidden sm:block">{tab.desc}</div>
            </button>
          ))}
        </div>

        {/* CLIENT LIST */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between">
            <div>
              <div className="font-serif text-white capitalize">
                {activeTab === 'atrisk' ? 'At Risk' : activeTab} Clients
              </div>
              <div className="text-xs text-neutral-500 mt-0.5">
                {activeTab === 'locked' && 'Tap a client to reassign or release their lock'}
                {activeTab === 'atrisk' && 'These clients are approaching their lapse window — reach out'}
                {activeTab === 'floating' && 'These clients have no barber assigned — assign them to retain revenue'}
              </div>
            </div>
            <span className="text-xs font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-1 rounded-full">
              {displayClients.length} clients
            </span>
          </div>

          {displayClients.length === 0 ? (
            <div className="p-8 text-center text-neutral-500 text-sm">
              {activeTab === 'locked' && 'No locked clients yet. Clients lock after 2 completed appointments with the same barber.'}
              {activeTab === 'atrisk' && 'No at-risk clients. All locked clients are within their booking window.'}
              {activeTab === 'floating' && 'No floating clients. All clients are assigned to a barber.'}
            </div>
          ) : (
            <div className="divide-y divide-neutral-800">
              {displayClients.map((l) => {
                const daysSince = l.last_booking_date
                  ? Math.floor((Date.now() - new Date(l.last_booking_date).getTime()) / (1000 * 60 * 60 * 24))
                  : null

                return (
                  <div key={l.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center font-serif text-sm font-bold flex-shrink-0 bg-neutral-800 text-neutral-400">
                          {(l.clients?.full_name || l.clients?.phone || '?')[0].toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-white">
                            {l.clients?.full_name || 'Guest Client'}
                          </div>
                          <div className="text-xs text-neutral-500">{l.clients?.phone}</div>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-xs text-neutral-500">{l.booking_count} visits</div>
                        {daysSince !== null && (
                          <div className={`text-xs mt-0.5 ${daysSince > 60 ? 'text-amber-500' : 'text-neutral-600'}`}>
                            {daysSince}d since last visit
                          </div>
                        )}
                        {l.loyalty_protected && (
                          <div className="text-xs text-amber-500 mt-0.5">★ Loyalty protected</div>
                        )}
                      </div>
                    </div>

                    {l.locked && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className="w-5 h-5 rounded-full flex items-center justify-center font-serif text-xs font-bold flex-shrink-0"
                            style={{ background: getBarberColor(l.barber_id) + '33', color: getBarberColor(l.barber_id) }}>
                            {getBarberName(l.barber_id)[0]}
                          </div>
                          <span className="text-xs text-neutral-400 truncate">{getBarberName(l.barber_id)}</span>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <select
                            disabled={reassigning === l.id}
                            onChange={e => e.target.value && reassignClient(l.id, e.target.value)}
                            defaultValue=""
                            className="bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1.5 text-xs text-neutral-400 outline-none focus:border-amber-500">
                            <option value="" disabled>Reassign...</option>
                            {barbers.filter(b => b.barber_id && b.barber_id !== l.barber_id).map(b => (
                              <option key={b.id} value={b.barber_id}>{b.barber_name || b.alias}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => releaseClient(l.id)}
                            className="px-2 py-1.5 bg-neutral-800 border border-neutral-700 rounded-lg text-xs text-neutral-500 hover:border-red-500 hover:text-red-400 transition-colors">
                            Release
                          </button>
                        </div>
                      </div>
                    )}

                    {!l.locked && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-neutral-600">Assign to:</span>
                        <select
                          disabled={reassigning === l.id}
                          onChange={e => e.target.value && reassignClient(l.id, e.target.value)}
                          defaultValue=""
                          className="bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1.5 text-xs text-neutral-400 outline-none focus:border-amber-500">
                          <option value="" disabled>Select barber...</option>
                          {barbers.filter(b => b.barber_id).map(b => (
                            <option key={b.id} value={b.barber_id}>{b.barber_name || b.alias}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
      <MobileNav />
    </div>
  )
}
