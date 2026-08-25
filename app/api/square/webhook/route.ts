import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'
import * as Sentry from '@sentry/nextjs'
import { resolveSquareCredentials, refundSquarePayment } from '@/lib/square'
import { notifySlack } from '@/lib/slack'
import { logger } from '@/lib/logger'

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
    if (event.type === 'payment.updated') {
      const payment = event.data?.object?.payment
      if (!payment?.id || !payment?.reference_id) {
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
