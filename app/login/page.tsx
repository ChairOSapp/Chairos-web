'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getBillingStatus } from '@/lib/billing'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  // If already signed in, route immediately
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (user) await routeUser(user.id)
    })
  }, [])

  async function routeUser(userId: string) {
    const params = new URLSearchParams(window.location.search)
    const redirect = params.get('redirect')
    // Only allow same-origin relative paths — a redirect param like
    // "https://evil.example" or "//evil.example" must never be honored,
    // or this becomes an open redirect for phishing off a trusted domain.
    if (redirect && redirect.startsWith('/') && !redirect.startsWith('//')) { router.push(redirect); return }

    const { data: prof } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()

    if (prof?.role === 'barber') {
      const { data: sb } = await supabase.from('shop_barbers').select('id').eq('barber_id', userId).eq('active', true).maybeSingle()
      if (sb) { router.push('/dashboard/chair'); return }
      // Solo barbers with an active subscription go straight to their dashboard
      const soloActive = prof?.plan_type === 'solo' &&
        (prof?.subscription_status === 'active' || prof?.subscription_status === 'trialing')
      router.push(soloActive ? '/dashboard/chair' : '/join')
      return
    }

    if (prof?.role === 'owner') {
      if (getBillingStatus(prof) === 'blocked') { router.push('/subscribe'); return }
      const { data: shops } = await supabase.from('shops').select('id').eq('owner_id', userId).limit(1)
      if (!shops?.length) { router.push('/onboarding'); return }
      if (!prof?.stripe_customer_id && !prof?.subscription_status) {
        router.push('/subscribe')
        return
      }
      router.push('/dashboard')
      return
    }

    router.push('/dashboard')
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false); return }
    if (data.user) await routeUser(data.user.id)
  }

  return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-serif text-od-green mb-1">ChairOS</h1>
          <p className="text-charcoal-400 text-sm">Sign in to your account</p>
        </div>
        <form onSubmit={handleLogin} className="bg-warm-100 border border-warm-200 rounded-xl p-8 space-y-4">
          {error && <p className="text-red-400 text-sm bg-red-950 border border-red-900 rounded-lg p-3">{error}</p>}
          <div>
            <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors" />
          </div>
          <div>
            <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors" />
          </div>
          <button type="submit" disabled={loading}
            className="w-full bg-od-green hover:bg-od-green-light text-white font-semibold py-3 rounded-lg transition-colors text-sm tracking-wide">
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
          <p className="text-center text-charcoal-500 text-sm">
            No account? <Link href="/signup" className="text-od-green hover:text-od-green-light">Create one</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
