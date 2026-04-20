'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function Signup() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<'owner' | 'barber'>('owner')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) { setError(error.message); setLoading(false); return }

    if (data.user) {
      await supabase.from('profiles').insert({
        id: data.user.id,
        email,
        full_name: name,
        role
      })
    }

    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-serif text-amber-500 mb-1">ChairOS</h1>
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