export type BillingStatus = 'active' | 'trial' | 'grace' | 'blocked'

export function getBillingStatus(profile: {
  subscription_status?: string | null
  subscription_end_date?: string | null
  stripe_customer_id?: string | null
} | null): BillingStatus {
  if (!profile) return 'blocked'

  const { subscription_status, subscription_end_date, stripe_customer_id } = profile

  // Shop barber on owner's plan — no Stripe subscription of their own
  if (!stripe_customer_id && (subscription_status === 'trialing' || !subscription_status)) {
    return 'active'
  }

  if (subscription_status === 'active') return 'active'
  if (subscription_status === 'trialing') return 'trial'

  // Shop barber whose owner cancelled — webhook sets this
  if (subscription_status === 'grace_period') {
    const expired = !subscription_end_date || new Date(subscription_end_date) < new Date()
    return expired ? 'blocked' : 'grace'
  }

  // Payment failed, Stripe is retrying — give access during retry window
  if (subscription_status === 'past_due') return 'grace'
  if (subscription_status === 'unpaid') return 'grace'
  if (subscription_status === 'paused') return 'grace'

  if (subscription_status === 'cancelled') {
    const expired = !subscription_end_date || new Date(subscription_end_date) < new Date()
    return expired ? 'blocked' : 'grace'
  }

  // Stripe incomplete states — never grant active access
  if (subscription_status === 'incomplete') return 'grace'
  if (subscription_status === 'incomplete_expired') return 'blocked'

  return 'blocked'
}

export function daysUntil(dateStr: string | null | undefined): number {
  if (!dateStr) return 0
  return Math.max(0, Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
}
