import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  computeBookingPrice,
  isSlotAvailable,
  redeemReward,
  restoreReward,
} from '@/lib/server-pricing'
import { timeStrToMinutes } from '@/lib/availability'
import { logger } from '@/lib/logger'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

interface CreateBody {
  shopCode: string
  serviceId: string
  barberId?: string | null
  /** YYYY-MM-DD */
  date: string
  /** HH:MM:SS (24h) */
  time: string
  clientName: string
  clientPhone: string
  clientEmail?: string | null
  notes?: string | null
  /** referral_rewards.id the client claims; validated + redeemed server-side */
  rewardCode?: string | null
  /** client-generated per-attempt UUID; makes retries idempotent */
  idempotencyKey: string
}

// POST /api/book/create -- the only way a public (unauthenticated) booking
// is created. The price is recomputed server-side from services.price +
// pricing_rules (+ a server-validated referral reward); the slot is
// re-validated in-request; the insert uses the service-role client. The
// browser never sends a price, and anonymous INSERTs on appointments are
// no longer permitted by RLS.
export async function POST(req: NextRequest) {
  const admin = getAdmin()
  let body: CreateBody
  try {
    body = (await req.json()) as CreateBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const {
    shopCode,
    serviceId,
    barberId,
    date,
    time,
    clientName,
    clientPhone,
    clientEmail,
    notes,
    rewardCode,
    idempotencyKey,
  } = body

  if (!shopCode || !serviceId || !date || !time || !clientName?.trim() || !clientPhone?.trim() || !idempotencyKey) {
    return NextResponse.json(
      { error: 'shopCode, serviceId, date, time, clientName, clientPhone, and idempotencyKey are required' },
      { status: 400 }
    )
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}(:\d{2})?$/.test(time)) {
    return NextResponse.json({ error: 'date must be YYYY-MM-DD and time HH:MM[:SS]' }, { status: 400 })
  }
  const time24 = time.length === 5 ? `${time}:00` : time

  const { data: shop } = await admin
    .from('shops')
    .select('id, shop_code')
    .eq('shop_code', String(shopCode).toUpperCase())
    .maybeSingle()
  if (!shop) return NextResponse.json({ error: 'Shop not found' }, { status: 404 })

  const { data: service } = await admin
    .from('services')
    .select('id, active')
    .eq('id', serviceId)
    .eq('shop_id', shop.id)
    .maybeSingle()
  if (!service || !service.active) {
    return NextResponse.json({ error: 'That service is not available to book' }, { status: 400 })
  }

  if (barberId) {
    const { data: staff } = await admin
      .from('shop_barbers')
      .select('barber_id')
      .eq('shop_id', shop.id)
      .eq('barber_id', barberId)
      .eq('active', true)
      .maybeSingle()
    if (!staff) return NextResponse.json({ error: 'Selected staff member is not available' }, { status: 400 })
  }

  // Reject past dates/times server-side. Shops carry no timezone column,
  // so this is evaluated in UTC.
  const slotAt = new Date(`${date}T${time24}Z`)
  if (Number.isNaN(slotAt.getTime()) || slotAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: 'Cannot book a time in the past' }, { status: 400 })
  }

  // Idempotent replay: a retried request with the same key returns the
  // appointment the first attempt created instead of booking twice.
  const { data: replayed } = await admin
    .from('appointments')
    .select('id')
    .eq('booking_key', idempotencyKey)
    .maybeSingle()
  if (replayed) return NextResponse.json({ appointmentId: replayed.id })

  // Best-effort client linkage via the same lookup RPC the booking page
  // uses (needed to validate a claimed referral reward).
  const normalizedPhone = String(clientPhone).replace(/\D/g, '')
  let clientId: string | null = null
  if (normalizedPhone) {
    const { data: rpcData } = await admin.rpc('find_client_for_booking', {
      p_phone: normalizedPhone,
      p_shop_id: shop.id,
    })
    clientId = rpcData?.[0]?.client_id ?? null
  }

  // Server-side price: services.price + pricing_rules + validated reward.
  // Throws when the service is unbookable or the reward is invalid.
  const timeMinutes = timeStrToMinutes(time24.slice(0, 5))
  let price: Awaited<ReturnType<typeof computeBookingPrice>>
  try {
    price = await computeBookingPrice(admin, {
      serviceId,
      shopId: shop.id,
      barberId: barberId ?? null,
      rewardCode: rewardCode ?? null,
      clientId,
      dateStr: date,
      timeMinutes,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error && e.message ? e.message : 'Could not price this booking' }, { status: 400 })
  }

  // Redeem BEFORE the insert (conditional earned->redeemed flip) so a
  // reward can never be spent on two bookings. If the insert below fails,
  // restoreReward puts it back.
  const rewardId = price.reward?.id ?? null
  if (rewardId) {
    let redeemed = false
    try {
      redeemed = await redeemReward(admin, rewardId)
    } catch (e) {
      logger.error('book_create_redeem_failed', { rewardId, message: e instanceof Error ? e.message : String(e) })
      return NextResponse.json({ error: 'Could not redeem reward' }, { status: 500 })
    }
    if (!redeemed) {
      return NextResponse.json({ error: 'That reward was already used' }, { status: 409 })
    }
  }

  // Re-validate the slot in this same request -- the availability read in
  // the browser may be minutes old.
  const free = await isSlotAvailable(admin, {
    shopId: shop.id,
    dateStr: date,
    timeMinutes,
    serviceId,
    barberId: barberId ?? null,
  })
  if (!free) {
    if (rewardId) await restoreReward(admin, rewardId)
    return NextResponse.json(
      { error: 'That time was just booked. Please pick another slot.' },
      { status: 409 }
    )
  }

  const { data: inserted, error: insertErr } = await admin
    .from('appointments')
    .insert({
      shop_id: shop.id,
      barber_id: barberId ?? null,
      service_id: serviceId,
      client_id: clientId,
      client_name: clientName.trim(),
      client_phone: clientPhone,
      client_email: clientEmail || null,
      date,
      time: time24,
      price: price.finalPrice,
      status: 'pending',
      notes: notes || null,
      payment_status: 'unpaid',
      source: 'online_booking',
      booking_key: idempotencyKey,
    })
    .select('id')
    .maybeSingle()

  if (insertErr || !inserted) {
    if (rewardId) await restoreReward(admin, rewardId)
    // A concurrent request with the same key may have won the insert race
    // (unique index on booking_key) -- return its row, not an error.
    const { data: raced } = await admin
      .from('appointments')
      .select('id')
      .eq('booking_key', idempotencyKey)
      .maybeSingle()
    if (raced) return NextResponse.json({ appointmentId: raced.id })
    if (insertErr?.code === '23505') {
      // Hit the slot unique index: someone else booked this exact
      // (shop, barber, date, time) between our check and the insert.
      return NextResponse.json(
        { error: 'That time was just booked. Please pick another slot.' },
        { status: 409 }
      )
    }
    logger.error('book_create_insert_failed', { message: insertErr?.message })
    return NextResponse.json({ error: 'Booking failed. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ appointmentId: inserted.id, price: price.finalPrice })
}
