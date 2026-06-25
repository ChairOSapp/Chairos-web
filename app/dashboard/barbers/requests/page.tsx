'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import OwnerNav from '@/components/OwnerNav'
import MobileNav from '@/components/MobileNav'

const COLORS = ['#b8861f','#4a7fb5','#3aab6e','#e07850','#9b6db5','#c06060']

export default function BarberRequestsPage() {
  const [shop, setShop] = useState<any>(null)
  const [requests, setRequests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setUserId(user.id)

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile || profile.role !== 'owner') { router.push('/login'); return }

    const { data: shops } = await supabase
      .from('shops').select('*').eq('owner_id', user.id)
      .order('created_at', { ascending: true }).limit(1)
    const shopData = shops?.[0] || null
    if (!shopData) { router.push('/onboarding'); return }
    setShop(shopData)

    const { data: pending } = await supabase
      .from('pending_barbers')
      .select('*')
      .eq('shop_id', shopData.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    setRequests(pending || [])
    setLoading(false)
  }

  async function handleApprove(request: any) {
    setActionLoading(request.id)
    setError('')

    // Insert into shop_barbers
    const { error: barberErr } = await supabase
      .from('shop_barbers')
      .insert({
        shop_id: shop.id,
        barber_id: request.user_id,
        barber_name: request.name,
        alias: request.name,
        active: true,
        compensation_type: 'commission',
        commission_rate: 0.7,
        tip_split_rate: 1.0,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
      })

    if (barberErr) {
      setError(barberErr.message)
      setActionLoading(null)
      return
    }

    // Update profile role to barber
    await supabase.from('profiles').update({ role: 'barber' }).eq('id', request.user_id)

    // Update pending_barbers status
    await supabase.from('pending_barbers').update({ status: 'approved' }).eq('id', request.id)

    // Notify barber
    await supabase.from('notifications').insert({
      user_id: request.user_id,
      type: 'join_approved',
      message: 'You have been approved to join the shop!',
      read: false,
    })

    setSuccess(`${request.name} has been approved.`)
    setTimeout(() => setSuccess(''), 3000)
    setActionLoading(null)
    await loadData()
  }

  async function handleDeny(request: any) {
    setActionLoading(request.id)
    setError('')

    const { error: denyErr } = await supabase.from('pending_barbers').update({ status: 'denied' }).eq('id', request.id)
    if (denyErr) {
      setError(denyErr.message)
      setActionLoading(null)
      return
    }

    // Notify barber
    await supabase.from('notifications').insert({
      user_id: request.user_id,
      type: 'join_denied',
      message: 'Your request to join the shop was not approved.',
      read: false,
    })

    setSuccess(`${request.name}'s request was denied.`)
    setTimeout(() => setSuccess(''), 3000)
    setActionLoading(null)
    await loadData()
  }

  if (loading) return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center">
      <div className="text-od-green text-sm">Loading...</div>
    </div>
  )

  const initials = shop?.name?.split(' ').map((w: string) => w[0]).join('').substring(0,2).toUpperCase() || 'CH'

  return (
    <div className="min-h-screen bg-warm-50">
      <OwnerNav shopName={shop?.name} ownerName={''} initials={initials} userId={userId || undefined} />

      <div className="p-6 max-w-3xl mx-auto pb-20 md:pb-0">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-serif text-2xl text-charcoal-900 mb-1">Join Requests</h1>
            <p className="text-charcoal-500 text-sm">{shop?.name} · {requests.length} pending</p>
          </div>
          <button
            onClick={() => router.push('/dashboard/barbers')}
            className="text-sm text-charcoal-500 hover:text-charcoal-900 transition-colors">
            Back to Barbers
          </button>
        </div>

        {error && <p className="text-red-400 text-sm bg-red-950 border border-red-900 rounded-lg p-3 mb-6">{error}</p>}
        {success && <p className="text-green-400 text-sm bg-green-950 border border-green-900 rounded-lg p-3 mb-6">{success}</p>}

        <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden">
          {requests.length === 0 ? (
            <div className="p-8 text-center text-charcoal-500 text-sm">
              No pending join requests. When a barber enters your shop code, they'll appear here.
            </div>
          ) : (
            <div className="divide-y divide-warm-200">
              {requests.map((req, i) => (
                <div key={req.id} className="px-5 py-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center font-serif text-sm font-bold flex-shrink-0"
                      style={{
                        background: (COLORS[i % COLORS.length]) + '22',
                        border: `2px solid ${COLORS[i % COLORS.length]}`,
                        color: COLORS[i % COLORS.length],
                      }}>
                      {(req.name || '?')[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-charcoal-900">{req.name || 'Unknown'}</div>
                      <div className="text-xs text-charcoal-500 mt-0.5">
                        Requested{' '}
                        {new Date(req.created_at).toLocaleDateString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                    <div className="text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 bg-amber-500/10 text-amber-500">
                      Pending
                    </div>
                  </div>
                  <div className="flex gap-2 ml-13">
                    <button
                      onClick={() => handleApprove(req)}
                      disabled={actionLoading === req.id}
                      className="px-4 py-1.5 bg-od-green hover:bg-od-green-light text-white font-semibold rounded-lg text-xs transition-colors disabled:opacity-50">
                      {actionLoading === req.id ? 'Processing...' : 'Approve'}
                    </button>
                    <button
                      onClick={() => handleDeny(req)}
                      disabled={actionLoading === req.id}
                      className="px-4 py-1.5 bg-warm-200 border border-warm-300 rounded-lg text-xs text-charcoal-400 hover:border-red-500 hover:text-red-400 transition-colors disabled:opacity-50">
                      Deny
                    </button>
                  </div>
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
