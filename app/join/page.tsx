'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function JoinPage() {
  const [mode, setMode] = useState<'loading'|'invite'|'code'|'success'|'error'>('loading')
  const [shop, setShop] = useState<any>(null)
  const [barber, setBarber] = useState<any>(null)
  const [invite, setInvite] = useState<any>(null)
  const [shopCode, setShopCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function init() {
      // Check for invite token in URL
      const params = new URLSearchParams(window.location.search)
      const token = params.get('token')

      if (token) {
        // Check new generic shop_invites first
        const { data: shopInvite } = await supabase
          .from('shop_invites')
          .select('*, shops(*)')
          .eq('token', token)
          .eq('used', false)
          .maybeSingle()

        if (shopInvite) {
          setInvite({ ...shopInvite, _type: 'shop_invite' })
          setShop(shopInvite.shops)
          setMode('invite')
          return
        }

        // Fall back to old per-slot invites
        const { data: invite } = await supabase
          .from('invites')
          .select('*, shops(*), shop_barbers(*)')
          .eq('token', token)
          .eq('accepted', false)
          .maybeSingle()

        if (!invite) { setMode('error'); return }
        setInvite(invite)
        setShop(invite.shops)
        setBarber(invite.shop_barbers)
        setMode('invite')
      } else {
        const code = params.get('code')
        if (code) setShopCode(code.toUpperCase())
        setMode('code')
      }
    }
    init()
  }, [])

  async function handleAcceptInvite() {
    setLoading(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push(`/signup?redirect=${encodeURIComponent(`/join?token=${invite.token}`)}`)
      return
    }

    if (invite._type === 'shop_invite') {
      // Generic shop invite — create a new shop_barbers row for this barber
      const { error: linkErr } = await supabase
        .from('shop_barbers')
        .insert({ shop_id: invite.shop_id, barber_id: user.id, active: true })

      if (linkErr) { setError(linkErr.message); setLoading(false); return }

      await supabase.from('shop_invites')
        .update({ used: true, used_by: user.id })
        .eq('id', invite.id)

      await supabase.from('profiles')
        .update({ role: 'barber', plan_type: 'shop', joined_via: 'invite_link' })
        .eq('id', user.id)

      setLoading(false)
      router.push('/dashboard/barber')
      return
    }

    // Per-slot invite (old invites table)
    const { error: linkErr } = await supabase
      .from('shop_barbers')
      .update({ barber_id: user.id, active: true })
      .eq('id', invite.shop_barber_id)

    if (linkErr) { setError(linkErr.message); setLoading(false); return }

    await supabase.from('invites')
      .update({ accepted: true, accepted_at: new Date().toISOString() })
      .eq('id', invite.id)

    await supabase.from('profiles')
      .update({ role: 'barber', plan_type: 'shop', joined_via: 'invite_link' })
      .eq('id', user.id)

    setLoading(false)
    router.push('/dashboard/barber')
  }

  async function handleGoSolo() {
    setLoading(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login?redirect=/join')
      return
    }

    await supabase.from('profiles')
      .update({ joined_via: 'solo' })
      .eq('id', user.id)

    const res = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: 'barber' }),
    })
    const data = await res.json()
    if (data.url) {
      window.location.href = data.url
    } else {
      setError(data.error || 'Failed to start checkout')
      setLoading(false)
    }
  }

  async function handleShopCode(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push(`/login?redirect=${encodeURIComponent('/join?code=' + shopCode.toUpperCase().trim())}`)
      return
    }

    // Find shop by 9-char shop_code or 6-char invite_code
    const code = shopCode.toUpperCase().trim()
    let { data: shop } = await supabase
      .from('shops').select('*').eq('shop_code', code).maybeSingle()
    if (!shop && code.length === 6) {
      const { data: byInvite } = await supabase
        .from('shops').select('*').eq('invite_code', code).maybeSingle()
      shop = byInvite
    }

    if (!shop) { setError('Shop code not found. Check the code and try again.'); setLoading(false); return }

    // Find an unlinked barber slot for this user
    const { data: existingLink } = await supabase
      .from('shop_barbers')
      .select('id')
      .eq('shop_id', shop.id)
      .eq('barber_id', user.id)
      .maybeSingle()

    if (existingLink) {
      await supabase.from('shop_barbers').update({ active: true }).eq('id', existingLink.id)
      await supabase.from('profiles').update({ role: 'barber', plan_type: 'shop', joined_via: 'shop_code' }).eq('id', user.id)
      setLoading(false)
      router.push('/dashboard/barber')
      return
    }

    // Find first unlinked barber slot
    const { data: unlinkedBarbers } = await supabase
      .from('shop_barbers')
      .select('*')
      .eq('shop_id', shop.id)
      .is('barber_id', null)
      .limit(1)

    if (!unlinkedBarbers || unlinkedBarbers.length === 0) {
      setError('No open barber slots found. Ask your owner to add you first.')
      setLoading(false)
      return
    }

    const slot = unlinkedBarbers[0]

    const { error: linkErr } = await supabase
      .from('shop_barbers')
      .update({ barber_id: user.id, active: true })
      .eq('id', slot.id)

    if (linkErr) { setError(linkErr.message); setLoading(false); return }

    await supabase.from('profiles')
      .update({ role: 'barber', plan_type: 'shop', joined_via: 'shop_code' })
      .eq('id', user.id)

    setLoading(false)
    router.push('/dashboard/barber')
  }

  if (mode === 'loading') return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center">
      <div className="text-od-green text-sm">Loading...</div>
    </div>
  )

  if (mode === 'error') return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <h1 className="font-serif text-3xl text-od-green mb-4">ChairOS</h1>
        <div className="bg-warm-100 border border-warm-200 rounded-xl p-8">
          <div className="text-red-400 text-sm mb-4">This invite link is invalid or has already been used.</div>
          <button onClick={() => setMode('code')}
            className="w-full bg-od-green hover:bg-od-green-light text-white font-semibold py-3 rounded-lg text-sm transition-colors">
            Enter Shop Code Instead
          </button>
        </div>
      </div>
    </div>
  )

  if (mode === 'success') return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <h1 className="font-serif text-3xl text-od-green mb-4">ChairOS</h1>
        <div className="bg-warm-100 border border-warm-200 rounded-xl p-8">
          <div className="w-14 h-14 bg-green-500/10 border border-green-500/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <h2 className="font-serif text-xl text-charcoal-900 mb-2">You're in.</h2>
          <p className="text-charcoal-400 text-sm mb-2">
            You've been linked to <span className="text-charcoal-900 font-medium">{shop?.name}</span>.
          </p>
          <p className="text-charcoal-500 text-xs mb-6">
            Your chair: <span className="text-charcoal-700">{barber?.barber_name || barber?.alias}</span>
          </p>
          <button onClick={() => router.push('/dashboard/barber')}
            className="w-full bg-od-green hover:bg-od-green-light text-white font-semibold py-3 rounded-lg text-sm transition-colors">
            Go to My Dashboard
          </button>
        </div>
      </div>
    </div>
  )

  if (mode === 'invite') return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="font-serif text-3xl text-od-green mb-1">ChairOS</h1>
          <p className="text-charcoal-400 text-sm">You've been invited</p>
        </div>
        <div className="bg-warm-100 border border-warm-200 rounded-xl p-8">
          {error && <p className="text-red-400 text-sm bg-red-950 border border-red-900 rounded-lg p-3 mb-4">{error}</p>}
          <div className="text-center mb-6">
            <div className="text-charcoal-400 text-sm mb-1">You've been invited to join</div>
            <div className="font-serif text-2xl text-charcoal-900 mb-1">{shop?.name}</div>
            <div className="text-charcoal-500 text-sm">{shop?.city}</div>
          </div>
          {barber && (
            <div className="bg-warm-200 rounded-lg p-4 mb-6">
              <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500 mb-1">Your Chair</div>
              <div className="text-charcoal-900 font-medium">{barber?.barber_name || barber?.alias}</div>
              <div className="text-xs text-charcoal-500 mt-1">
                {barber?.compensation_type === 'commission'
                  ? `${Math.round((barber?.commission_rate || 0.7) * 100)}% commission`
                  : `Booth rent $${barber?.booth_rent_amount}/wk`}
              </div>
            </div>
          )}
          <button onClick={handleAcceptInvite} disabled={loading}
            className="w-full bg-od-green hover:bg-od-green-light text-white font-semibold py-3 rounded-lg text-sm transition-colors disabled:opacity-50 mb-3">
            {loading ? 'Linking your account...' : 'Accept Invite'}
          </button>
          <p className="text-center text-charcoal-500 text-xs">
            You'll need to be signed in to accept. If you don't have an account you'll be directed to create one.
          </p>
        </div>
      </div>
    </div>
  )

  // mode === 'code'
  return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="font-serif text-3xl text-od-green mb-1">ChairOS</h1>
          <p className="text-charcoal-400 text-sm">Join your shop</p>
        </div>
        <form onSubmit={handleShopCode} className="bg-warm-100 border border-warm-200 rounded-xl p-8 space-y-4">
          {error && <p className="text-red-400 text-sm bg-red-950 border border-red-900 rounded-lg p-3">{error}</p>}
          <div>
            <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Shop Code</label>
            <input
              type="text"
              value={shopCode}
              onChange={e => setShopCode(e.target.value.toUpperCase())}
              placeholder="e.g. 3F31-5489 or ABC123"
              maxLength={9}
              className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors font-mono tracking-widest text-center text-lg"
            />
            <p className="text-charcoal-600 text-xs mt-2 text-center">Ask your shop owner for this code</p>
          </div>
          <button type="submit" disabled={loading || shopCode.length < 6}
            className="w-full bg-od-green hover:bg-od-green-light text-white font-semibold py-3 rounded-lg text-sm transition-colors disabled:opacity-50">
            {loading ? 'Searching...' : 'Find My Shop'}
          </button>
          <p className="text-center text-charcoal-500 text-xs">
            Have an invite link? Check your email and click it directly.
          </p>
          <div className="mt-4 pt-4 border-t border-warm-200 text-center">
            <p className="text-charcoal-500 text-xs mb-3">No shop code? Work independently.</p>
            <button
              type="button"
              onClick={handleGoSolo}
              disabled={loading}
              className="text-od-green text-sm font-semibold hover:underline disabled:opacity-50"
            >
              {loading ? 'Starting...' : 'Go Solo — $25/mo after free trial →'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}