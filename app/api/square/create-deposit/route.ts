import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { resolveShopSquareAccount, withFreshSquareClient, isSquareReconnectRequired, squareNotConnectedMessage, computeDepositAmount, safeSquareErrorMessage } from '@/lib/square'
import { computeServicePrice } from '@/lib/server-pricing'
import { timeStrToMinutes } from '@/lib/availability'
import { logger } from '@/lib/logger'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const HOLD_MINUTES = 15

export async function POST(req: NextRequest) {
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

  let depositId = ''
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
      .select('id, shop_id, service_id, date, time, barber_id, client_name, status, price, services(name, price, deposit_required)')
      .eq('id', appointmentId)
      .maybeSingle()

    if (apptErr || !appointment) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
    }
    // Never take a deposit for a booking that is no longer active (e.g.
    // the 15-minute hold expired and the appointment was cancelled while
    // the customer was still on the payment screen).
    if (['cancelled', 'done', 'noshow'].includes(appointment.status)) {
      return NextResponse.json({ error: 'This booking is no longer active. Please start a new booking.' }, { status: 400 })
    }

    const { data: shop } = await supabase
      .from('shops')
      .select('id, owner_id, shop_code, vertical, barbers_collect_own_payments, deposits_enabled, deposit_type, deposit_amount')
      .eq('id', appointment.shop_id)
      .maybeSingle()
    if (!shop) {
      return NextResponse.json({ error: 'Shop not found' }, { status: 404 })
    }

    // Authorization: mirrors /api/square/create-payment — either the caller
    // owns/works at this shop, or a valid publicShopCode was supplied (the
    // unauthenticated public booking flow).
    if (!user) {
      if (!publicShopCode || shop.shop_code !== publicShopCode.toUpperCase()) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
      }
    } else {
      const isOwner = shop.owner_id === user.id
      const isBarber = appointment.barber_id === user.id
      if (!isOwner && !isBarber) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const service = (appointment as any).services
    const requiresDeposit =
      (shop.vertical === 'tattoo' || (shop.vertical === 'salon' && shop.deposits_enabled)) &&
      service?.deposit_required === true
    if (!requiresDeposit) {
      return NextResponse.json({ error: 'Deposit not required for this booking' }, { status: 400 })
    }
    // Recompute the base price server-side from the service's list price +
    // pricing_rules for this slot, then honor the booking's stored price
    // only if it is at-or-below the recomputed price (a referral reward
    // discount applied at booking time legitimately lowers what the client
    // owes). The stored price is never trusted blindly: it used to be
    // client-controlled, so if it exceeds the recomputed price we fall back
    // to the recomputed one and log the mismatch. The deposit stays a
    // percentage of what the client actually owes, not the pre-discount
    // sticker price.
    const storedPrice = appointment.price == null ? null : Number(appointment.price)
    if (storedPrice == null || Number.isNaN(storedPrice)) {
      return NextResponse.json({ error: 'This service has no price set yet — ask the shop to set one before booking' }, { status: 400 })
    }
    let basePrice = storedPrice
    try {
      const verifiedPrice = await computeServicePrice(supabase, {
        serviceId: appointment.service_id,
        shopId: shop.id,
        dateStr: appointment.date,
        timeMinutes: timeStrToMinutes(String(appointment.time).slice(0, 5)),
      })
      if (verifiedPrice != null && storedPrice > verifiedPrice + 0.005) {
        logger.warn('deposit_price_mismatch', { appointmentId, storedPrice, verifiedPrice })
        basePrice = verifiedPrice
      }
    } catch (e) {
      logger.error('deposit_price_verify_failed', { appointmentId, message: e instanceof Error ? e.message : String(e) })
      return NextResponse.json({ error: 'Could not verify booking price' }, { status: 500 })
    }
    const amount = computeDepositAmount(shop.deposit_type as 'flat' | 'percent', Number(shop.deposit_amount), basePrice)

    // Idempotent retry: a paid deposit already exists for this appointment
    // (the first attempt's charge succeeded but the response was lost, and
    // the Square webhook confirmed it since). Confirm the appointment and
    // report success instead of charging a second deposit.
    const { data: paidDeposit } = await supabase
      .from('deposits')
      .select('id, amount')
      .eq('appointment_id', appointmentId)
      .eq('status', 'paid')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (paidDeposit) {
      await supabase.from('appointments')
        .update({ status: 'confirmed' })
        .eq('id', appointmentId)
        .eq('status', 'pending')
      return NextResponse.json({
        depositId: paidDeposit.id,
        alreadyPaid: true,
        status: 'COMPLETED',
        amount: Number(paidDeposit.amount),
      })
    }

    // Reuse the in-flight pending deposit so a retry after an ambiguous
    // failure (timeout where Square may have charged) reuses the same
    // deposit row -- and therefore the same Square idempotency key
    // (`deposit-${depositId}`) -- letting Square dedupe instead of taking
    // a second deposit. The original 15-minute hold window is kept.
    let pendingDeposit: { id: string; expires_at: string; amount: number } | null = null
    {
      const { data } = await supabase
        .from('deposits')
        .select('id, expires_at, amount')
        .eq('appointment_id', appointmentId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (data && data.expires_at && new Date(data.expires_at) > new Date()) {
        pendingDeposit = data as { id: string; expires_at: string; amount: number }
      }
    }
    if (!pendingDeposit) {
      const newId = randomUUID()
      const expiresAt = new Date(Date.now() + HOLD_MINUTES * 60_000).toISOString()
      const { error: depositInsertErr } = await supabase.from('deposits').insert({
        id: newId,
        appointment_id: appointmentId,
        shop_id: shop.id,
        amount,
        type: shop.deposit_type,
        status: 'pending',
        expires_at: expiresAt,
      })
      if (depositInsertErr) {
        if ((depositInsertErr as any).code === '23505') {
          // Lost a concurrent-insert race (the partial unique index on
          // pending deposits per appointment): use the row that won.
          const { data: winner } = await supabase
            .from('deposits')
            .select('id, expires_at, amount')
            .eq('appointment_id', appointmentId)
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          if (!winner) {
            logger.error('deposit_race_no_winner', { appointmentId })
            return NextResponse.json({ error: 'Could not start the deposit payment. Please try again.' }, { status: 500 })
          }
          pendingDeposit = winner as { id: string; expires_at: string; amount: number }
        } else {
          // Raw DB error text must not reach the customer.
          logger.error('deposit_insert_failed', { appointmentId, message: depositInsertErr.message })
          return NextResponse.json({ error: 'Could not start the deposit payment. Please try again.' }, { status: 500 })
        }
      } else {
        pendingDeposit = { id: newId, expires_at: expiresAt, amount }
      }
    }
    if (!pendingDeposit) {
      return NextResponse.json({ error: 'Could not start the deposit payment. Please try again.' }, { status: 500 })
    }
    depositId = pendingDeposit.id
    // Charge the amount stored on the (possibly reused) deposit row, not a
    // recomputed one: the customer was quoted this amount, and Square's
    // idempotency key is tied to this row.
    const chargeAmount = Number(pendingDeposit.amount)

    // Fail closed: no connected Square account for the routed party means
    // no deposit charge — never the platform's credentials.
    const route = await resolveShopSquareAccount(supabase, {
      id: appointment.shop_id,
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
    const amountCents = BigInt(Math.round(chargeAmount * 100))

    let payment
    try {
      ;({ payment } = await withFreshSquareClient(supabase, route, (c) => c.payments.create({
        sourceId,
        idempotencyKey: `deposit-${depositId}`,
        amountMoney: { amount: amountCents, currency: 'USD' },
        locationId,
        note: `ChairOS deposit - ${service.name} for ${appointment.client_name}`,
        referenceId: `deposit:${depositId}`,
      })))
    } catch (chargeErr: any) {
      if (isSquareReconnectRequired(chargeErr)) {
        return NextResponse.json({ code: 'square_reconnect_required', error: chargeErr.message }, { status: 400 })
      }
      // Ambiguous failure (e.g. our request never got a response back from
      // Square) — do NOT delete the deposit row. It stays 'pending' within
      // its hold window; a retry reuses this same row (and its Square
      // idempotency key) so Square dedupes instead of charging twice. If
      // the charge actually succeeded at Square, the webhook will confirm
      // it. If the hold expires first, the expiration job + the webhook's
      // late-payment branch handle it safely.
      // Raw gateway error text must not reach the customer; decline-type
      // failures keep their keyword so the booking page can map them to
      // friendly copy.
      logger.error('deposit_charge_failed', { appointmentId, message: chargeErr?.message })
      return NextResponse.json({ error: safeSquareErrorMessage(chargeErr) }, { status: 500 })
    }

    if (payment?.status !== 'COMPLETED') {
      // Clean, synchronous decline — no ambiguity, nothing to hold onto.
      await supabase.from('deposits').delete().eq('id', depositId)
      return NextResponse.json({ error: 'Deposit payment was not completed', status: payment?.status }, { status: 402 })
    }

    await supabase.from('deposits').update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      square_payment_id: payment.id,
    }).eq('id', depositId)

    await supabase.from('appointments')
      .update({ status: 'confirmed' })
      .eq('id', appointmentId)
      .eq('status', 'pending')

    return NextResponse.json({ depositId, paymentId: payment.id, status: payment.status, amount: chargeAmount })
  } catch (err: any) {
    logger.error('create_deposit_failed', { appointmentId, message: err?.message })
    return NextResponse.json({ error: 'Deposit failed. Please try again.' }, { status: 500 })
  }
}
