'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

export default function Signup() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<'owner' | 'barber'>('owner')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const supabase = createClient()

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name, role } }
    })

    if (signUpError) { setError(signUpError.message); setLoading(false); return }

    if (data.user) {
      const { error: profileError } = await supabase.from('profiles').upsert({
        id: data.user.id,
        email,
        full_name: name,
        role
      })
      if (profileError) { setError(profileError.message); setLoading(false); return }
    }

    setConfirmed(true)
    setLoading(false)
  }

  if (confirmed) return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <h1 className="font-serif text-3xl text-amber-500 mb-4">ChairOS</h1>
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-8">
          <div className="w-14 h-14 bg-amber-500/10 border border-amber-500/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <h2 className="font-serif text-xl text-white mb-2">Check your email</h2>
          <p className="text-neutral-400 text-sm mb-6">We sent a confirmation link to <span className="text-white">{email}</span>. Click it to activate your account then sign in.</p>
          <a href="/login" className="block w-full bg-amber-500 hover:bg-amber-400 text-black font-semibold py-3 rounded-lg text-sm text-center transition-colors">
            Go to Sign In
          </a>
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
        <form onSubmit={handleSignup} className="bg-neutral-900 border border-neutral-800 rounded-xl p-8 space-y-4">
          {error && <p className="text-red-400 text-sm bg-red-950 border border-red-900 rounded-lg p-3">{error}</p>}
          <div>
            <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-2">Full Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} required
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-amber-500 transition-colors" />
          </div>
          <div>
            <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-2">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-amber-500 transition-colors" />
          </div>
          <div>
            <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-2">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-amber-500 transition-colors" />
          </div>
          <div>
            <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-2">I am a</label>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setRole('owner')}
                className={`py-3 rounded-lg border text-sm font-semibold transition-colors ${role === 'owner' ? 'bg-amber-500 border-amber-500 text-black' : 'bg-neutral-800 border-neutral-700 text-neutral-400'}`}>
                Shop Owner
              </button>
              <button type="button" onClick={() => setRole('barber')}
                className={`py-3 rounded-lg border text-sm font-semibold transition-colors ${role === 'barber' ? 'bg-amber-500 border-amber-500 text-black' : 'bg-neutral-800 border-neutral-700 text-neutral-400'}`}>
                Barber
              </button>
            </div>
          </div>
          <button type="submit" disabled={loading}
            className="w-full bg-amber-500 hover:bg-amber-400 text-black font-semibold py-3 rounded-lg transition-colors text-sm tracking-wide">
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
          <p className="text-center text-neutral-500 text-sm">
            Have an account? <Link href="/login" className="text-amber-500 hover:text-amber-400">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  )
}