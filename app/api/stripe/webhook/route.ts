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
      try {
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.metadata?.user_id
        const plan = session.metadata?.plan

        console.log('[stripe/webhook] checkout.session.completed | userId:', userId, '| plan:', plan)
        console.log('[stripe/webhook] session.customer:', session.customer, '| session.subscription:', session.subscription)
        console.log('[stripe/webhook] full session:', JSON.stringify(session, null, 2))

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
        const subscription = await stripe.subscriptions.retrieve(session.subscription as string)

        console.log('[stripe/webhook] full subscription:', JSON.stringify(subscription, null, 2))
        console.log('[stripe/webhook] current_period_end:', (subscription as any).current_period_end)
        console.log('[stripe/webhook] trial_end:', (subscription as any).trial_end)

        const { error: dbErr } = await supabase.from('profiles').update({
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: session.subscription as string,
          subscription_status: subscription.status,
          subscription_end_date: safeToISO((subscription as any).current_period_end),
          trial_end: safeToISO((subscription as any).trial_end),
        }).eq('id', userId)

        if (dbErr) {
          console.error('[stripe/webhook] DB update failed | code:', dbErr.code, '| message:', dbErr.message, '| details:', dbErr.details)
        } else {
          console.log('[stripe/webhook] Profile updated for userId:', userId)
          const email = session.customer_email || (session.customer_details as any)?.email || 'unknown'
          const planLabel = plan === 'owner' ? 'Shop Owner ($99/mo)' : plan === 'barber' ? 'Solo Barber ($25/mo)' : (plan || 'unknown')
          await notifySlack(`*🎉 New subscriber!*\n*Plan:* ${planLabel}\n*Email:* ${email}\n*Status:* ${subscription.status}`)
        }
      } catch (err: any) {
        console.error('[stripe/webhook] checkout.session.completed handler threw:', err.message)
        console.error('[stripe/webhook] stack:', err.stack)
        // Not re-throwing — Stripe gets 200 so it stops retrying.
        // Read the stack above to find the root cause, then redeploy.
      }
      break
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription
      const customerId = subscription.customer as string
      const newStatus = subscription.status === 'canceled' ? 'cancelled' : subscription.status

      console.log('[stripe/webhook] subscription.updated | customer:', customerId, '| status:', newStatus)
      console.log('[stripe/webhook] current_period_end:', (subscription as any).current_period_end)

      const { error: dbErr } = await supabase.from('profiles').update({
        subscription_status: newStatus,
        subscription_end_date: safeToISO((subscription as any).current_period_end),
      }).eq('stripe_customer_id', customerId)

      if (dbErr) console.error('[stripe/webhook] DB update failed:', dbErr.message)
      break
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription
      const customerId = subscription.customer as string

      console.log('[stripe/webhook] subscription.deleted | customer:', customerId)

      const { error: dbErr } = await supabase.from('profiles').update({
        subscription_status: 'cancelled',
      }).eq('stripe_customer_id', customerId)

      if (dbErr) console.error('[stripe/webhook] DB update failed:', dbErr.message)

      await notifySlack(`⚠️ ChairOS subscription cancelled\nCustomer: ${customerId}`)
      break
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      const customerId = invoice.customer as string

      console.log('[stripe/webhook] invoice.payment_failed | customer:', customerId)

      const { error: dbErr } = await supabase.from('profiles').update({
        subscription_status: 'past_due',
      }).eq('stripe_customer_id', customerId)

      if (dbErr) console.error('[stripe/webhook] DB update failed:', dbErr.message)

      await notifySlack(`🚨 Payment failed\nCustomer: ${customerId}`)
      break
    }

    default:
      console.log('[stripe/webhook] Unhandled event type:', event.type)
  }

  return NextResponse.json({ received: true })
}
