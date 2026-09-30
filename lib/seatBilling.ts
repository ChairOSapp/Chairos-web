import Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSeatUsage, SEAT_CONFIG } from './shopMembers'
import { logger } from './logger'

function getStripe(): Stripe | null {
  if (!process.env.STRIPE_SECRET_KEY) return null
  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2026-05-27.dahlia' as any,
    maxNetworkRetries: 3,
  })
}

/**
 * Sync the extra admin/owner seat subscription item for a shop.
 *
 * Billing model (Bear, 2026-09-30): ONE invoice, itemized. Extra seats are
 * a subscription item on the primary owner's existing subscription;
 * Stripe prorates mid-cycle changes automatically, so the customer just
 * sees one clean invoice.
 *
 * - overage > 0: create the item (if missing) or update quantity = overage.
 * - overage = 0: delete the item (if present).
 *
 * Never throws -- logs and returns. Billing sync must not break seat
 * management, so callers fire-and-forget this.
 */
export async function syncSeatBilling(
  admin: SupabaseClient,
  shopId: string
): Promise<void> {
  try {
    const stripe = getStripe()
    if (!stripe) {
      logger.warn('[seatBilling] STRIPE_SECRET_KEY not set, skipping', { shopId })
      return
    }

    const { data: shop } = await admin
      .from('shops')
      .select('id, owner_id, plan_tier')
      .eq('id', shopId)
      .maybeSingle()
    if (!shop?.owner_id) {
      logger.warn('[seatBilling] shop has no primary owner, skipping', { shopId })
      return
    }

    const seats = await getSeatUsage(admin, shop)

    const { data: profile } = await admin
      .from('profiles')
      .select('stripe_subscription_id')
      .eq('id', shop.owner_id)
      .maybeSingle()
    const subscriptionId = profile?.stripe_subscription_id as string | undefined
    if (!subscriptionId) {
      // Not all shops have billing yet (trials, grandfathered, etc.).
      // Seats are still tracked; billing catches up when they subscribe.
      logger.info('[seatBilling] no Stripe subscription for owner, skipping', {
        shopId,
        overage: seats.overage,
      })
      return
    }

    // Source of truth: find the seat item by price id on the subscription.
    let existing: Stripe.SubscriptionItem | undefined
    try {
      const sub = await stripe.subscriptions.retrieve(subscriptionId)
      existing = sub.items.data.find((i) => i.price?.id === SEAT_CONFIG.stripeExtraSeatPriceId)
    } catch (err: any) {
      // Subscription gone (cancelled) or Stripe hiccup -- don't crash.
      logger.warn('[seatBilling] subscription retrieve failed', {
        shopId,
        subscriptionId,
        message: err?.message ?? String(err),
      })
      return
    }

    if (seats.overage > 0) {
      if (existing) {
        if (existing.quantity !== seats.overage) {
          await stripe.subscriptionItems.update(existing.id, {
            quantity: seats.overage,
            proration_behavior: 'create_prorations',
          })
          logger.info('[seatBilling] seat item quantity updated', {
            shopId,
            itemId: existing.id,
            quantity: seats.overage,
          })
        } else {
          logger.info('[seatBilling] seat item already correct', {
            shopId,
            itemId: existing.id,
            quantity: seats.overage,
          })
        }
      } else {
        const item = await stripe.subscriptionItems.create({
          subscription: subscriptionId,
          price: SEAT_CONFIG.stripeExtraSeatPriceId,
          quantity: seats.overage,
          proration_behavior: 'create_prorations',
          metadata: { kind: 'extra_admin_seat', shop_id: shopId },
        })
        logger.info('[seatBilling] seat item created', {
          shopId,
          itemId: item.id,
          quantity: seats.overage,
        })
      }
    } else if (existing) {
      // Back within included seats -- remove the item.
      try {
        await stripe.subscriptionItems.del(existing.id)
      } catch (err: any) {
        // Already gone -- treat as removed.
        logger.warn('[seatBilling] seat item del missed', { itemId: existing.id })
      }
      logger.info('[seatBilling] seat item removed', { shopId, itemId: existing.id })
    }
  } catch (err: any) {
    logger.warn('[seatBilling] sync failed', {
      shopId,
      message: err?.message ?? String(err),
    })
  }
}
