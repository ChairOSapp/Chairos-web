'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

type Step = 'credentials' | 'role' | 'confirmed'

export default function Signup() {
  const [step, setStep] = useState<Step>('credentials')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<'owner' | 'barber' | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  function handleCredentialsSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStep('role')
  }

  async function handleRoleSubmit() {
    if (!role) return
    setLoading(true)
    setError('')

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name, role } },
    })

    if (signUpError) { setError(signUpError.message); setLoading(false); return }

    setStep('confirmed')
    setLoading(false)
  }

  if (step === 'confirmed') return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <h1 className="font-serif text-3xl text-amber-500 mb-4">ChairOS</h1>
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-8">
          <div className="w-14 h-14 bg-amber-500/10 border border-amber-500/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 className="font-serif text-xl text-white mb-2">Check your email</h2>
          <p className="text-neutral-400 text-sm mb-2">
            We sent a confirmation link to <span className="text-white">{email}</span>.
          </p>
          <p className="text-neutral-500 text-xs mb-6">
            {role === 'owner'
              ? "After confirming, sign in and we'll walk you through setting up your shop, then activate your subscription."
              : "After confirming, sign in and you'll be taken straight to choose your plan."}
          </p>
          <a
            href="/login"
            className="block w-full bg-amber-500 hover:bg-amber-400 text-black font-semibold py-3 rounded-lg text-sm text-center transition-colors"
          >
            Go to Sign In
          </a>
        </div>
      </div>
    </div>
  )

  if (step === 'role') return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="font-serif text-3xl text-amber-500 mb-1">ChairOS</h1>
          <p className="text-neutral-400 text-sm">One last thing</p>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-8">
          <h2 className="font-serif text-xl text-white mb-1">How will you use ChairOS?</h2>
          <p className="text-neutral-500 text-sm mb-6">This determines your plan and dashboard.</p>

          {error && <p className="text-red-400 text-sm bg-red-950 border border-red-900 rounded-lg p-3 mb-4">{error}</p>}

          <div className="space-y-3 mb-6">
            <button
              type="button"
              onClick={() => setRole('owner')}
              className={`w-full text-left p-4 rounded-xl border transition-colors ${
                role === 'owner'
                  ? 'bg-amber-500/10 border-amber-500/50'
                  : 'bg-neutral-800 border-neutral-700 hover:border-neutral-600'
              }`}
            >
              <div className={`font-semibold text-sm mb-0.5 ${role === 'owner' ? 'text-amber-500' : 'text-white'}`}>
                Shop Owner
              </div>
              <div className="text-xs text-neutral-500">
                I run a barbershop and manage a team — $99/mo after trial
              </div>
            </button>

            <button
              type="button"
              onClick={() => setRole('barber')}
              className={`w-full text-left p-4 rounded-xl border transition-colors ${
                role === 'barber'
                  ? 'bg-amber-500/10 border-amber-500/50'
                  : 'bg-neutral-800 border-neutral-700 hover:border-neutral-600'
              }`}
            >
              <div className={`font-semibold text-sm mb-0.5 ${role === 'barber' ? 'text-amber-500' : 'text-white'}`}>
                Independent Barber
              </div>
              <div className="text-xs text-neutral-500">
                I'm a solo barber managing my own clients and bookings — $25/mo after trial
              </div>
            </button>
          </div>

          <button
            onClick={handleRoleSubmit}
            disabled={!role || loading}
            className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold py-3 rounded-lg transition-colors text-sm"
          >
            {loading ? 'Creating account…' : 'Create Account'}
          </button>

          <button
            type="button"
            onClick={() => setStep('credentials')}
            className="w-full mt-3 text-xs text-neutral-600 hover:text-neutral-400 transition-colors"
          >
            ← Back
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="font-serif text-3xl text-amber-500 mb-1">ChairOS</h1>
          <p className="text-neutral-400 text-sm">Create your account</p>
        </div>
        <form onSubmit={handleCredentialsSubmit} className="bg-neutral-900 border border-neutral-800 rounded-xl p-8 space-y-4">
          <div>
            <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-2">Full Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-amber-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-amber-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-amber-500 transition-colors"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-amber-500 hover:bg-amber-400 text-black font-semibold py-3 rounded-lg transition-colors text-sm tracking-wide"
          >
            Continue →
          </button>
          <p className="text-center text-neutral-500 text-sm">
            Have an account?{' '}
            <Link href="/login" className="text-amber-500 hover:text-amber-400">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
