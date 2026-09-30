import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { missedCallAddonPriceId, setAddonActive } from '@/lib/missedCallAddon'
import { requireActiveBilling } from '@/lib/billing'
import { logger } from '@/lib/logger'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function authedUser() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

async function ownerShop(userId: string) {
  const { data } = await admin()
    .from('shops')
    .select('id, missed_call_addon_active, missed_call_number, missed_call_stripe_item_id')
    .eq('owner_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return data
}

/**
 * POST — add the missed-call text-back add-on ($10/mo) to the owner's
 * existing Stripe subscription as a subscription item (one bill, prorated).
 * The owner must already be a paying subscriber.
 */
export async function POST(_req: NextRequest) {
  const priceId = missedCallAddonPriceId()
  if (!priceId) {
    return NextResponse.json({ error: 'Add-on is not configured yet.' }, { status: 500 })
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe is not configured.' }, { status: 500 })
  }

  const user = await authedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = admin()
  const billingBlock = await requireActiveBilling(supabase, user.id)
  if (billingBlock) return billingBlock

  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id, stripe_subscription_id')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile?.stripe_subscription_id) {
    return NextResponse.json(
      { error: 'You need an active ChairOS subscription first.' },
      { status: 400 }
    )
  }

  const shop = await ownerShop(user.id)
  if (!shop) return NextResponse.json({ error: 'No shop found.' }, { status: 404 })
  if (shop.missed_call_addon_active) {
    return NextResponse.json({ ok: true, already: true })
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2026-05-27.dahlia' as any,
      maxNetworkRetries: 3,
    })

    // Idempotent: if the item is somehow already on the subscription
    // (retry after a webhook already synced), don't create a duplicate.
    const sub = await stripe.subscriptions.retrieve(profile.stripe_subscription_id as string)
    const existing = sub.items.data.find(i => i.price?.id === priceId)
    const itemId = existing?.id || (await stripe.subscriptionItems.create({
      subscription: profile.stripe_subscription_id as string,
      price: priceId,
      quantity: 1,
      metadata: { addon: 'missed_call', shop_id: shop.id },
    })).id

    await supabase.from('shops').update({
      missed_call_addon_active: true,
      missed_call_stripe_item_id: itemId,
    }).eq('id', shop.id)

    logger.info('missed_call_addon_added', { shopId: shop.id, itemId })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    logger.error('missed_call_addon_add_failed', { message: err.message })
    return NextResponse.json({ error: 'Could not add the add-on. Try again.' }, { status: 500 })
  }
}

/**
 * DELETE — remove the add-on. The platform Twilio number is released back
 * to Twilio (real monthly cost) and the flag is cleared immediately; the
 * Stripe webhook confirms the same state when the subscription updates.
 */
export async function DELETE(_req: NextRequest) {
  const priceId = missedCallAddonPriceId()
  if (!priceId || !process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Add-on is not configured yet.' }, { status: 500 })
  }

  const user = await authedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = admin()
  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_subscription_id')
    .eq('id', user.id)
    .maybeSingle()
  const shop = await ownerShop(user.id)
  if (!shop) return NextResponse.json({ error: 'No shop found.' }, { status: 404 })
  if (!shop.missed_call_addon_active) {
    return NextResponse.json({ ok: true, already: false })
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2026-05-27.dahlia' as any,
      maxNetworkRetries: 3,
    })

    // Find the add-on item by price (source of truth), falling back to the
    // stored item id.
    let itemId: string | null = shop.missed_call_stripe_item_id
    if (profile?.stripe_subscription_id) {
      const sub = await stripe.subscriptions.retrieve(profile.stripe_subscription_id as string)
      const found = sub.items.data.find(i => i.price?.id === priceId)
      if (found) itemId = found.id
    }
    if (itemId) {
      try { await stripe.subscriptionItems.del(itemId) } catch (err: any) {
        // Already gone — treat as removed.
        logger.warn('missed_call_addon_item_del_missed', { itemId })
      }
    }

    await setAddonActive(supabase, shop.id, false)
    logger.info('missed_call_addon_removed', { shopId: shop.id })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    logger.error('missed_call_addon_remove_failed', { message: err.message })
    return NextResponse.json({ error: 'Could not remove the add-on. Try again.' }, { status: 500 })
  }
}
