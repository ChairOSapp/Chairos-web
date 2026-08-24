'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function ResetPassword() {
  const [status, setStatus] = useState<'checking' | 'ready' | 'invalid' | 'done'>('checking')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    // The reset-password link Supabase emails the user redirects here with a
    // recovery code in the URL; the browser client exchanges it for a
    // session automatically. We just need to wait for that to land before
    // showing the form, and treat "no session shows up" as an expired link.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setStatus('ready')
    })

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setStatus('ready')
    })

    const timeout = setTimeout(() => {
      setStatus(s => (s === 'checking' ? 'invalid' : s))
    }, 4000)

    return () => { sub.subscription.unsubscribe(); clearTimeout(timeout) }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) { setError(error.message); return }

    await supabase.auth.signOut()
    setStatus('done')
  }

  if (status === 'checking') return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-od-green border-t-transparent animate-spin" />
    </div>
  )

  if (status === 'invalid') return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <h1 className="text-3xl font-serif text-od-green mb-4">ChairOS</h1>
        <div className="bg-warm-100 border border-warm-200 rounded-xl p-8">
          <div className="text-red-400 text-sm mb-4">This reset link is invalid or has expired.</div>
          <Link href="/forgot-password"
            className="w-full inline-block bg-od-green hover:bg-od-green-light text-white font-semibold py-3 rounded-lg text-sm transition-colors">
            Request a new link
          </Link>
        </div>
      </div>
    </div>
  )

  if (status === 'done') return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <h1 className="text-3xl font-serif text-od-green mb-4">ChairOS</h1>
        <div className="bg-warm-100 border border-warm-200 rounded-xl p-8">
          <h2 className="font-serif text-xl text-charcoal-900 mb-2">Password updated</h2>
          <p className="text-charcoal-400 text-sm mb-6">Sign in with your new password.</p>
          <button onClick={() => router.push('/login')}
            className="w-full bg-od-green hover:bg-od-green-light text-white font-semibold py-3 rounded-lg text-sm transition-colors">
            Go to sign in
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-serif text-od-green mb-1">ChairOS</h1>
          <p className="text-charcoal-400 text-sm">Choose a new password</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-warm-100 border border-warm-200 rounded-xl p-8 space-y-4">
          {error && <p className="text-red-400 text-sm bg-red-950 border border-red-900 rounded-lg p-3">{error}</p>}
          <div>
            <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">New password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8}
              className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors" />
          </div>
          <div>
            <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Confirm password</label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required minLength={8}
              className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors" />
          </div>
          <button type="submit" disabled={loading}
            className="w-full bg-od-green hover:bg-od-green-light text-white font-semibold py-3 rounded-lg transition-colors text-sm tracking-wide disabled:opacity-60">
            {loading ? 'Updating...' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  )
}
