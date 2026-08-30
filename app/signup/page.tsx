'use client'
import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { track } from '@vercel/analytics'
import Link from 'next/link'
import Turnstile, { type TurnstileHandle } from '@/components/Turnstile'

type Step = 'credentials' | 'role' | 'confirmed'

// When unset, the widget renders nothing and no token is required --
// safe as long as Supabase's server-side CAPTCHA enforcement (a
// separate dashboard toggle) is only turned on once this is also set.
const CAPTCHA_ENABLED = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

export default function Signup() {
  const [step, setStep] = useState<Step>('credentials')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<'owner' | 'barber' | null>(null)
  const [smsConsent, setSmsConsent] = useState(false)
  const [captchaToken, setCaptchaToken] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const turnstileRef = useRef<TurnstileHandle>(null)
  const supabase = createClient()

  function handleCredentialsSubmit(e: React.FormEvent) {
    e.preventDefault()
    track('signup_started')
    setStep('role')
  }

  async function handleRoleSubmit() {
    if (!role) return
    setLoading(true)
    setError('')

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name, role }, captchaToken: captchaToken || undefined },
    })

    if (signUpError) {
      // Turnstile tokens are single-use -- force a fresh challenge before
      // the user can retry, or the retry reuses a consumed token and gets
      // rejected as "timeout-or-duplicate".
      setError(signUpError.message)
      setLoading(false)
      setCaptchaToken('')
      turnstileRef.current?.reset()
      return
    }

    track('signup_completed', { role })

    fetch('/api/email/welcome', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name, role }),
    }).catch(() => {})

    // Save SMS consent if given (profile row may not exist yet if email confirmation required)
    if (smsConsent && signUpData.user) {
      const consentNow = new Date().toISOString()
      await supabase.from('profiles').upsert({
        id: signUpData.user.id,
        sms_consent: true,
        sms_consent_at: consentNow,
      }, { onConflict: 'id', ignoreDuplicates: false })
    }

    setStep('confirmed')
    setLoading(false)
  }

  if (step === 'confirmed') return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <h1 className="font-serif text-3xl text-od-green mb-4">ChairOS</h1>
        <div className="bg-warm-100 border border-warm-200 rounded-xl p-8">
          <div className="w-14 h-14 bg-od-green/10 border border-od-green/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 className="font-serif text-xl text-charcoal-900 mb-2">Check your email</h2>
          <p className="text-charcoal-400 text-sm mb-2">
            We sent a confirmation link to <span className="text-charcoal-900">{email}</span>.
          </p>
          <p className="text-charcoal-500 text-xs mb-6">
            {role === 'owner'
              ? "After confirming, sign in and we'll walk you through setting up your shop, then activate your subscription."
              : "After confirming, sign in and you'll be taken straight to choose your plan."}
          </p>
          <a
            href="/login"
            className="block w-full bg-od-green hover:bg-od-green-light text-white font-semibold py-3 rounded-lg text-sm text-center transition-colors"
          >
            Go to Sign In
          </a>
        </div>
      </div>
    </div>
  )

  if (step === 'role') return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="font-serif text-3xl text-od-green mb-1">ChairOS</h1>
          <p className="text-charcoal-400 text-sm">One last thing</p>
        </div>
        <div className="bg-warm-100 border border-warm-200 rounded-xl p-8">
          <h2 className="font-serif text-xl text-charcoal-900 mb-1">How will you use ChairOS?</h2>
          <p className="text-charcoal-500 text-sm mb-6">This determines your plan and dashboard.</p>

          {error && <p className="text-red-400 text-sm bg-red-950 border border-red-900 rounded-lg p-3 mb-4">{error}</p>}

          <div className="space-y-3 mb-6">
            <button
              type="button"
              onClick={() => setRole('owner')}
              className={`w-full text-left p-4 rounded-xl border transition-colors ${
                role === 'owner'
                  ? 'bg-od-green/10 border-od-green/50'
                  : 'bg-warm-200 border-warm-300 hover:border-warm-400'
              }`}
            >
              <div className={`font-semibold text-sm mb-0.5 ${role === 'owner' ? 'text-od-green' : 'text-charcoal-900'}`}>
                Shop Owner
              </div>
              <div className="text-xs text-charcoal-500">
                I run a barbershop, salon, or tattoo studio and manage a team — $79/mo after trial
              </div>
            </button>

            <button
              type="button"
              onClick={() => setRole('barber')}
              className={`w-full text-left p-4 rounded-xl border transition-colors ${
                role === 'barber'
                  ? 'bg-od-green/10 border-od-green/50'
                  : 'bg-warm-200 border-warm-300 hover:border-warm-400'
              }`}
            >
              <div className={`font-semibold text-sm mb-0.5 ${role === 'barber' ? 'text-od-green' : 'text-charcoal-900'}`}>
                Independent Professional
              </div>
              <div className="text-xs text-charcoal-500">
                I work solo (barber, stylist, or artist) managing my own clients and bookings — $25/mo after trial
              </div>
            </button>
          </div>

          <label className="flex items-start gap-3 cursor-pointer mb-4">
            <input
              type="checkbox"
              checked={smsConsent}
              onChange={e => setSmsConsent(e.target.checked)}
              className="mt-0.5 w-4 h-4 flex-shrink-0 accent-od-green"
            />
            <span className="text-xs text-charcoal-500 leading-relaxed">
              Text me booking alerts and reminders (optional). Message & data rates may apply. Reply STOP to opt out. View our{' '}
              <a href="/privacy" className="underline hover:text-charcoal-300">Privacy Policy</a>.
            </span>
          </label>

          {CAPTCHA_ENABLED && (
            <div className="mb-4">
              <Turnstile ref={turnstileRef} onVerify={setCaptchaToken} onExpire={() => setCaptchaToken('')} />
            </div>
          )}

          <button
            onClick={handleRoleSubmit}
            disabled={!role || loading || (CAPTCHA_ENABLED && !captchaToken)}
            className="w-full bg-od-green hover:bg-od-green-light disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition-colors text-sm"
          >
            {loading ? 'Creating account…' : 'Create Account'}
          </button>

          <button
            type="button"
            onClick={() => setStep('credentials')}
            className="w-full mt-3 text-xs text-charcoal-600 hover:text-charcoal-400 transition-colors"
          >
            ← Back
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="font-serif text-3xl text-od-green mb-1">ChairOS</h1>
          <p className="text-charcoal-400 text-sm">Create your account</p>
        </div>
        <form onSubmit={handleCredentialsSubmit} className="bg-warm-100 border border-warm-200 rounded-xl p-8 space-y-4">
          <div>
            <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Full Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-od-green hover:bg-od-green-light text-white font-semibold py-3 rounded-lg transition-colors text-sm tracking-wide"
          >
            Continue →
          </button>
          <p className="text-center text-charcoal-500 text-sm">
            Have an account?{' '}
            <Link href="/login" className="text-od-green hover:text-od-green-light">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
