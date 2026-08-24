'use client'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const PLANS = [
  {
    id: 'owner' as const,
    name: 'Shop Owner',
    price: '$79',
    period: '/mo',
    description: 'Full shop management platform',
    features: [
      'Unlimited staff',
      'Client Lock™ retention system',
      'Appointment scheduling & history',
      'Earnings & tips tracking',
      'Booking portal for your shop',
      'SMS appointment confirmations',
      'Real-time floor dashboard',
    ],
  },
  {
    id: 'barber' as const,
    name: 'Solo Chair',
    price: '$25',
    period: '/mo',
    description: 'Everything you need as an independent professional',
    features: [
      'Personal booking portal',
      'Client lock & loyalty tracking',
      'Earnings dashboard',
      'SMS appointment confirmations',
      'Appointment history',
    ],
  },
]

export default function Subscribe() {
  const [loading, setLoading] = useState<'owner' | 'barber' | null>(null)
  const [error, setError] = useState('')
  const [authChecked, setAuthChecked] = useState(false)
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login?redirect=/subscribe')
        return
      }
      setAuthChecked(true)
    }
    checkAuth()
  }, [supabase, router])

  if (!authChecked) return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-od-green border-t-transparent animate-spin" />
    </div>
  )

  async function handleSelect(plan: 'owner' | 'barber') {
    setLoading(plan)
    setError('')
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to start checkout')
      window.location.href = data.url
    } catch (err: any) {
      setError(err.message)
      setLoading(null)
    }
  }

  return (
    <div className="min-h-screen bg-warm-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-3xl">
        <div className="text-center mb-10">
          <h1 className="font-serif text-3xl text-od-green mb-2">ChairOS</h1>
          <h2 className="font-serif text-2xl text-charcoal-900 mb-2">Choose your plan</h2>
          <p className="text-charcoal-400 text-sm">Start your 30-day free trial. Cancel anytime.</p>
        </div>

        {error && (
          <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg p-3 mb-6 text-center">
            {error}
          </p>
        )}

        <div className="grid md:grid-cols-2 gap-5">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className="bg-warm-100 border border-warm-200 rounded-2xl p-7 flex flex-col"
            >
              <div className="mb-5">
                <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500 mb-1">
                  {plan.name}
                </div>
                <div className="flex items-end gap-1 mb-1">
                  <span className="font-serif text-5xl text-charcoal-900">{plan.price}</span>
                  <span className="text-charcoal-500 text-sm mb-2">{plan.period}</span>
                </div>
                <p className="text-charcoal-400 text-sm">{plan.description}</p>
              </div>

              <ul className="space-y-2.5 mb-8 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-charcoal-700">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4B5320" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleSelect(plan.id)}
                disabled={loading !== null}
                className="w-full bg-od-green hover:bg-od-green-light disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl text-sm transition-colors"
              >
                {loading === plan.id ? 'Redirecting…' : 'Start free trial'}
              </button>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-charcoal-600 mt-6">
          Already have an account?{' '}
          <button onClick={() => router.push('/login')} className="text-od-green hover:text-od-green-light">
            Sign in
          </button>
        </p>
      </div>
    </div>
  )
}
