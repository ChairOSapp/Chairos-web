'use client'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { track } from '@vercel/analytics'
import { createClient } from '@/lib/supabase'

const FAQ_ITEMS: { question: string; answer: string }[] = [
  {
    question: 'Does each staff member need their own subscription?',
    answer: 'No. One Shop Owner subscription covers your whole shop, however many staff you add.',
  },
  {
    question: 'Can I have booth renters and commission staff in the same shop?',
    answer: 'Yes. Each staff member is set up as commission or booth rent individually, so a shop can freely mix both at once.',
  },
  {
    question: 'Do my clients need to download an app?',
    answer: 'No. Clients book through a plain web page at your shop\'s own booking link, no app or account required on their end.',
  },
  {
    question: 'Can clients book online?',
    answer: 'Yes, that public booking page is how most appointments come in.',
  },
  {
    question: 'How does Client Lock work?',
    answer: 'From a client\'s second visit with the same staff member, Client Lock records that relationship under your shop, not that person\'s personal phone, so you always know which clients belong to which staff member.',
  },
  {
    question: 'Can staff see other staff members\' clients?',
    answer: 'No. A staff member\'s dashboard only shows the clients locked to them. Owners see the full shop-wide list.',
  },
  {
    question: 'Can I customize my booking page?',
    answer: 'Yes. Your logo, cover image, brand color, bio, and hours are all yours to set, and they show up on your real public booking page.',
  },
  {
    question: 'What happens to my information if I cancel?',
    answer: 'Cancelling stops billing and starts a 7-day grace period, then blocks dashboard access. Your shop\'s data is not deleted. A separate, explicit data-deletion request is reviewed by our team rather than processed automatically.',
  },
  {
    question: 'Do you process payments?',
    answer: 'Yes. Stripe handles your ChairOS subscription, and Square handles the payments your clients make for appointments and deposits.',
  },
]

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
  const [openFaq, setOpenFaq] = useState<number | null>(null)
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

  useEffect(() => {
    if (authChecked) track('pricing_view')
  }, [authChecked])

  function toggleFaq(i: number) {
    setOpenFaq(prev => {
      const next = prev === i ? null : i
      if (next !== null) track('faq_open', { question: FAQ_ITEMS[i].question })
      return next
    })
  }

  if (!authChecked) return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-od-green border-t-transparent animate-spin" />
    </div>
  )

  async function handleSelect(plan: 'owner' | 'barber') {
    track('pricing_cta_click', { plan })
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

              <ul className="space-y-2.5 mb-3 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-charcoal-700">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4B5320" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>

              {plan.id === 'owner' && (
                <p className="text-xs text-charcoal-500 mb-5">
                  Most shops run 5 to 10 staff. That's as little as $7.90 per staff, per month.
                </p>
              )}

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

        <div className="mt-14 max-w-xl mx-auto">
          <h3 className="font-serif text-lg text-charcoal-900 text-center mb-5">Questions</h3>
          <div className="space-y-2">
            {FAQ_ITEMS.map((item, i) => (
              <div key={item.question} className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => toggleFaq(i)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
                >
                  <span className="text-sm font-semibold text-charcoal-900">{item.question}</span>
                  <span className="text-charcoal-400 text-sm flex-shrink-0">{openFaq === i ? '−' : '+'}</span>
                </button>
                {openFaq === i && (
                  <p className="px-4 pb-4 text-sm text-charcoal-500 leading-relaxed">{item.answer}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
