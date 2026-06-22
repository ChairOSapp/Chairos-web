'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import BarberMobileNav from '@/components/BarberMobileNav'

export default function BarberClientsPage() {
  const [profile, setProfile] = useState<any>(null)
  const [shopBarber, setShopBarber] = useState<any>(null)
  const [clientLocks, setClientLocks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'locked'|'atrisk'|'loyalty'>('locked')
  const [selectedClient, setSelectedClient] = useState<any>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: profile } = await supabase
      .from('profiles').select('*').eq('id', user.id).maybeSingle()
    setProfile(profile)

    const { data: shopBarber } = await supabase
      .from('shop_barbers').select('*, shops(*)')
      .eq('barber_id', user.id).eq('active', true).maybeSingle()
    if (!shopBarber) { router.push('/join'); return }
    setShopBarber(shopBarber)

    const { data: locks } = await supabase
      .from('client_locks')
      .select('id, locked, barber_id, shop_id, booking_count, first_booking_date, last_booking_date, loyalty_protected, updated_at, client_id, clients(id, full_name, phone, email, total_visits, last_visit_date)')
      .eq('barber_id', user.id)
    setClientLocks(locks || [])

    setLoading(false)
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
  const loyaltyClients = lockedClients.filter(l => l.loyalty_protected)

  const displayClients = activeTab === 'locked' ? lockedClients
    : activeTab === 'atrisk' ? atRiskClients
    : loyaltyClients

  const color = shopBarber?.color || '#b8861f'

  return (
    <div className="min-h-screen bg-warm-50">
      <header className="bg-warm-100 border-b border-warm-200 px-6 h-14 flex items-center justify-between sticky top-0 z-50">
        <span className="font-serif text-od-green text-lg">ChairOS</span>
        <button onClick={() => router.push('/dashboard/barber')} className="text-xs font-semibold px-3 py-1 rounded-full border border-od-green/40 text-od-green bg-od-green/10 hover:bg-od-green/20 transition-colors">← My Dashboard</button>
      </header>

      <div className="p-6 max-w-2xl mx-auto pb-24">
        <div className="mb-6">
          <h1 className="font-serif text-2xl text-charcoal-900 mb-1">My Clients</h1>
          <p className="text-charcoal-500 text-sm">{shopBarber?.shops?.name} · {lockedClients.length} locked clients</p>
        </div>

        {/* SUMMARY */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { key: 'locked', label: 'Locked', count: lockedClients.length, color: 'text-green-400' },
            { key: 'atrisk', label: 'At Risk', count: atRiskClients.length, color: 'text-od-green' },
            { key: 'loyalty', label: 'Loyalty', count: loyaltyClients.length, color: 'text-od-green' },
          ].map(tab => (
            <button key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`bg-warm-100 border rounded-xl p-4 text-center transition-all ${
                activeTab === tab.key ? 'border-od-green/50' : 'border-warm-200 hover:border-warm-300'
              }`}>
              <div className={`font-serif text-3xl mb-1 ${tab.color}`}>{tab.count}</div>
              <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400">{tab.label}</div>
            </button>
          ))}
        </div>

        {/* CLIENT LIST */}
        <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-warm-200">
            <div className="font-serif text-charcoal-900 capitalize">
              {activeTab === 'atrisk' ? 'At Risk' : activeTab} Clients
            </div>
            <div className="text-xs text-charcoal-500 mt-0.5">
              {activeTab === 'locked' && 'Clients who regularly book with you'}
              {activeTab === 'atrisk' && 'Reach out — these clients are close to their lapse window'}
              {activeTab === 'loyalty' && 'Your most loyal clients — 12+ months of consecutive bookings'}
            </div>
          </div>

          {displayClients.length === 0 ? (
            <div className="p-8 text-center text-charcoal-500 text-sm">
              {activeTab === 'locked' && 'No locked clients yet. Complete appointments to start building your client base.'}
              {activeTab === 'atrisk' && 'No at-risk clients right now.'}
              {activeTab === 'loyalty' && 'No loyalty clients yet. Keep booking clients consistently for 12+ months.'}
            </div>
          ) : (
            <div className="divide-y divide-warm-200">
              {displayClients.map((l) => {
                const daysSince = l.last_booking_date
                  ? Math.floor((Date.now() - new Date(l.last_booking_date).getTime()) / (1000 * 60 * 60 * 24))
                  : null

                return (
                  <div key={l.id} className="px-5 py-4 flex items-center gap-4 cursor-pointer hover:bg-warm-200/50 transition-colors" onClick={() => setSelectedClient(l)}>
                    <div className="w-10 h-10 rounded-full flex items-center justify-center font-serif text-sm font-bold flex-shrink-0"
                      style={{ background: color + '22', border: `2px solid ${color}`, color }}>
                      {(l.clients?.full_name || l.clients?.phone || 'G')[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-charcoal-900">
                        {l.clients?.full_name || l.client_name || 'Guest Client'}
                      </div>
                      <div className="text-xs text-charcoal-500">{l.clients?.phone || l.client_phone || ''}</div>
                      <div className="text-xs text-charcoal-600 mt-0.5">
                        {l.booking_count} visits
                        {l.first_booking_date && ` · since ${new Date(l.first_booking_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {l.loyalty_protected && (
                        <div className="text-xs text-od-green font-semibold mb-1">★ Loyalty</div>
                      )}
                      {daysSince !== null && (
                        <div className={`text-xs font-mono ${daysSince > 60 ? 'text-od-green' : 'text-charcoal-500'}`}>
                          {daysSince}d ago
                        </div>
                      )}
                      {l.last_booking_date && (
                        <div className="text-xs text-charcoal-600 mt-0.5">
                          {new Date(l.last_booking_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </div>
                      )}
                    </div>
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
              <button onClick={() => setSelectedClient(null)} className="text-charcoal-500 hover:text-charcoal-900 text-xl">×</button>
            </div>
            <div className="flex items-center gap-4 mb-5">
              <div className="w-14 h-14 rounded-full flex items-center justify-center font-serif text-2xl font-bold flex-shrink-0"
                style={{ background: color + '22', border: `2px solid ${color}`, color }}>
                {((selectedClient as any).clients?.full_name || 'G')[0].toUpperCase()}
              </div>
              <div>
                <div className="font-serif text-xl text-charcoal-900">{(selectedClient as any).clients?.full_name || 'Unknown'}</div>
                <div className="text-sm text-charcoal-500 mt-0.5">{(selectedClient as any).clients?.phone}</div>
              </div>
            </div>
            <div className="space-y-3 mb-5">
              {[
                { label: 'Total Visits', value: (selectedClient as any).clients?.total_visits || selectedClient.booking_count || 0 },
                { label: 'First Visit', value: selectedClient.first_booking_date ? new Date(selectedClient.first_booking_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—' },
                { label: 'Last Visit', value: selectedClient.last_booking_date ? new Date(selectedClient.last_booking_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—' },
                { label: 'Status', value: selectedClient.loyalty_protected ? '★ Loyalty Protected' : selectedClient.locked ? 'Locked' : 'Floating' },
              ].map((row, i) => (
                <div key={i} className="flex justify-between items-center py-2 border-b border-warm-200 last:border-0">
                  <span className="text-xs font-semibold tracking-widest uppercase text-charcoal-500">{row.label}</span>
                  <span className="text-sm text-charcoal-900">{String(row.value)}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              {(selectedClient as any).clients?.phone && (
                <a href={`tel:${(selectedClient as any).clients.phone}`}
                  className="flex-1 bg-warm-200 border border-warm-300 rounded-lg py-2.5 text-sm text-center text-charcoal-900 font-semibold hover:border-od-green transition-colors">
                  📞 Call
                </a>
              )}
              {(selectedClient as any).clients?.phone && (
                <a href={`sms:${(selectedClient as any).clients.phone}`}
                  className="flex-1 bg-od-green hover:bg-od-green-light rounded-lg py-2.5 text-sm text-center text-white font-semibold transition-colors">
                  💬 Text
                </a>
              )}
            </div>
          </div>
        </div>
      )}
      <BarberMobileNav />
    </div>
  )
}
