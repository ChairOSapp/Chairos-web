import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  computeBookingPrice,
  isSlotAvailable,
  redeemReward,
  resolveAvailableBarber,
  restoreReward,
} from '@/lib/server-pricing'
import { timeStrToMinutes } from '@/lib/availability'
import { resolveTimeZone, nowWallClock } from '@/lib/wallclock'
import { logger } from '@/lib/logger'
import { sendNotification, formatApptWhen } from '@/lib/notify'

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
  /** IANA time zone from the customer's browser, for the past-slot check */
  timeZone?: string | null
}

// POST /api/book/create -- the only way a public (unauthenticated) booking
// is created. The price is recomputed server-side from services.price +
// pricing_rules (+ a server-validated referral reward); an "any barber"
// request is resolved to one specific free staff member (least-loaded
// wins) so barber_id stays concrete and the slot unique index stays
// effective; the slot is re-validated in-request; the insert uses the
// service-role client. The browser never sends a price, and anonymous
// INSERTs on appointments are no longer permitted by RLS.
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
  // Specific, customer-readable validation past the presence check above:
  // a whitespace-only name or a too-short phone number must not create a
  // booking (the confirmation SMS and client lookup both depend on them).
  if (!clientName.trim()) {
    return NextResponse.json({ error: 'Please enter your name' }, { status: 400 })
  }
  if (String(clientPhone).replace(/\D/g, '').length < 10) {
    return NextResponse.json({ error: 'Please enter a valid 10-digit phone number' }, { status: 400 })
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}(:\d{2})?$/.test(time)) {
    return NextResponse.json({ error: 'date must be YYYY-MM-DD and time HH:MM[:SS]' }, { status: 400 })
  }
  const time24 = time.length === 5 ? `${time}:00` : time
  if (Number.isNaN(new Date(`${date}T${time24}Z`).getTime())) {
    return NextResponse.json({ error: 'Invalid date or time' }, { status: 400 })
  }

  const { data: shop } = await admin
    .from('shops')
    .select('id, shop_code, min_advance_minutes, max_advance_days, require_consent_form')
    .eq('shop_code', String(shopCode).toUpperCase())
    .maybeSingle()
  if (!shop) return NextResponse.json({ error: 'Shop not found' }, { status: 404 })

  const { data: service } = await admin
    .from('services')
    .select('id, active, name')
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

  // "Any barber" bookings are resolved server-side to one specific free
  // staff member at creation time (least-loaded wins). A concrete
  // barber_id on every row is what makes the slot unique index effective;
  // without it two NULL-barber bookings for the same slot would not
  // conflict at the database level.
  let resolvedBarberId: string | null = barberId ?? null
  let resolvedBarberName: string | null = null
  let barberWasResolved = false
  if (!resolvedBarberId) {
    const resolution = await resolveAvailableBarber(admin, {
      shopId: shop.id,
      dateStr: date,
      timeMinutes: timeStrToMinutes(time24.slice(0, 5)),
      serviceId,
    })
    if (resolution.kind === 'none_available') {
      return NextResponse.json(
        { error: 'No staff member is available at that time. Please pick another slot.', code: 'slot_taken' },
        { status: 409 }
      )
    }
    if (resolution.kind === 'resolved') {
      resolvedBarberId = resolution.barberId
      resolvedBarberName = resolution.barberName
      barberWasResolved = true
    }
    // 'no_staff': the shop has no active staff on record -- keep barber_id
    // NULL and fall back to shop-wide availability, as before. The
    // null-barber slot guard trigger still prevents double-booking.
  }

  // Booking rules, mirrored from /api/book/availability: the availability
  // read in the browser may be stale, so the create path re-checks the
  // shop's horizon, one-off closures, and minimum-advance window here.
  // All comparisons are wall-clock in the customer's timezone, exactly
  // like the availability route (shops carry no timezone column).
  const minAdvanceMin = shop.min_advance_minutes ?? 120
  const maxAdvanceDays = shop.max_advance_days ?? 90
  {
    const tzForRules = resolveTimeZone(body.timeZone)
    const todayStr = nowWallClock(tzForRules).slice(0, 10)
    const horizon = new Date(todayStr + 'T12:00:00')
    horizon.setDate(horizon.getDate() + maxAdvanceDays)
    const pad = (n: number) => String(n).padStart(2, '0')
    const horizonStr = `${horizon.getFullYear()}-${pad(horizon.getMonth() + 1)}-${pad(horizon.getDate())}`
    if (maxAdvanceDays > 0 && date > horizonStr) {
      return NextResponse.json({ error: `This shop only takes bookings up to ${maxAdvanceDays} days out` }, { status: 400 })
    }
    const { data: closed } = await admin
      .from('shop_date_exceptions')
      .select('id')
      .eq('shop_id', shop.id)
      .eq('date', date)
      .eq('is_closed', true)
      .maybeSingle()
    if (closed) {
      return NextResponse.json({ error: 'The shop is closed that day. Please pick another date.' }, { status: 400 })
    }
    const nowWall = nowWallClock(tzForRules)
    const [dPart, tPart] = nowWall.split('T')
    const [y, mo, da] = dPart.split('-').map(Number)
    const [h, mi, s] = tPart.split(':').map(Number)
    const cutoff = new Date(y, mo - 1, da, h, mi + minAdvanceMin, s || 0)
    const cutoffWall = `${cutoff.getFullYear()}-${pad(cutoff.getMonth() + 1)}-${pad(cutoff.getDate())}T${pad(cutoff.getHours())}:${pad(cutoff.getMinutes())}:${pad(cutoff.getSeconds())}`
    if (`${date}T${time24}` <= cutoffWall) {
      const label = minAdvanceMin >= 60 ? `${Math.round(minAdvanceMin / 60)} hours` : `${minAdvanceMin} minutes`
      return NextResponse.json({ error: `Please book at least ${label} ahead` }, { status: 400 })
    }
  }

  // Reject past dates/times server-side, evaluated in the customer's
  // timezone (their browser sends it; they're overwhelmingly local to the
  // shop). Shops carry no timezone column, so a UTC evaluation would
  // wrongly reject same-day slots that are still hours in the future for
  // western-hemisphere shops.
  const timeZone = resolveTimeZone(body.timeZone)
  const slotWall = `${date}T${time24}`
  if (slotWall <= nowWallClock(timeZone)) {
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

  // Consent gate: if the shop requires a signed consent form, the client
  // must have signed the active version before a booking can be confirmed.
  if (shop.require_consent_form) {
    const { data: activeTemplate } = await admin
      .from('consent_form_templates')
      .select('version')
      .eq('shop_id', shop.id)
      .eq('is_active', true)
      .maybeSingle()

    if (!activeTemplate) {
      return NextResponse.json(
        { error: 'This shop requires a signed consent form, but no consent form is available. Please contact the shop.' },
        { status: 400 }
      )
    }

    let hasSigned = false
    if (clientId) {
      const { data: signature } = await admin
        .from('consent_form_signatures')
        .select('id')
        .eq('shop_id', shop.id)
        .eq('client_id', clientId)
        .eq('template_version', activeTemplate.version)
        .maybeSingle()
      hasSigned = !!signature
    }

    if (!hasSigned) {
      return NextResponse.json(
        {
          error: 'CONSENT_REQUIRED',
          message: 'A signed consent form is required before booking. Please sign the consent form first.',
          shopId: shop.id,
        },
        { status: 400 }
      )
    }
  }

  // Server-side price: services.price + pricing_rules + validated reward.
  // Throws when the service is unbookable or the reward is invalid.
  const timeMinutes = timeStrToMinutes(time24.slice(0, 5))
  let price: Awaited<ReturnType<typeof computeBookingPrice>>
  try {
    price = await computeBookingPrice(admin, {
      serviceId,
      shopId: shop.id,
      barberId: resolvedBarberId,
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
  // the browser may be minutes old. Skipped when we just resolved an
  // "any barber" request: the resolution itself verified that barber's
  // freeness with this same buffer-aware logic, and the slot unique index
  // + null-barber guard trigger are the backstop for the remaining race.
  const free = barberWasResolved
    ? true
    : await isSlotAvailable(admin, {
        shopId: shop.id,
        dateStr: date,
        timeMinutes,
        serviceId,
        barberId: resolvedBarberId,
      })
  if (!free) {
    if (rewardId) await restoreReward(admin, rewardId)
    return NextResponse.json(
      { error: 'That time was just booked. Please pick another slot.', code: 'slot_taken' },
      { status: 409 }
    )
  }

  const { data: inserted, error: insertErr } = await admin
    .from('appointments')
    .insert({
      shop_id: shop.id,
      barber_id: resolvedBarberId,
      service_id: serviceId,
      client_id: clientId,
      client_name: clientName.trim(),
      client_phone: normalizedPhone,
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
    if (
      insertErr?.code === '23505' ||
      (insertErr?.message ?? '').includes('already booked')
    ) {
      // Hit the slot unique index (23505) or the null-barber slot guard
      // trigger: someone else booked this exact (shop, barber, date, time)
      // between our check and the insert.
      return NextResponse.json(
        { error: 'That time was just booked. Please pick another slot.', code: 'slot_taken' },
        { status: 409 }
      )
    }
    logger.error('book_create_insert_failed', { message: insertErr?.message })
    return NextResponse.json({ error: 'Booking failed. Please try again.' }, { status: 500 })
  }

  // Fire-and-forget: tell the barber about the new booking.
  notifyBarberOfBooking({
    appointmentId: inserted.id,
    barberId: resolvedBarberId,
    shopId: shop.id,
    clientName: clientName.trim(),
    serviceName: service.name ?? null,
    date,
    time: time24,
  })

  return NextResponse.json({
    appointmentId: inserted.id,
    price: price.finalPrice,
    barberId: resolvedBarberId,
    barberName: resolvedBarberName,
  })
}

// Notify the barber about a new online booking (in-app + push when they
// have the iOS app). Never fails the booking itself.
async function notifyBarberOfBooking(opts: {
  appointmentId: string
  barberId: string | null
  shopId: string
  clientName: string
  serviceName: string | null
  date: string
  time: string
}) {
  if (!opts.barberId) return
  try {
    await sendNotification({
      userId: opts.barberId,
      shopId: opts.shopId,
      type: 'booking',
      title: 'New booking',
      body: `${opts.clientName} booked${opts.serviceName ? ` a ${opts.serviceName}` : ''} — ${formatApptWhen(opts.date, opts.time)}.`,
      link: `/dashboard/calendar?appt=${opts.appointmentId}`,
    })
  } catch (err) {
    logger.warn('book_create_notify_failed', { error: String(err) })
  }
}
