import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import * as Sentry from '@sentry/nextjs'
import { notifySlack as notifySlackShared } from '@/lib/slack'
import { logger } from '@/lib/logger'

// Next.js App Router does NOT auto-parse bodies — req.text() receives the raw bytes
// that Stripe needs for signature verification. No bodyParser config is required here.

function safeToISO(timestamp: number | null | undefined): string {
  if (!timestamp || typeof timestamp !== 'number' || isNaN(timestamp)) {
    logger.warn('stripe_webhook_invalid_timestamp', { timestamp })
    return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  }
  return new Date(timestamp * 1000).toISOString()
}

function notifySlack(message: string) {
  return notifySlackShared(message, 'stripe/webhook')
}

export async function POST(req: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2026-05-27.dahlia' as any,
    maxNetworkRetries: 3,
  })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  if (!sig) {
    logger.error('stripe_webhook_missing_signature')
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    logger.error('stripe_webhook_misconfigured', { reason: 'STRIPE_WEBHOOK_SECRET not set' })
    Sentry.captureMessage('Stripe webhook misconfigured: STRIPE_WEBHOOK_SECRET is not set', 'error')
    await notifySlack('🚨 Stripe webhook misconfigured: STRIPE_WEBHOOK_SECRET is not set. All incoming events are being rejected.')
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err: any) {
    logger.error('stripe_webhook_signature_invalid', { message: err.message })
    return NextResponse.json({ error: `Webhook signature verification failed: ${err.message}` }, { status: 400 })
  }

  logger.info('stripe_webhook_received', { type: event.type, id: event.id })

  try {
    await handleEvent(event, stripe, supabase)
  } catch (err: any) {
    logger.error('stripe_webhook_unhandled_error', { type: event.type, id: event.id, message: err.message })
    Sentry.captureException(err, { tags: { event_type: event.type }, extra: { event_id: event.id } })
    await notifySlack(`🚨 Stripe webhook error processing ${event.type} (event ${event.id}):\n${err.message}`)
  }

  return NextResponse.json({ received: true })
}

async function handleEvent(event: Stripe.Event, stripe: Stripe, supabase: any) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const userId = session.metadata?.user_id
      const plan = session.metadata?.plan

      try {
        // Fetch subscription to get trial_end and current status
        let trialEnd: string | null = null
        let subStatus = 'trialing'
        let periodEnd: string | null = null

        if (!userId) {
          logger.warn('stripe_checkout_completed_missing_user_id', { sessionId: session.id })
          break
        }
        if (!session.subscription) {
          logger.warn('stripe_checkout_completed_no_subscription', { sessionId: session.id })
          break
        }
        if (!session.customer) {
          logger.warn('stripe_checkout_completed_no_customer', { sessionId: session.id })
          break
        }

        const sub = await stripe.subscriptions.retrieve(session.subscription as string)

        subStatus = sub.status === 'trialing' ? 'trialing' : sub.status
        trialEnd = sub.trial_end ? safeToISO(sub.trial_end) : null
        periodEnd = safeToISO((sub as any).current_period_end)

        const planType = plan === 'owner' ? 'shop' : 'solo'

        const { error: dbErr } = await supabase.from('profiles').update({
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: session.subscription as string,
          subscription_status: subStatus,
          subscription_end_date: periodEnd,
          trial_end: trialEnd,
          plan_type: planType,
        }).eq('id', userId)

        if (dbErr) logger.error('stripe_checkout_completed_db_update_failed', { userId, message: dbErr.message })

        // Log billing event
        await supabase.from('billing_events').insert({
          profile_id: userId,
          stripe_event_id: event.id,
          event_type: event.type,
          payload: session as any,
        }).select().maybeSingle()

        // Slack notification
        const email = session.customer_email || session.customer_details?.email || 'unknown'
        const planLabel = planType === 'shop' ? 'Shop Owner ($79/mo)' : 'Solo Chair ($25/mo)'
        await notifySlack(`🎉 New ChairOS subscriber!\nPlan: ${planLabel}\nEmail: ${email}`)
        logger.info('stripe_checkout_completed', { userId, planType, subStatus })
      } catch (err: any) {
        logger.error('stripe_checkout_completed_error', { userId, message: err.message })
        Sentry.captureException(err, { tags: { event_type: event.type }, extra: { event_id: event.id, user_id: userId } })
        await notifySlack(`🚨 Stripe checkout.session.completed error (event ${event.id}):\n${err.message}`)
      }
      break
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription
      const customerId = subscription.customer as string
      const newStatus = subscription.status === 'canceled' ? 'cancelled' : subscription.status

      const updates: Record<string, any> = {
        subscription_status: newStatus,
        subscription_end_date: safeToISO((subscription as any).current_period_end),
      }
      if (newStatus === 'active') updates.grace_period_ends_at = null

      const { data: updatedProfile, error: dbErr } = await supabase
        .from('profiles')
        .update(updates)
        .eq('stripe_customer_id', customerId)
        .select('id')
        .maybeSingle()
      if (dbErr) logger.error('stripe_subscription_updated_db_failed', { customerId, message: dbErr.message })

      await supabase.from('billing_events').insert({
        profile_id: updatedProfile?.id ?? null,
        stripe_event_id: event.id,
        event_type: event.type,
        payload: subscription as any,
      })
      logger.info('stripe_subscription_updated', { customerId, newStatus })
      break
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription
      const customerId = subscription.customer as string
      const graceEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

      const { data: ownerProfile, error: dbErr } = await supabase
        .from('profiles')
        .update({ subscription_status: 'cancelled', subscription_end_date: graceEnd })
        .eq('stripe_customer_id', customerId)
        .select('id, role')
        .maybeSingle()

      if (dbErr) logger.error('stripe_subscription_deleted_db_failed', { customerId, message: dbErr.message })

      // If an owner cancels, give their shop barbers 7 days to convert to solo plan
      if (ownerProfile?.role === 'owner') {
        const { data: shop } = await supabase
          .from('shops')
          .select('id')
          .eq('owner_id', ownerProfile.id)
          .maybeSingle()

        if (shop) {
          const { data: shopBarbers } = await supabase
            .from('shop_barbers')
            .select('barber_id')
            .eq('shop_id', shop.id)
            .eq('active', true)

          const barberIds = (shopBarbers ?? []).map((b: any) => b.barber_id).filter(Boolean)
          if (barberIds.length > 0) {
            await supabase
              .from('profiles')
              .update({ subscription_status: 'grace_period', subscription_end_date: graceEnd, grace_period_ends_at: graceEnd })
              .in('id', barberIds)
          }

          await supabase.from('audit_events').insert({
            shop_id: shop.id,
            actor_user_id: ownerProfile.id,
            action: 'subscription.cancelled',
            entity_type: 'profile',
            entity_id: ownerProfile.id,
            metadata: { stripe_customer_id: customerId, grace_period_ends_at: graceEnd },
          })
        }
      }

      await supabase.from('billing_events').insert({
        profile_id: ownerProfile?.id,
        stripe_event_id: event.id,
        event_type: event.type,
        payload: subscription as any,
      })
      logger.info('stripe_subscription_deleted', { customerId })
      await notifySlack(`⚠️ ChairOS subscription cancelled\nCustomer: ${customerId}`)
      break
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice
      const customerId = invoice.customer as string
      const { data: invProfile } = await supabase
        .from('profiles')
        .update({ subscription_status: 'active', grace_period_ends_at: null })
        .eq('stripe_customer_id', customerId)
        .select('id')
        .maybeSingle()
      await supabase.from('billing_events').insert({
        profile_id: invProfile?.id ?? null,
        stripe_event_id: event.id,
        event_type: event.type,
        payload: invoice as any,
      })
      logger.info('stripe_invoice_payment_succeeded', { customerId })
      break
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      const customerId = invoice.customer as string

      const { data: failProfile, error: dbErr } = await supabase
        .from('profiles')
        .update({ subscription_status: 'past_due' })
        .eq('stripe_customer_id', customerId)
        .select('id')
        .maybeSingle()

      if (dbErr) logger.error('stripe_invoice_payment_failed_db_failed', { customerId, message: dbErr.message })

      await supabase.from('billing_events').insert({
        profile_id: failProfile?.id ?? null,
        stripe_event_id: event.id,
        event_type: event.type,
        payload: invoice as any,
      })
      logger.warn('stripe_invoice_payment_failed', { customerId })
      await notifySlack(`🚨 Payment failed\nCustomer: ${customerId}`)
      break
    }

    case 'customer.subscription.trial_will_end': {
      const subscription = event.data.object as Stripe.Subscription
      const customerId = subscription.customer as string
      // No DB change — trial countdown banners read trial_end from profile
      await supabase.from('billing_events').insert({
        stripe_event_id: event.id,
        event_type: event.type,
        payload: subscription as any,
      })
      logger.info('stripe_trial_will_end', { customerId })
      break
    }

    default:
      logger.info('stripe_webhook_unhandled_event_type', { type: event.type })
  }
}
