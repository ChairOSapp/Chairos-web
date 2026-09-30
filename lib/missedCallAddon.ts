import twilio from 'twilio'
import { logger } from '@/lib/logger'

/**
 * Platform-owned missed-call text-back add-on ($10/mo).
 *
 * The add-on is a Stripe subscription ITEM on the owner's existing
 * subscription (one bill, prorated by Stripe). The Stripe webhook is the
 * source of truth for `shops.missed_call_addon_active`; these helpers keep
 * the Twilio number lifecycle in step with it.
 */

/** Stripe Price ID for the add-on. Bear creates this in the Stripe dashboard. */
export function missedCallAddonPriceId(): string | null {
  return process.env.STRIPE_MISSED_CALL_PRICE_ID || null
}

function twilioClient() {
  return twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
}

/** Release a platform-owned Twilio number back to Twilio. Idempotent. */
export async function releaseTwilioNumber(phoneNumber: string): Promise<void> {
  try {
    const client = twilioClient()
    const owned = await client.incomingPhoneNumbers.list({ phoneNumber })
    for (const n of owned) {
      await client.incomingPhoneNumbers(n.sid).remove()
    }
    logger.info('missed_call_number_released', { phoneNumber, count: owned.length })
  } catch (err) {
    logger.error('missed_call_number_release_failed', {
      phoneNumber,
      message: err instanceof Error ? err.message : String(err),
    })
  }
}

type Supa = any

/**
 * Bring a shop's add-on flag in line with Stripe. When turning OFF, the
 * platform Twilio number is released (real monthly cost — don't park it)
 * and the columns are cleared. Re-enabling later provisions a fresh number.
 */
export async function setAddonActive(
  supabase: Supa,
  shopId: string,
  active: boolean
): Promise<void> {
  if (active) {
    const { error } = await supabase
      .from('shops')
      .update({ missed_call_addon_active: true })
      .eq('id', shopId)
    if (error) logger.error('missed_call_addon_activate_failed', { shopId, message: error.message })
    return
  }

  const { data: shop } = await supabase
    .from('shops')
    .select('missed_call_number')
    .eq('id', shopId)
    .maybeSingle()

  const { error } = await supabase
    .from('shops')
    .update({
      missed_call_addon_active: false,
      missed_call_textback_enabled: false,
      missed_call_number: null,
      missed_call_stripe_item_id: null,
    })
    .eq('id', shopId)
  if (error) logger.error('missed_call_addon_deactivate_failed', { shopId, message: error.message })

  if (shop?.missed_call_number) {
    await releaseTwilioNumber(shop.missed_call_number)
  }
}

/**
 * Sync every shop owned by a Stripe customer to whether their subscription
 * currently carries the add-on price. Called from the Stripe webhook on
 * customer.subscription.updated and customer.subscription.deleted.
 */
export async function syncAddonForCustomer(
  supabase: Supa,
  stripeCustomerId: string,
  hasAddon: boolean
): Promise<void> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', stripeCustomerId)
    .maybeSingle()
  if (!profile) return

  const { data: shops } = await supabase
    .from('shops')
    .select('id, missed_call_addon_active')
    .eq('owner_id', profile.id)
  for (const shop of shops || []) {
    if (hasAddon && !shop.missed_call_addon_active) {
      await setAddonActive(supabase, shop.id, true)
    } else if (!hasAddon && shop.missed_call_addon_active) {
      await setAddonActive(supabase, shop.id, false)
    }
  }
}
