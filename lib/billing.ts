import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

export type BillingStatus = 'active' | 'trial' | 'grace' | 'expired' | 'blocked'

export type BillingProfile = {
  subscription_status?: string | null
  subscription_end_date?: string | null
  stripe_customer_id?: string | null
  stripe_subscription_id?: string | null
  trial_end?: string | null
} | null

export function getBillingStatus(profile: BillingProfile): BillingStatus {
  if (!profile) return 'blocked'

  const { subscription_status, subscription_end_date, stripe_customer_id, stripe_subscription_id, trial_end } = profile

  if (subscription_status === 'active') return 'active'

  if (subscription_status === 'trialing' || !subscription_status) {
    // Trials never expire on their own here — the window is the platform's
    // own `trial_end` column, which the old code never read. A trialing
    // profile whose trial ended with no Stripe subscription backing it is
    // expired, not active/trial.
    const trialExpired = !!trial_end && new Date(trial_end).getTime() < Date.now()
    if (trialExpired && !stripe_subscription_id) return 'expired'

    // Shop barber on owner's plan — no Stripe subscription of their own.
    // Only reached for still-valid trials (see above); proxy.ts enforces
    // the same trial_end gate server-side for page traffic.
    if (!stripe_customer_id) return 'active'

    return 'trial'
  }

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

/** True for statuses that must be routed to /subscribe: blocked or expired. */
export function isBillingBlocked(status: BillingStatus): boolean {
  return status === 'blocked' || status === 'expired'
}

export function daysUntil(dateStr: string | null | undefined): number {
  if (!dateStr) return 0
  return Math.max(0, Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
}

/**
 * Server-side spend gate for owner-initiated, cost-bearing API routes
 * (campaign blasts, ad-hoc SMS, ...). Returns null when the account may
 * spend, or a 402 JSON response the UI can turn into an upsell.
 *
 * Allowed: 'active', 'trial' (still inside trial_end), 'grace'
 * (past_due/unpaid/paused or inside a cancel grace window — these accounts
 * keep full dashboard access everywhere else, e.g. proxy.ts issues a
 * paywall header rather than a redirect, so blocking spend here alone
 * would be incoherent).
 * Blocked: 'expired' (trial lapsed, no Stripe subscription) and 'blocked'.
 */
export async function requireActiveBilling(
  supabase: SupabaseClient,
  userId: string
): Promise<NextResponse | null> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('subscription_status, subscription_end_date, stripe_customer_id, stripe_subscription_id, trial_end')
    .eq('id', userId)
    .maybeSingle()

  const status = getBillingStatus(profile)
  if (status === 'active' || status === 'trial' || status === 'grace') return null

  return NextResponse.json(
    { error: 'billing_expired', billing_status: status },
    { status: 402 }
  )
}
