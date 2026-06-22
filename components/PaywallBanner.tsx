'use client'
import { useRouter } from 'next/navigation'
import { daysUntil } from '@/lib/billing'

type Props = {
  subscriptionStatus: string | null | undefined
  subscriptionEndDate: string | null | undefined
}

export default function PaywallBanner({ subscriptionStatus, subscriptionEndDate }: Props) {
  const router = useRouter()

  if (!subscriptionStatus) return null
  if (!['past_due', 'cancelled', 'grace_period'].includes(subscriptionStatus)) return null

  const days = daysUntil(subscriptionEndDate)

  if (subscriptionStatus === 'grace_period') {
    return (
      <div className="flex items-start gap-4 bg-amber-950/40 border border-amber-700/50 rounded-xl px-4 py-3.5 mb-5">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-amber-300 mb-0.5">Your shop&apos;s ChairOS plan has ended</div>
          <div className="text-xs text-amber-400/80">
            {days > 0
              ? `You have ${days} day${days === 1 ? '' : 's'} to subscribe as a Solo Barber to keep your access.`
              : 'Your access has expired. Subscribe as a Solo Barber to continue.'}
          </div>
        </div>
        <button
          onClick={() => router.push('/subscribe')}
          className="flex-shrink-0 bg-amber-600 hover:bg-amber-500 text-white font-semibold px-3 py-1.5 rounded-lg text-xs transition-colors whitespace-nowrap"
        >
          Go Solo — $25/mo
        </button>
      </div>
    )
  }

  if (subscriptionStatus === 'past_due') {
    return (
      <div className="flex items-start gap-4 bg-red-950/40 border border-red-700/50 rounded-xl px-4 py-3.5 mb-5">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-red-300 mb-0.5">Payment failed</div>
          <div className="text-xs text-red-400/80">
            Update your payment method to avoid losing access. Stripe will retry automatically.
          </div>
        </div>
        <button
          onClick={() => router.push('/api/stripe/portal')}
          className="flex-shrink-0 bg-red-700 hover:bg-red-600 text-white font-semibold px-3 py-1.5 rounded-lg text-xs transition-colors whitespace-nowrap"
        >
          Update Card
        </button>
      </div>
    )
  }

  if (subscriptionStatus === 'cancelled') {
    return (
      <div className="flex items-start gap-4 bg-red-950/40 border border-red-700/50 rounded-xl px-4 py-3.5 mb-5">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-red-300 mb-0.5">Subscription cancelled</div>
          <div className="text-xs text-red-400/80">
            {days > 0
              ? `Access ends in ${days} day${days === 1 ? '' : 's'}. Renew to keep your data and dashboard.`
              : 'Your access has expired.'}
          </div>
        </div>
        <button
          onClick={() => router.push('/subscribe')}
          className="flex-shrink-0 bg-od-green hover:opacity-80 text-white font-semibold px-3 py-1.5 rounded-lg text-xs transition-colors whitespace-nowrap"
        >
          Renew Now
        </button>
      </div>
    )
  }

  return null
}
