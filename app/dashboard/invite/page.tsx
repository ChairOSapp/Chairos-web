'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import OwnerNav from '@/components/OwnerNav'
import MobileNav from '@/components/MobileNav'

export default function InviteBarber() {
  const [shop, setShop] = useState<any>(null)
  const [barbers, setBarbers] = useState<any[]>([])
  const [email, setEmail] = useState('')
  const [selectedBarber, setSelectedBarber] = useState('')
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUserId(user.id)

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
        .is('barber_id', null)
      setBarbers(barbers || [])
      setLoading(false)
    }
    load()
  }, [])

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !selectedBarber) { setError('Select a barber and enter their email'); return }
    setSending(true)
    setError('')
    setSuccess('')

    const token = crypto.randomUUID()

    const { error: inviteErr } = await supabase.from('invites').insert({
      shop_id: shop.id,
      shop_barber_id: selectedBarber,
      email,
      token
    })

    if (inviteErr) { setError(inviteErr.message); setSending(false); return }

    // In production this triggers an email via Twilio/Resend
    // For now we show the invite link directly
    setSuccess(`Invite created. Share this link with ${email}:\n\nchairos.cc/join?token=${token}`)
    setEmail('')
    setSelectedBarber('')
    setSending(false)
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

      <div className="p-6 max-w-2xl mx-auto pb-20 md:pb-0">
        <div className="mb-8">
          <h1 className="font-serif text-2xl text-charcoal-900 mb-1">Invite a Barber</h1>
          <p className="text-charcoal-500 text-sm">Send an invite or share your shop code so barbers can claim their account.</p>
        </div>

        {/* SHOP CODE CARD */}
        <div className="bg-warm-100 border border-warm-200 rounded-xl p-6 mb-6">
          <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500 mb-3">Option A — Share Shop Code</div>
          <div className="flex items-center gap-4">
            <div className="font-mono text-3xl font-bold text-od-green tracking-widest">{shop?.shop_code}</div>
            <button
              onClick={() => navigator.clipboard.writeText(shop?.shop_code)}
              className="px-4 py-2 bg-warm-200 border border-warm-300 rounded-lg text-xs text-charcoal-400 hover:border-od-green hover:text-od-green transition-colors">
              Copy Code
            </button>
          </div>
          <p className="text-charcoal-500 text-xs mt-3">
            Barber downloads ChairOS, signs up, and enters this code to link to your shop.
          </p>
        </div>

        {/* EMAIL INVITE CARD */}
        <div className="bg-warm-100 border border-warm-200 rounded-xl p-6 mb-6">
          <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500 mb-4">Option B — Send Email Invite</div>

          {barbers.length === 0 ? (
            <div className="text-charcoal-500 text-sm text-center py-4">
              All barbers are already linked. Add more barbers in{' '}
              <button onClick={() => router.push('/dashboard/barbers')} className="text-od-green hover:underline">
                Manage Barbers
              </button>.
            </div>
          ) : (
            <form onSubmit={handleInvite} className="space-y-4">
              {error && <p className="text-red-400 text-sm bg-red-950 border border-red-900 rounded-lg p-3">{error}</p>}

              <div>
                <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Select Barber</label>
                <select value={selectedBarber} onChange={e => setSelectedBarber(e.target.value)}
                  className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors">
                  <option value="">Choose a barber...</option>
                  {barbers.map(b => (
                    <option key={b.id} value={b.id}>{b.barber_name || b.alias}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Barber's Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="barber@email.com"
                  className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors" />
              </div>

              <button type="submit" disabled={sending}
                className="w-full bg-od-green hover:bg-od-green-light text-white font-semibold py-3 rounded-lg text-sm transition-colors disabled:opacity-50">
                {sending ? 'Sending...' : 'Send Invite'}
              </button>
            </form>
          )}
        </div>

        {/* SUCCESS */}
        {success && (
          <div className="bg-green-950 border border-green-900 rounded-xl p-5">
            <div className="text-xs font-semibold tracking-widest uppercase text-green-500 mb-2">Invite Created</div>
            <pre className="text-green-400 text-xs whitespace-pre-wrap break-all">{success}</pre>
            <p className="text-charcoal-500 text-xs mt-3">
              Note: Automated email delivery will be active once Twilio is connected. For now share the link manually.
            </p>
          </div>
        )}

        {/* PENDING INVITES */}
        <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden mt-6">
          <div className="px-5 py-4 border-b border-warm-200">
            <div className="font-serif text-charcoal-900">Pending Barbers</div>
            <div className="text-xs text-charcoal-500 mt-0.5">Barbers not yet linked to an account</div>
          </div>
          {barbers.length === 0 ? (
            <div className="p-5 text-center text-charcoal-500 text-sm">All barbers have claimed their accounts.</div>
          ) : (
            <div className="divide-y divide-warm-200">
              {barbers.map((b) => (
                <div key={b.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-charcoal-900">{b.barber_name || b.alias}</div>
                    <div className="text-xs text-charcoal-500">
                      {b.compensation_type === 'commission'
                        ? `${Math.round((b.commission_rate || 0.7) * 100)}% commission`
                        : `Booth rent $${b.booth_rent_amount}/wk`}
                    </div>
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-warm-200 text-charcoal-500">
                    Pending
                  </span>
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