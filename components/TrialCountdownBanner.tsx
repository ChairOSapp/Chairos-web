'use client'
import { useRouter } from 'next/navigation'

export default function TrialCountdownBanner({
  subscriptionStatus,
  trialEnd,
  stripeCustomerId,
}: {
  subscriptionStatus: string | null
  trialEnd: string | null
  stripeCustomerId?: string | null
}) {
  const router = useRouter()

  // Already subscribed (card on file) — trial is running, auto-charges when it ends
  if (stripeCustomerId) return null
  if (subscriptionStatus !== 'trialing' || !trialEnd) return null

  const daysLeft = Math.max(
    0,
    Math.ceil((new Date(trialEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  )

  if (daysLeft <= 0) return null

  const urgent = daysLeft <= 5

  return (
    <div className={`flex items-center justify-between gap-4 rounded-xl px-4 py-3 mb-5 border text-sm ${
      urgent
        ? 'bg-red-950/60 border-red-800/60 text-red-300'
        : 'bg-od-green/10 border-od-green/20 text-od-green-light'
    }`}>
      <div className="flex items-center gap-2.5">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <span>
          <span className="font-semibold">{daysLeft} {daysLeft === 1 ? 'day' : 'days'} left</span> in your free trial
          {urgent && ' — subscribe now to avoid losing access'}
        </span>
      </div>
      <button
        onClick={() => router.push('/subscribe')}
        className="flex-shrink-0 bg-od-green hover:bg-od-green-light text-white font-semibold px-3 py-1.5 rounded-lg text-xs transition-colors"
      >
        Subscribe
      </button>
    </div>
  )
}
