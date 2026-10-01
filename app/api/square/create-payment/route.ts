import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { computeServicePrice } from '@/lib/server-pricing'
import { timeStrToMinutes } from '@/lib/availability'
import {
  isDefinitiveSquareRejection,
  safeSquareErrorMessage,
  resolveShopSquareAccount,
  withFreshSquareClient,
  isSquareReconnectRequired,
  squareNotConnectedMessage,
} from '@/lib/square'
import { logger } from '@/lib/logger'

function getSupabase() {
  return createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  const supabase = getSupabase()
  const cookieStore = await cookies()
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cs) { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
      },
    }
  )
  const { data: { user } } = await supabaseAuth.auth.getUser()

  let appointmentId = ''
  try {
    const body = await req.json() as { sourceId: string; appointmentId: string; publicShopCode?: string }
    const { sourceId, publicShopCode } = body
    appointmentId = body.appointmentId

    if (!sourceId || !appointmentId) {
      return NextResponse.json({ error: 'sourceId and appointmentId are required' }, { status: 400 })
    }

    const { data: appointment, error: apptErr } = await supabase
      .from('appointments')
      .select('id, shop_id, service_id, date, time, price, payment_status, status, barber_id, client_id, client_name, services(name, price)')
      .eq('id', appointmentId)
      .maybeSingle()

    if (apptErr || !appointment) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
    }
    if (appointment.payment_status === 'paid') {
      return NextResponse.json({ error: 'Appointment already paid' }, { status: 409 })
    }
    // Never charge a booking that is no longer active (e.g. the hold
    // expired and the appointment was cancelled while the customer was
    // still on the payment screen).
    if (['cancelled', 'done', 'noshow'].includes(appointment.status)) {
      return NextResponse.json({ error: 'This booking is no longer active. Please start a new booking.' }, { status: 400 })
    }

    // Authorization: either the user owns/works at this shop, OR a valid publicShopCode was provided
    // (public booking flow — client is not logged in but knows the shop code)
    if (!user) {
      if (!publicShopCode) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      const { data: shopCheck } = await supabase
        .from('shops')
        .select('id')
        .eq('id', appointment.shop_id)
        .eq('shop_code', publicShopCode.toUpperCase())
        .maybeSingle()
      if (!shopCheck) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
      }
    } else {
      // Authenticated: verify user is the shop owner or assigned barber
      const { data: shopCheck } = await supabase
        .from('shops')
        .select('id, owner_id')
        .eq('id', appointment.shop_id)
        .maybeSingle()
      const isOwner = shopCheck?.owner_id === user.id
      const isBarber = appointment.barber_id === user.id
      if (!isOwner && !isBarber) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    // Determine payment routing based on shop setting. FAIL CLOSED: when
    // the routed party (owner, or barber when barbers collect their own)
    // has no connected Square account, refuse the charge with an
    // actionable message — never silently route client money through the
    // platform's own Square credentials.
    const { data: shop } = await supabase
      .from('shops')
      .select('id, owner_id, barbers_collect_own_payments')
      .eq('id', (appointment as any).shop_id)
      .maybeSingle()

    const route = await resolveShopSquareAccount(supabase, {
      id: (appointment as any).shop_id,
      owner_id: shop?.owner_id ?? null,
      barbers_collect_own_payments: shop?.barbers_collect_own_payments ?? false,
    }, appointment.barber_id)

    if (!route) {
      const collectsOwn = Boolean(shop?.barbers_collect_own_payments && appointment.barber_id)
      return NextResponse.json(
        { code: 'square_not_connected', error: squareNotConnectedMessage(collectsOwn ? 'barber' : 'shop owner') },
        { status: 400 }
      )
    }
    const locationId = route.locationId

    // Never charge appointment.price blindly: recompute the price
    // server-side from the service's list price + pricing_rules for this
    // slot. The stored price may legitimately be LOWER (a referral reward
    // discount applied at booking time) -- honor that -- but it must never
    // be HIGHER than the recomputed price; on mismatch, charge the
    // recomputed amount and correct the stored row.
    const storedPrice = appointment.price == null ? null : Number(appointment.price)
    if (storedPrice == null || Number.isNaN(storedPrice)) {
      // The service never had a price set (preset-created): block with a
      // plain message naming the service instead of an opaque failure.
      const missingName = (appointment as any).services?.name || 'service'
      return NextResponse.json({ error: `This service ("${missingName}") has no price set yet — ask the shop to set one before paying` }, { status: 400 })
    }
    let chargeAmount = storedPrice
    try {
      const verifiedPrice = await computeServicePrice(supabase, {
        serviceId: appointment.service_id,
        shopId: appointment.shop_id,
        dateStr: appointment.date,
        timeMinutes: timeStrToMinutes(String(appointment.time).slice(0, 5)),
      })
      if (verifiedPrice != null && storedPrice > verifiedPrice + 0.005) {
        logger.warn('payment_price_mismatch', { appointmentId, storedPrice, verifiedPrice })
        chargeAmount = verifiedPrice
        await supabase.from('appointments').update({ price: verifiedPrice }).eq('id', appointmentId)
      }
    } catch (e) {
      logger.error('payment_price_verify_failed', { appointmentId, message: e instanceof Error ? e.message : String(e) })
      return NextResponse.json({ error: 'Could not verify booking price' }, { status: 500 })
    }

    const amountCents = BigInt(Math.round(chargeAmount * 100))
    const serviceName = (appointment as any).services?.name || 'Appointment'

    // Charge attempt counter, read separately so a database that hasn't
    // applied the payment_attempt migration yet degrades to the old
    // always-stable key instead of failing the payment lookup.
    const { data: attemptRow } = await supabase
      .from('appointments')
      .select('payment_attempt')
      .eq('id', appointmentId)
      .maybeSingle()
    const paymentAttempt = typeof (attemptRow as any)?.payment_attempt === 'number'
      ? (attemptRow as any).payment_attempt
      : 0

    // Best-effort attempt bump; a missing column (migration not applied)
    // fails silently while the payment_status update still lands (it is a
    // separate update).
    async function bumpPaymentAttempt() {
      const { error: bumpErr } = await supabase
        .from('appointments')
        .update({ payment_attempt: paymentAttempt + 1 })
        .eq('id', appointmentId)
      if (bumpErr) logger.warn('payment_attempt_bump_failed', { appointmentId, message: bumpErr.message })
    }

    // Idempotency key: stable per attempt. A retry after an ambiguous
    // failure (timeout where Square may have charged) reuses the SAME key
    // and Square dedupes instead of creating a second charge. After a
    // CLEAN decline (Square answered: no charge happened) the key rotates
    // via payment_attempt -- Square caches idempotent responses, including
    // declines, for up to 24h, so reusing the key after a decline would
    // replay the decline forever and the customer could never pay.
    const idempotencyKey = paymentAttempt > 0
      ? `payment-${appointmentId}-a${paymentAttempt}`
      : `payment-${appointmentId}`

    // Receipts: Square emails the client a receipt when buyerEmailAddress
    // is set (per the shop's Square receipt settings).
    let receiptEmail: string | null = null
    if ((appointment as any).client_id) {
      const { data: receiptClient } = await supabase
        .from('clients')
        .select('email')
        .eq('id', (appointment as any).client_id)
        .maybeSingle()
      receiptEmail = (receiptClient as any)?.email || null
    }

    let payment: any
    try {
      // withFreshSquareClient refreshes an expired OAuth token once on a
      // 401 and retries — a 401 is a definitive rejection (no charge), so
      // the retry cannot double-charge.
      const created = await withFreshSquareClient(supabase, route, (c) => c.payments.create({
        sourceId,
        idempotencyKey,
        amountMoney: { amount: amountCents, currency: 'USD' },
        locationId,
        note: `ChairOS - ${serviceName} for ${appointment.client_name}`,
        referenceId: appointmentId,
        // Receipts: Square emails the client a receipt when set.
        ...(receiptEmail ? { buyerEmailAddress: receiptEmail } : {}),
      }))
      payment = created.payment
    } catch (err: any) {
      // The shop's Square connection died and couldn't be refreshed —
      // tell them to reconnect instead of failing opaquely.
      if (isSquareReconnectRequired(err)) {
        return NextResponse.json({ code: 'square_reconnect_required', error: err.message }, { status: 400 })
      }
      // Ambiguous failures (5xx, timeout, network) rethrow to the outer
      // catch, which deliberately leaves payment_status alone. A
      // DEFINITIVE Square rejection (4xx: decline, bad nonce/amount) means
      // no charge happened -- mark failed and rotate the key so the next
      // attempt is a genuinely new charge, not a cached decline replay.
      if (!isDefinitiveSquareRejection(err)) throw err
      await supabase.from('appointments').update({ payment_status: 'failed' }).eq('id', appointmentId)
      await bumpPaymentAttempt()
      return NextResponse.json({ error: safeSquareErrorMessage(err) }, { status: 402 })
    }

    if (payment?.status !== 'COMPLETED') {
      // Square answered synchronously with a non-completed payment: no
      // charge happened. Same treatment as a thrown decline -- and never a
      // 200 "success" for a payment that didn't go through.
      await supabase.from('appointments').update({ payment_status: 'failed' }).eq('id', appointmentId)
      await bumpPaymentAttempt()
      return NextResponse.json({ error: 'Payment was not completed', status: payment?.status }, { status: 402 })
    }

    await supabase
      .from('appointments')
      .update({
        payment_status: 'paid',
        square_payment_id: payment?.id ?? null,
        amount_paid: chargeAmount,
      })
      .eq('id', appointmentId)

    return NextResponse.json({ paymentId: payment?.id, status: payment?.status })
  } catch (err: any) {
    // Ambiguous failure (network timeout, SDK throw after Square may have
    // charged, 5xx, ...). Definitive rejections (4xx declines) are caught
    // by the inner try and never reach here. Do NOT mark the appointment
    // 'failed' here: that invites a re-charge that double-bills when the
    // first attempt actually succeeded. Leave payment_status as-is and let
    // the Square webhook reconcile via reference_id (payment.updated ->
    // 'paid'). The stable per-attempt idempotency key makes a client retry
    // dedupe at Square rather than double-charge.
    logger.error('payment_ambiguous_failure', { appointmentId, message: err?.message })
    // Generic message: this route is reachable with only a public shop
    // code, so gateway internals must not leak to the caller. The booking
    // page maps failures to friendly copy client-side.
    return NextResponse.json({ error: 'Payment could not be completed. Check your bookings before trying again.' }, { status: 500 })
  }
}
