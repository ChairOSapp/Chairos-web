import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'
import * as Sentry from '@sentry/nextjs'
import { resolveSquareCredentials, refundSquarePayment } from '@/lib/square'
import { notifySlack } from '@/lib/slack'
import { logger } from '@/lib/logger'
import { sendNotification } from '@/lib/notify'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function verifySignature(body: string, signature: string, key: string, url: string): boolean {
  const expected = createHmac('sha256', key)
    .update(url + body)
    .digest('base64')
  const expectedBuf = Buffer.from(expected)
  const actualBuf = Buffer.from(signature)
  // Lengths must match before timingSafeEqual (it throws on mismatched
  // lengths); an attacker-controlled length is not itself sensitive here.
  if (expectedBuf.length !== actualBuf.length) return false
  return timingSafeEqual(expectedBuf, actualBuf)
}

async function notifyClientSlotExpired(appointment: { client_name: string; client_phone: string | null; client_id: string | null }) {
  if (!appointment.client_phone) return
  if (appointment.client_id) {
    const { data: client } = await supabase.from('clients').select('sms_consent').eq('id', appointment.client_id).maybeSingle()
    if (!client?.sms_consent) return
  }
  const digitsOnly = (appointment.client_phone || '').replace(/\D/g, '')
  const normalized = digitsOnly.length === 10 ? `+1${digitsOnly}` : `+${digitsOnly}`
  const last4 = digitsOnly.slice(-4)
  const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
  try {
    const msg = await twilioClient.messages.create({
      body: `Hi ${appointment.client_name}, your reserved appointment slot expired before we received your deposit payment. You've been refunded in full — please rebook when ready.`,
      from: process.env.TWILIO_PHONE_NUMBER!,
      to: normalized,
    })
    logger.info('slot_expired_sms_sent', { to: last4, messageSid: msg.sid })
  } catch (err: any) {
    // Best-effort notification — the refund and log entry are the source of
    // truth, not the SMS — but a silent failure here previously left no
    // trail at all, so it's still worth capturing.
    logger.error('slot_expired_sms_failed', { to: last4, message: err.message })
    Sentry.captureException(err, { tags: { job: 'square_webhook_slot_expired_sms' }, extra: { clientId: appointment.client_id } })
  }
}

/**
 * Deposit payments carry referenceId = `deposit:<deposits.id>` (set at charge
 * time in /api/square/create-deposit) so they never collide with full-payment
 * webhooks, which correlate via reference_id = appointments.id directly.
 */
async function handleDepositPayment(payment: any, depositId: string) {
  const { data: deposit } = await supabase
    .from('deposits')
    .select('*, appointments(id, shop_id, barber_id, client_name, client_phone, client_id, status)')
    .eq('id', depositId)
    .maybeSingle()

  if (!deposit) return // unknown deposit id — nothing to correlate, ack and move on

  // Idempotency (Task 7): a duplicate delivery of a payment we've already
  // resolved (paid or refunded) for this deposit is a no-op.
  if (deposit.square_payment_id === payment.id && (deposit.status === 'paid' || deposit.status === 'refunded')) {
    return
  }

  if (payment.status !== 'COMPLETED') return // only a completed charge changes deposit/appointment state

  const appointment = (deposit as any).appointments

  if (deposit.status === 'expired') {
    // Task 4: the hold already expired and the slot was released (possibly
    // rebooked) before this payment confirmed. Do not silently confirm into
    // a slot that may now be double-booked — refund, notify, log.
    const { data: shop } = await supabase
      .from('shops')
      .select('owner_id, barbers_collect_own_payments')
      .eq('id', deposit.shop_id)
      .maybeSingle()
    let refundResult = 'skipped:no_shop'
    if (shop) {
      try {
        const { accessToken } = await resolveSquareCredentials(supabase, shop, appointment?.barber_id)
        await refundSquarePayment(
          accessToken,
          payment.id,
          Number(deposit.amount),
          `deposit-refund-${deposit.id}`,
          'Deposit hold expired before payment confirmed'
        )
        refundResult = 'refunded'
        logger.info('deposit_late_payment_refunded', { depositId: deposit.id, paymentId: payment.id })
      } catch (err: any) {
        refundResult = `refund_failed:${err.message}`
        logger.error('deposit_late_payment_refund_failed', { depositId: deposit.id, paymentId: payment.id, message: err.message })
        Sentry.captureException(err, { tags: { job: 'square_webhook_deposit_refund' }, extra: { depositId: deposit.id, paymentId: payment.id } })
        await notifySlack(`🚨 Square refund failed for expired deposit ${deposit.id} (payment ${payment.id}):\n${err.message}`, 'square/webhook')
      }
    }

    await supabase.from('deposits').update({
      status: 'refunded',
      refunded_at: new Date().toISOString(),
      square_payment_id: payment.id,
    }).eq('id', deposit.id)

    if (appointment) await notifyClientSlotExpired(appointment)

    await supabase.from('automation_logs').insert({
      type: 'deposit_late_payment_refund',
      payload: { depositId: deposit.id, appointmentId: deposit.appointment_id, paymentId: payment.id },
      result: refundResult,
    })
    return
  }

  if (deposit.status === 'pending') {
    await supabase.from('deposits').update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      square_payment_id: payment.id,
    }).eq('id', deposit.id)

    // Guarded by .eq('status','pending') so this is a no-op if the
    // synchronous charge path in create-deposit already confirmed it.
    await supabase.from('appointments')
      .update({ status: 'confirmed' })
      .eq('id', deposit.appointment_id)
      .eq('status', 'pending')
    logger.info('deposit_paid', { depositId: deposit.id, paymentId: payment.id })
    return
  }

  // deposit.status === 'paid' with a different payment id than we have on
  // record — an anomaly worth a record, but not something to act on blindly.
  logger.warn('deposit_webhook_anomaly', { depositId: deposit.id, existingStatus: deposit.status, incomingPaymentId: payment.id })
  await supabase.from('automation_logs').insert({
    type: 'deposit_webhook_anomaly',
    payload: { depositId: deposit.id, existingStatus: deposit.status, incomingPaymentId: payment.id },
    result: 'ignored',
  })
}

const MATCH_AMOUNT_EPSILON = 0.01
// A payment rung up in Square's own app the evening before/after an
// appointment's calendar date can land on the "wrong side" of midnight
// once its UTC created_at is compared to a naive local appointment date
// (this app has no shop-timezone field anywhere -- every date/time in it
// is handled the same naive way). A ±1 day window absorbs that slop
// without materially increasing false-positive risk, since it's combined
// with an exact amount match.
const MATCH_DATE_WINDOW_DAYS = 1

function toDateOnly(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return toDateOnly(d)
}

/**
 * Reconciles a COMPLETED Square payment that carries no reference_id --
 * i.e. it wasn't created through ChairOS's own checkout/deposit flow, so
 * it's almost certainly a walk-in an owner rang up directly in Square's
 * own app, reader, or dashboard. Square gives no field a merchant can set
 * from those surfaces that reliably maps to a ChairOS appointment, so
 * this matches on what IS available: the connected Square account (which
 * shop), the exact charge amount, a same-day-ish window, and -- when the
 * merchant attached a known customer to the sale -- that customer. When
 * exactly one appointment satisfies the match, it's marked paid
 * automatically; anything with zero or multiple candidates is queued in
 * unmatched_square_payments for the owner to resolve by hand rather than
 * guessed at.
 */
async function handleUnreferencedPayment(payment: any) {
  if (payment.status !== 'COMPLETED') return
  if (!payment.location_id || !payment.amount_money?.amount) return

  // Idempotency -- a retried/duplicate webhook delivery for a payment
  // already resolved (either matched onto an appointment or already
  // queued) is a no-op.
  const [{ data: alreadyOnAppointment }, { data: alreadyQueued }] = await Promise.all([
    supabase.from('appointments').select('id').eq('square_payment_id', payment.id).maybeSingle(),
    supabase.from('unmatched_square_payments').select('id').eq('square_payment_id', payment.id).maybeSingle(),
  ])
  if (alreadyOnAppointment || alreadyQueued) return

  const { data: squareAccount } = await supabase
    .from('square_accounts')
    .select('shop_id')
    .eq('square_location_id', payment.location_id)
    .not('shop_id', 'is', null)
    .maybeSingle()
  if (!squareAccount?.shop_id) {
    logger.warn('square_external_payment_no_shop_match', { paymentId: payment.id, locationId: payment.location_id })
    return
  }
  const shopId = squareAccount.shop_id

  const amount = Number(payment.amount_money.amount) / 100
  const paymentDate = toDateOnly(new Date(payment.created_at))
  const windowStart = addDays(paymentDate, -MATCH_DATE_WINDOW_DAYS)
  const windowEnd = addDays(paymentDate, MATCH_DATE_WINDOW_DAYS)

  const { data: candidates } = await supabase
    .from('appointments')
    .select('id, date, price, client_id, status')
    .eq('shop_id', shopId)
    .in('status', ['pending', 'confirmed'])
    .neq('payment_status', 'paid')
    .gte('date', windowStart)
    .lte('date', windowEnd)

  const amountMatches = (candidates || []).filter(a => Math.abs((Number(a.price) || 0) - amount) < MATCH_AMOUNT_EPSILON)

  let matchedClientId: string | null = null
  if (payment.customer_id) {
    const { data: client } = await supabase.from('clients').select('id').eq('square_customer_id', payment.customer_id).maybeSingle()
    matchedClientId = client?.id ?? null
  }

  // Prefer narrowing to the known customer's own appointments when that
  // narrows to exactly one -- higher confidence than amount alone. Fall
  // back to amount-only matching (still requires exactly one candidate)
  // when there's no customer match or it doesn't resolve uniquely.
  const clientNarrowed = matchedClientId ? amountMatches.filter(a => a.client_id === matchedClientId) : []
  const winner = clientNarrowed.length === 1 ? clientNarrowed[0]
    : amountMatches.length === 1 ? amountMatches[0]
    : null

  if (winner) {
    await supabase.from('appointments').update({
      payment_status: 'paid',
      square_payment_id: payment.id,
      amount_paid: amount,
      ...(winner.status === 'pending' || winner.status === 'confirmed' ? { status: 'done' } : {}),
    }).eq('id', winner.id)

    await supabase.from('automation_logs').insert({
      type: 'external_payment_reconciliation',
      payload: { paymentId: payment.id, shopId, amount, appointmentId: winner.id, matchedVia: clientNarrowed.length === 1 ? 'customer+amount' : 'amount_only' },
      result: 'auto_matched',
    })
    logger.info('square_external_payment_matched', { paymentId: payment.id, appointmentId: winner.id })
    return
  }

  // Zero or multiple candidates -- can't safely guess. Record it for the
  // owner to resolve manually in the dashboard rather than silently
  // dropping it (the pre-existing behavior for any payment without a
  // reference_id) or risking marking the wrong appointment paid.
  await supabase.from('unmatched_square_payments').insert({
    shop_id: shopId,
    square_payment_id: payment.id,
    square_location_id: payment.location_id,
    square_customer_id: payment.customer_id || null,
    amount,
    payment_created_at: payment.created_at,
    candidate_appointment_ids: amountMatches.map(a => a.id),
    raw_payload: payment,
  })

  const { data: shop } = await supabase.from('shops').select('owner_id').eq('id', shopId).maybeSingle()
  if (shop?.owner_id) {
    await sendNotification({
      userId: shop.owner_id,
      shopId,
      type: 'payment',
      title: 'Square payment needs matching',
      body: `A $${amount.toFixed(2)} payment came through Square outside ChairOS and couldn't be auto-matched to an appointment. Review it in Unmatched Payments.`,
    })
  }

  await supabase.from('automation_logs').insert({
    type: 'external_payment_reconciliation',
    payload: { paymentId: payment.id, shopId, amount, candidateCount: amountMatches.length },
    result: amountMatches.length === 0 ? 'queued_no_candidates' : 'queued_ambiguous',
  })
  logger.info('square_external_payment_queued', { paymentId: payment.id, shopId, candidateCount: amountMatches.length })
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const signature = req.headers.get('x-square-hmacsha256-signature') || ''

  if (!process.env.SQUARE_WEBHOOK_SIGNATURE_KEY) {
    logger.error('square_webhook_misconfigured', { reason: 'SQUARE_WEBHOOK_SIGNATURE_KEY not set' })
    Sentry.captureMessage('Square webhook misconfigured: SQUARE_WEBHOOK_SIGNATURE_KEY is not set', 'error')
    await notifySlack('🚨 Square webhook misconfigured: SQUARE_WEBHOOK_SIGNATURE_KEY is not set. All incoming events are being rejected.', 'square/webhook')
    return NextResponse.json({ error: 'Webhook key not configured' }, { status: 500 })
  }
  if (!verifySignature(body, signature, process.env.SQUARE_WEBHOOK_SIGNATURE_KEY, req.url)) {
    logger.warn('square_webhook_invalid_signature')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let event: any
  try {
    event = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  try {
    // Both event types are handled the same way -- whichever one first
    // reports a COMPLETED payment (fast card-present taps often arrive
    // COMPLETED already on payment.created; others complete async and
    // only reach COMPLETED on a later payment.updated) drives the match.
    // The idempotency checks in each path make it safe if both end up
    // COMPLETED and both get delivered.
    if (event.type === 'payment.updated' || event.type === 'payment.created') {
      const payment = event.data?.object?.payment
      if (!payment?.id) {
        return NextResponse.json({ received: true })
      }

      // No reference_id at all -- this wasn't created through ChairOS's
      // own checkout/deposit flow, so it's a payment taken directly
      // through the owner's own Square app/reader/dashboard.
      if (!payment.reference_id) {
        await handleUnreferencedPayment(payment)
        return NextResponse.json({ received: true })
      }

      if (typeof payment.reference_id === 'string' && payment.reference_id.startsWith('deposit:')) {
        await handleDepositPayment(payment, payment.reference_id.slice('deposit:'.length))
        return NextResponse.json({ received: true })
      }

      const paymentStatus = payment.status === 'COMPLETED' ? 'paid'
        : payment.status === 'FAILED' ? 'failed'
        : null

      if (paymentStatus) {
        await supabase
          .from('appointments')
          .update({
            payment_status: paymentStatus,
            square_payment_id: payment.id,
            amount_paid: paymentStatus === 'paid'
              ? (payment.amount_money?.amount ? Number(payment.amount_money.amount) / 100 : null)
              : null,
          })
          .eq('id', payment.reference_id)
        logger.info('square_payment_updated', { appointmentId: payment.reference_id, paymentStatus })
      }
    }
  } catch (err: any) {
    logger.error('square_webhook_unhandled_error', { type: event.type, message: err.message })
    Sentry.captureException(err, { tags: { event_type: event.type } })
    await notifySlack(`🚨 Square webhook error processing ${event.type}:\n${err.message}`, 'square/webhook')
  }

  return NextResponse.json({ received: true })
}
