import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

// Next.js App Router does NOT auto-parse bodies — req.text() receives the raw bytes
// that Stripe needs for signature verification. No bodyParser config is required here.

function safeToISO(timestamp: number | null | undefined): string {
  if (!timestamp || typeof timestamp !== 'number' || isNaN(timestamp)) {
    console.warn('[stripe/webhook] safeToISO: invalid timestamp', timestamp, '— falling back to now+30d')
    return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  }
  return new Date(timestamp * 1000).toISOString()
}

async function notifySlack(message: string) {
  const url = process.env.SLACK_WEBHOOK_URL
  if (!url) {
    console.log('[stripe/webhook] SLACK_WEBHOOK_URL is not set — skipping Slack notification')
    return
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message }),
    })
    if (!res.ok) {
      console.error(`[stripe/webhook] Slack fetch failed: ${res.status} ${await res.text()}`)
    } else {
      console.log('[stripe/webhook] Slack notification sent')
    }
  } catch (err: any) {
    console.error('[stripe/webhook] Slack fetch threw:', err.message)
  }
}

export async function POST(req: NextRequest) {
  console.log('[stripe/webhook] handler version: safeToISO-fix')
  console.log('[stripe/webhook] POST received', new Date().toISOString())
  console.log('[stripe/webhook] STRIPE_WEBHOOK_SECRET set:', !!process.env.STRIPE_WEBHOOK_SECRET)
  console.log('[stripe/webhook] STRIPE_SECRET_KEY set:', !!process.env.STRIPE_SECRET_KEY)

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2026-05-27.dahlia' as any,
  })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  console.log('[stripe/webhook] stripe-signature present:', !!sig, '| body length:', body.length)

  if (!sig) {
    console.error('[stripe/webhook] Missing stripe-signature header')
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('[stripe/webhook] STRIPE_WEBHOOK_SECRET is not set')
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err: any) {
    console.error('[stripe/webhook] Signature verification failed:', err.message)
    return NextResponse.json({ error: `Webhook signature verification failed: ${err.message}` }, { status: 400 })
  }

  console.log('[stripe/webhook] Event type:', event.type, '| ID:', event.id)

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const userId = session.metadata?.user_id
      const plan = session.metadata?.plan

      console.log('[stripe/webhook] checkout.session.completed | userId:', userId, '| plan:', plan)

      try {
        // Fetch subscription to get trial_end and current status
        let trialEnd: string | null = null
        let subStatus = 'trialing'
        let periodEnd: string | null = null

        console.log('[stripe/webhook] session.customer:', session.customer, '| session.subscription:', session.subscription)
        if (process.env.NODE_ENV === 'development') {
          console.log('[stripe/webhook] full session:', JSON.stringify(session, null, 2))
        }

        if (!userId) {
          console.warn('[stripe/webhook] session.metadata.user_id is missing — skipping')
          break
        }
        if (!session.subscription) {
          console.warn('[stripe/webhook] session.subscription is null — one-time payment, not a subscription')
          break
        }
        if (!session.customer) {
          console.warn('[stripe/webhook] session.customer is null — skipping')
          break
        }

        console.log('[stripe/webhook] Retrieving subscription:', session.subscription)
        const sub = await stripe.subscriptions.retrieve(session.subscription as string)

        if (process.env.NODE_ENV === 'development') {
          console.log('[stripe/webhook] full subscription:', JSON.stringify(sub, null, 2))
        }
        console.log('[stripe/webhook] current_period_end:', (sub as any).current_period_end)
        console.log('[stripe/webhook] trial_end:', (sub as any).trial_end)

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

        if (dbErr) console.error('[stripe/webhook] DB update failed:', dbErr.message)

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
      } catch (err: any) {
        console.error('[stripe/webhook] checkout.session.completed error:', err.message)
      }
      break
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription
      const customerId = subscription.customer as string
      const newStatus = subscription.status === 'canceled' ? 'cancelled' : subscription.status

      console.log('[stripe/webhook] subscription.updated | customer:', customerId, '| status:', newStatus)

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
      if (dbErr) console.error('[stripe/webhook] DB update failed:', dbErr.message)

      await supabase.from('billing_events').insert({
        profile_id: updatedProfile?.id ?? null,
        stripe_event_id: event.id,
        event_type: event.type,
        payload: subscription as any,
      })
      break
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription
      const customerId = subscription.customer as string
      const graceEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

      console.log('[stripe/webhook] subscription.deleted | customer:', customerId)

      const { data: ownerProfile, error: dbErr } = await supabase
        .from('profiles')
        .update({ subscription_status: 'cancelled', subscription_end_date: graceEnd })
        .eq('stripe_customer_id', customerId)
        .select('id, role')
        .maybeSingle()

      if (dbErr) console.error('[stripe/webhook] DB update failed:', dbErr.message)

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
        }
      }

      await supabase.from('billing_events').insert({
        profile_id: ownerProfile?.id,
        stripe_event_id: event.id,
        event_type: event.type,
        payload: subscription as any,
      })
      await notifySlack(`⚠️ ChairOS subscription cancelled\nCustomer: ${customerId}`)
      break
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice
      const customerId = invoice.customer as string
      console.log('[stripe/webhook] invoice.payment_succeeded | customer:', customerId)
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
      break
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      const customerId = invoice.customer as string

      console.log('[stripe/webhook] invoice.payment_failed | customer:', customerId)

      const { data: failProfile, error: dbErr } = await supabase
        .from('profiles')
        .update({ subscription_status: 'past_due' })
        .eq('stripe_customer_id', customerId)
        .select('id')
        .maybeSingle()

      if (dbErr) console.error('[stripe/webhook] DB update failed:', dbErr.message)

      await supabase.from('billing_events').insert({
        profile_id: failProfile?.id ?? null,
        stripe_event_id: event.id,
        event_type: event.type,
        payload: invoice as any,
      })
      await notifySlack(`🚨 Payment failed\nCustomer: ${customerId}`)
      break
    }

    case 'customer.subscription.trial_will_end': {
      const subscription = event.data.object as Stripe.Subscription
      const customerId = subscription.customer as string
      console.log('[stripe/webhook] trial_will_end | customer:', customerId)
      // No DB change — trial countdown banners read trial_end from profile
      await supabase.from('billing_events').insert({
        stripe_event_id: event.id,
        event_type: event.type,
        payload: subscription as any,
      })
      break
    }

    default:
      console.log('[stripe/webhook] Unhandled event type:', event.type)
  }

  return NextResponse.json({ received: true })
}
