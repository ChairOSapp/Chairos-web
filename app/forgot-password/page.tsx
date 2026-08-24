'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import Turnstile from '@/components/Turnstile'

const CAPTCHA_ENABLED = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [captchaToken, setCaptchaToken] = useState('')
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
      captchaToken: captchaToken || undefined,
    })
    setLoading(false)
    // Always show the same success state regardless of whether the email
    // matched an account — confirming/denying an email's existence here
    // would let an attacker enumerate registered accounts.
    if (error) { setError(error.message) } else { setSent(true) }
  }

  if (sent) return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <h1 className="text-3xl font-serif text-od-green mb-4">ChairOS</h1>
        <div className="bg-warm-100 border border-warm-200 rounded-xl p-8">
          <h2 className="font-serif text-xl text-charcoal-900 mb-2">Check your email</h2>
          <p className="text-charcoal-400 text-sm mb-6">
            If an account exists for <span className="text-charcoal-900">{email}</span>, we've sent a link to reset your password.
          </p>
          <Link href="/login" className="text-od-green hover:text-od-green-light text-sm">
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-serif text-od-green mb-1">ChairOS</h1>
          <p className="text-charcoal-400 text-sm">Reset your password</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-warm-100 border border-warm-200 rounded-xl p-8 space-y-4">
          {error && <p className="text-red-400 text-sm bg-red-950 border border-red-900 rounded-lg p-3">{error}</p>}
          <div>
            <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors" />
          </div>
          {CAPTCHA_ENABLED && (
            <Turnstile onVerify={setCaptchaToken} onExpire={() => setCaptchaToken('')} />
          )}
          <button type="submit" disabled={loading || (CAPTCHA_ENABLED && !captchaToken)}
            className="w-full bg-od-green hover:bg-od-green-light text-white font-semibold py-3 rounded-lg transition-colors text-sm tracking-wide disabled:opacity-60">
            {loading ? 'Sending...' : 'Send reset link'}
          </button>
          <p className="text-center text-charcoal-500 text-sm">
            <Link href="/login" className="text-od-green hover:text-od-green-light">Back to sign in</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
