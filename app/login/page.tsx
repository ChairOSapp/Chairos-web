'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getBillingStatus } from '@/lib/billing'
import { isAdminEmail } from '@/lib/admin'
import Turnstile, { type TurnstileHandle } from '@/components/Turnstile'

const CAPTCHA_ENABLED = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [captchaToken, setCaptchaToken] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const turnstileRef = useRef<TurnstileHandle>(null)
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

    // Founder allowlist — bypass shop-creation/subscribe routing entirely,
    // regardless of role or billing state. /admin itself doesn't check
    // billing either (see proxy.ts), so this is the only gate that matters.
    if (isAdminEmail(prof?.email)) { router.push('/admin'); return }

    if (prof?.role === 'barber') {
      const { data: sb } = await supabase.from('shop_barbers').select('id').eq('barber_id', userId).eq('active', true).maybeSingle()
      if (sb) { router.push('/dashboard/chair'); return }

      // No shop_barbers link yet. A genuine "join someone else's shop"
      // case always arrives here with an invite token or shop code still
      // attached to the redirect param (handled above), so reaching this
      // point with no redirect means either a brand-new Solo Chair
      // signup (send to onboarding) or one who finished onboarding but
      // hasn't been billed yet (send to subscribe) -- never /join, which
      // was a dead end for solo since it only offers "enter a shop code."
      const { data: ownShop } = await supabase.from('shops').select('id').eq('owner_id', userId).maybeSingle()
      if (!ownShop) { router.push('/onboarding'); return }
      if (getBillingStatus(prof) === 'blocked') { router.push('/subscribe'); return }
      router.push('/dashboard/chair')
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
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: { captchaToken: captchaToken || undefined },
    })
    if (error) {
      // Turnstile tokens are single-use -- the token was already consumed
      // by this attempt regardless of why login failed, so a retry with
      // the same token would be rejected as "timeout-or-duplicate". Force
      // a fresh challenge before the user can submit again.
      setError(error.message)
      setLoading(false)
      setCaptchaToken('')
      turnstileRef.current?.reset()
      return
    }
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
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400">Password</label>
              <Link href="/forgot-password" className="text-xs text-od-green hover:text-od-green-light">Forgot password?</Link>
            </div>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors" />
          </div>
          {CAPTCHA_ENABLED && (
            <Turnstile ref={turnstileRef} onVerify={setCaptchaToken} onExpire={() => setCaptchaToken('')} />
          )}
          <button type="submit" disabled={loading || (CAPTCHA_ENABLED && !captchaToken)}
            className="w-full bg-od-green hover:bg-od-green-light text-white font-semibold py-3 rounded-lg transition-colors text-sm tracking-wide disabled:opacity-50 disabled:cursor-not-allowed">
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
