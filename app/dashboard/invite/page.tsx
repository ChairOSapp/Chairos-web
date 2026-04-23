'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function InviteBarber() {
  const [shop, setShop] = useState<any>(null)
  const [barbers, setBarbers] = useState<any[]>([])
  const [email, setEmail] = useState('')
  const [selectedBarber, setSelectedBarber] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

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
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
      <div className="text-amber-500 text-sm">Loading...</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-neutral-950">
      <header className="bg-neutral-900 border-b border-neutral-800 px-6 h-14 flex items-center justify-between sticky top-0 z-10">
        <span className="font-serif text-amber-500 text-lg">ChairOS</span>
        <button onClick={() => router.push('/dashboard')}
          className="text-xs text-neutral-500 hover:text-white transition-colors flex items-center gap-2">
          ← Back to Dashboard
        </button>
      </header>

      <div className="p-6 max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="font-serif text-2xl text-white mb-1">Invite a Barber</h1>
          <p className="text-neutral-500 text-sm">Send an invite or share your shop code so barbers can claim their account.</p>
        </div>

        {/* SHOP CODE CARD */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 mb-6">
          <div className="text-xs font-semibold tracking-widest uppercase text-neutral-500 mb-3">Option A — Share Shop Code</div>
          <div className="flex items-center gap-4">
            <div className="font-mono text-3xl font-bold text-amber-500 tracking-widest">{shop?.shop_code}</div>
            <button
              onClick={() => navigator.clipboard.writeText(shop?.shop_code)}
              className="px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-xs text-neutral-400 hover:border-amber-500 hover:text-amber-500 transition-colors">
              Copy Code
            </button>
          </div>
          <p className="text-neutral-500 text-xs mt-3">
            Barber downloads ChairOS, signs up, and enters this code to link to your shop.
          </p>
        </div>

        {/* EMAIL INVITE CARD */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 mb-6">
          <div className="text-xs font-semibold tracking-widest uppercase text-neutral-500 mb-4">Option B — Send Email Invite</div>

          {barbers.length === 0 ? (
            <div className="text-neutral-500 text-sm text-center py-4">
              All barbers are already linked. Add more barbers in{' '}
              <button onClick={() => router.push('/dashboard/barbers')} className="text-amber-500 hover:underline">
                Manage Barbers
              </button>.
            </div>
          ) : (
            <form onSubmit={handleInvite} className="space-y-4">
              {error && <p className="text-red-400 text-sm bg-red-950 border border-red-900 rounded-lg p-3">{error}</p>}

              <div>
                <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-2">Select Barber</label>
                <select value={selectedBarber} onChange={e => setSelectedBarber(e.target.value)}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-amber-500 transition-colors">
                  <option value="">Choose a barber...</option>
                  {barbers.map(b => (
                    <option key={b.id} value={b.id}>{b.barber_name || b.alias}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-2">Barber's Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="barber@email.com"
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-amber-500 transition-colors" />
              </div>

              <button type="submit" disabled={sending}
                className="w-full bg-amber-500 hover:bg-amber-400 text-black font-semibold py-3 rounded-lg text-sm transition-colors disabled:opacity-50">
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
            <p className="text-neutral-500 text-xs mt-3">
              Note: Automated email delivery will be active once Twilio is connected. For now share the link manually.
            </p>
          </div>
        )}

        {/* PENDING INVITES */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden mt-6">
          <div className="px-5 py-4 border-b border-neutral-800">
            <div className="font-serif text-white">Pending Barbers</div>
            <div className="text-xs text-neutral-500 mt-0.5">Barbers not yet linked to an account</div>
          </div>
          {barbers.length === 0 ? (
            <div className="p-5 text-center text-neutral-500 text-sm">All barbers have claimed their accounts.</div>
          ) : (
            <div className="divide-y divide-neutral-800">
              {barbers.map((b) => (
                <div key={b.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-white">{b.barber_name || b.alias}</div>
                    <div className="text-xs text-neutral-500">
                      {b.compensation_type === 'commission'
                        ? `${Math.round((b.commission_rate || 0.7) * 100)}% commission`
                        : `Booth rent $${b.booth_rent_amount}/wk`}
                    </div>
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-500">
                    Pending
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}