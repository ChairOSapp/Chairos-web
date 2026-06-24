'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import OwnerNav from '@/components/OwnerNav'
import MobileNav from '@/components/MobileNav'

export default function ClientLocksPage() {
  const [shop, setShop] = useState<any>(null)
  const [barbers, setBarbers] = useState<any[]>([])
  const [clientLocks, setClientLocks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'locked'|'atrisk'|'floating'>('locked')
  const [reassigning, setReassigning] = useState<string | null>(null)
  const [success, setSuccess] = useState('')
  const [selectedClient, setSelectedClient] = useState<any>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setUserId(user.id)

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
      .select('id, locked, barber_id, shop_id, booking_count, first_booking_date, last_booking_date, loyalty_protected, updated_at, client_id, clients(id, full_name, phone, email, total_visits, last_visit_date)')
      .eq('shop_id', shop.id)
    setClientLocks(locks || [])

    setLoading(false)
  }

  async function reassignClient(lockId: string, newBarberId: string) {
    setReassigning(lockId)
    const barber = barbers.find(b => b.barber_id === newBarberId)
    if (!barber) { setReassigning(null); return }

    const { error } = await supabase.from('client_locks').update({
      barber_id: newBarberId,
      locked: true,
      updated_at: new Date().toISOString()
    }).eq('id', lockId)

    if (error) {
      alert(`Failed to reassign: ${error.message}`)
      setReassigning(null)
      return
    }

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
    <div className="min-h-screen bg-warm-50 flex items-center justify-center">
      <div className="text-od-green text-sm">Loading...</div>
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

  const initials = shop?.name?.split(' ').map((w: string) => w[0]).join('').substring(0,2).toUpperCase() || 'CH'

  return (
    <div className="min-h-screen bg-warm-50">
      <OwnerNav shopName={shop?.name || ''} ownerName={''} initials={initials} userId={userId || undefined} />

      <div className="p-6 max-w-3xl mx-auto pb-20 md:pb-6">
        <div className="mb-6">
          <button onClick={() => router.push('/dashboard/clients')} className="text-xs text-charcoal-500 hover:text-od-green transition-colors mb-3 block">← Clients</button>
          <h1 className="font-serif text-2xl text-charcoal-900 mb-1">Client Locks</h1>
          <p className="text-charcoal-500 text-sm">{shop?.name} · Owner override enabled</p>
        </div>

        {success && <p className="text-green-400 text-sm bg-green-950 border border-green-900 rounded-lg p-3 mb-6">{success}</p>}

        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { key: 'locked', label: 'Locked', count: lockedClients.length, color: 'text-green-400', desc: 'Claimed by a barber' },
            { key: 'atrisk', label: 'At Risk', count: atRiskClients.length, color: 'text-od-green', desc: 'Approaching lapse' },
            { key: 'floating', label: 'Floating', count: floatingClients.length, color: 'text-red-400', desc: 'Not assigned' },
          ].map(tab => (
            <button key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`bg-warm-100 border rounded-xl p-4 text-center transition-all ${
                activeTab === tab.key ? 'border-od-green/50' : 'border-warm-200 hover:border-warm-300'
              }`}>
              <div className={`font-serif text-3xl mb-1 ${tab.color}`}>{tab.count}</div>
              <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400">{tab.label}</div>
              <div className="text-xs text-charcoal-600 mt-1 hidden sm:block">{tab.desc}</div>
            </button>
          ))}
        </div>

        <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-warm-200 flex items-center justify-between">
            <div>
              <div className="font-serif text-charcoal-900 capitalize">
                {activeTab === 'atrisk' ? 'At Risk' : activeTab} Clients
              </div>
              <div className="text-xs text-charcoal-500 mt-0.5">
                {activeTab === 'locked' && 'Tap a client to reassign or release their lock'}
                {activeTab === 'atrisk' && 'These clients are approaching their lapse window — reach out'}
                {activeTab === 'floating' && 'These clients have no barber assigned — assign them to retain revenue'}
              </div>
            </div>
            <span className="text-xs font-semibold bg-od-green/10 text-od-green border border-od-green/20 px-2 py-1 rounded-full">
              {displayClients.length} clients
            </span>
          </div>

          {displayClients.length === 0 ? (
            <div className="p-8 text-center text-charcoal-500 text-sm">
              {activeTab === 'locked' && 'No locked clients yet. Clients lock after 2 completed appointments with the same barber.'}
              {activeTab === 'atrisk' && 'No at-risk clients. All locked clients are within their booking window.'}
              {activeTab === 'floating' && 'No floating clients. All clients are assigned to a barber.'}
            </div>
          ) : (
            <div className="divide-y divide-warm-200">
              {displayClients.map((l) => {
                const daysSince = l.last_booking_date
                  ? Math.floor((Date.now() - new Date(l.last_booking_date).getTime()) / (1000 * 60 * 60 * 24))
                  : null

                return (
                  <div key={l.id} className="px-5 py-4 cursor-pointer hover:bg-warm-200/30 transition-colors" onClick={() => setSelectedClient(l)}>
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center font-serif text-sm font-bold flex-shrink-0 bg-warm-200 text-charcoal-400">
                          {(l.clients?.full_name || l.clients?.phone || 'G')[0].toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-charcoal-900">
                            {l.clients?.full_name || l.client_name || 'Guest Client'}
                          </div>
                          <div className="text-xs text-charcoal-500">{l.clients?.phone || l.client_phone || ''}</div>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-xs text-charcoal-500">{l.booking_count} visits</div>
                        {daysSince !== null && (
                          <div className={`text-xs mt-0.5 ${daysSince > 60 ? 'text-od-green' : 'text-charcoal-600'}`}>
                            {daysSince}d since last visit
                          </div>
                        )}
                        {l.loyalty_protected && (
                          <div className="text-xs text-od-green mt-0.5">★ Loyalty protected</div>
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
                          <span className="text-xs text-charcoal-400 truncate">{getBarberName(l.barber_id)}</span>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <select
                            disabled={reassigning === l.id}
                            onChange={e => e.target.value && reassignClient(l.id, e.target.value)}
                            defaultValue=""
                            className="bg-warm-200 border border-warm-300 rounded-lg px-2 py-1.5 text-xs text-charcoal-400 outline-none focus:border-od-green">
                            <option value="" disabled>Reassign...</option>
                            {barbers.filter(b => b.barber_id && b.barber_id !== l.barber_id).map(b => (
                              <option key={b.id} value={b.barber_id}>{b.barber_name || b.alias}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => releaseClient(l.id)}
                            className="px-2 py-1.5 bg-warm-200 border border-warm-300 rounded-lg text-xs text-charcoal-500 hover:border-red-500 hover:text-red-400 transition-colors">
                            Release
                          </button>
                        </div>
                      </div>
                    )}

                    {!l.locked && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-charcoal-600">Assign to:</span>
                        <select
                          disabled={reassigning === l.id}
                          onChange={e => e.target.value && reassignClient(l.id, e.target.value)}
                          defaultValue=""
                          className="bg-warm-200 border border-warm-300 rounded-lg px-2 py-1.5 text-xs text-charcoal-400 outline-none focus:border-od-green">
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

      {selectedClient && (
        <div className="fixed inset-0 bg-warm-50/80 z-50 flex items-end sm:items-center justify-center p-4 pb-24 sm:pb-4"
          onClick={() => setSelectedClient(null)}>
          <div className="bg-warm-100 border border-warm-200 rounded-2xl w-full max-w-md p-6 mb-20 md:mb-0"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div className="font-serif text-lg text-charcoal-900">Client Details</div>
              <button onClick={() => setSelectedClient(null)} className="text-charcoal-500 hover:text-charcoal-900 text-xl transition-colors">×</button>
            </div>
            <div className="flex items-center gap-4 mb-5">
              <div className="w-14 h-14 rounded-full flex items-center justify-center font-serif text-2xl font-bold flex-shrink-0 bg-warm-200 text-charcoal-400">
                {((selectedClient as any).clients?.full_name || 'G')[0].toUpperCase()}
              </div>
              <div>
                <div className="font-serif text-xl text-charcoal-900">{(selectedClient as any).clients?.full_name || 'Unknown'}</div>
                <div className="text-sm text-charcoal-500 mt-0.5">{(selectedClient as any).clients?.phone}</div>
              </div>
            </div>
            <div className="space-y-0 mb-5 bg-warm-200 rounded-xl overflow-hidden">
              {[
                { label: 'Total Visits', value: (selectedClient as any).clients?.total_visits || selectedClient.booking_count || 0 },
                { label: 'Barber', value: getBarberName(selectedClient.barber_id) },
                { label: 'First Visit', value: selectedClient.first_booking_date ? new Date(selectedClient.first_booking_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—' },
                { label: 'Last Visit', value: selectedClient.last_booking_date ? new Date(selectedClient.last_booking_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—' },
                { label: 'Status', value: selectedClient.loyalty_protected ? '★ Loyalty Protected' : selectedClient.locked ? 'Locked In' : 'Floating' },
              ].map((row, i, arr) => (
                <div key={i} className={`flex justify-between items-center px-4 py-3 ${i < arr.length - 1 ? 'border-b border-warm-300' : ''}`}>
                  <span className="text-xs font-semibold tracking-widest uppercase text-charcoal-500">{row.label}</span>
                  <span className="text-sm text-charcoal-900">{String(row.value)}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              {(selectedClient as any).clients?.phone && (
                <a href={`tel:${(selectedClient as any).clients.phone}`}
                  className="flex-1 bg-warm-200 border border-warm-300 rounded-xl py-3 text-sm text-center text-charcoal-900 font-semibold hover:border-od-green transition-colors">
                  📞 Call
                </a>
              )}
              {(selectedClient as any).clients?.phone && (
                <a href={`sms:${(selectedClient as any).clients.phone}`}
                  className="flex-1 bg-od-green hover:bg-od-green-light rounded-xl py-3 text-sm text-center text-white font-semibold transition-colors">
                  💬 Text
                </a>
              )}
            </div>
          </div>
        </div>
      )}
      <MobileNav />
    </div>
  )
}
