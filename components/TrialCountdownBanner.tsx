'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

const DISMISS_KEY = 'chairos:trialBannerDismissedAt'
const REDISPLAY_MS = 7 * 24 * 60 * 60 * 1000 // reappear ~7 days after dismissal
const PERSISTENT_DAYS_LEFT = 3 // final 3 days: always visible, not dismissible

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
  const [dismissed, setDismissed] = useState(false)

  // Show only when a payment method is on file and the subscription is actively trialing
  const trialing = !!stripeCustomerId && subscriptionStatus === 'trialing' && !!trialEnd
  const daysLeft = trialing
    ? Math.max(0, Math.ceil((new Date(trialEnd as string).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0
  const persistent = trialing && daysLeft > 0 && daysLeft <= PERSISTENT_DAYS_LEFT

  useEffect(() => {
    if (!trialing) return
    if (persistent) {
      setDismissed(false)
      return
    }
    try {
      const at = localStorage.getItem(DISMISS_KEY)
      setDismissed(!!at && Date.now() - Number(at) < REDISPLAY_MS)
    } catch {
      setDismissed(false)
    }
  }, [trialing, persistent, trialEnd])

  if (!trialing || daysLeft <= 0) return null
  if (dismissed && !persistent) return null

  const urgent = daysLeft <= 5

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {
      // storage unavailable -- banner just stays visible
    }
    setDismissed(true)
  }

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
      <div className="flex items-center gap-2 flex-shrink-0">
        {!persistent && (
          <button
            onClick={dismiss}
            aria-label="Dismiss trial reminder"
            className="text-xs opacity-60 hover:opacity-100 px-2 py-1.5 transition-opacity"
          >
            Dismiss
          </button>
        )}
        <button
          onClick={() => router.push('/subscribe')}
          className="bg-od-green hover:bg-od-green-light text-white font-semibold px-3 py-1.5 rounded-lg text-xs transition-colors"
        >
          Subscribe
        </button>
      </div>
    </div>
  )
}
