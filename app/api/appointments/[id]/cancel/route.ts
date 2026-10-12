import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { resolveRefundCredentials, refundSquarePayment } from '@/lib/square'
import { resolveTimeZone, nowWallClock } from '@/lib/wallclock'
import { triggerWaitlistOutreach } from '@/lib/waitlistNotify'
import { sendNotification, formatApptWhen } from '@/lib/notify'
import { logger } from '@/lib/logger'

function getSupabase() {
  return createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = getSupabase()
  const { id: appointmentId } = await params

  let reason: string | undefined
  let tzRaw: unknown
  try {
    const body = await req.json()
    reason = typeof body?.reason === 'string' ? body.reason.slice(0, 500) : undefined
    tzRaw = body?.tz
  } catch {
    // No body / not JSON — reason is optional, proceed without one.
  }

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
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: appointment, error: apptErr } = await supabase
    .from('appointments')
    .select('id, shop_id, barber_id, service_id, date, time, status, client_name')
    .eq('id', appointmentId)
    .maybeSingle()
  if (apptErr || !appointment) {
    return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
  }
  if (appointment.status === 'cancelled') {
    return NextResponse.json({ cancelled: true, refunded: false, note: 'already cancelled' })
  }

  const { data: shop } = await supabase
    .from('shops')
    .select('owner_id, barbers_collect_own_payments, deposit_refund_window_hours, waitlist_min_notice_hours, cancellation_window_hours')
    .eq('id', appointment.shop_id)
    .maybeSingle()
  if (!shop) {
    return NextResponse.json({ error: 'Shop not found' }, { status: 404 })
  }

  // Late-cancel policy: cancelling inside the shop's cancellation window
  // flags the appointment so the owner can see (and report on) short-notice
  // cancellations. The deposit refund window is a separate, money-specific
  // knob and keeps its own logic below.
  //
  // The appointment's date/time are shop wall-clock, but this server runs
  // on UTC — parsing them with `new Date()` understated the time until
  // the appointment by the shop's whole UTC offset (4–8 hours for US
  // shops), denying refunds the shop's own policy promises and flagging
  // late cancels early. When the caller sends its timezone (the dashboard
  // does), compare wall clocks in that zone: both sides are naive
  // timestamps parsed the same way, so the difference is the true gap.
  // Without a tz, fall back to the legacy server-time math.
  let hoursUntilAppointment = (new Date(`${appointment.date}T${appointment.time}`).getTime() - Date.now()) / (60 * 60 * 1000)
  if (typeof tzRaw === 'string' && tzRaw) {
    const apptWallMs = Date.parse(`${appointment.date}T${appointment.time}`)
    const nowWallMs = Date.parse(nowWallClock(resolveTimeZone(tzRaw)))
    if (!Number.isNaN(apptWallMs) && !Number.isNaN(nowWallMs)) {
      hoursUntilAppointment = (apptWallMs - nowWallMs) / (60 * 60 * 1000)
    }
  }
  const lateCancel = hoursUntilAppointment < (shop.cancellation_window_hours ?? 24)

  const isOwner = shop.owner_id === user.id
  const isBarber = appointment.barber_id === user.id
  if (!isOwner && !isBarber) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: paidDeposit } = await supabase
    .from('deposits')
    .select('id, amount, square_payment_id')
    .eq('appointment_id', appointmentId)
    .eq('status', 'paid')
    .maybeSingle()

  let refunded = false
  if (paidDeposit?.square_payment_id) {
    const withinRefundWindow = hoursUntilAppointment >= (shop.deposit_refund_window_hours ?? 48)

    if (withinRefundWindow) {
      try {
        // Idempotency key matches the Square webhook's late-refund path
        // (`deposit-refund-<deposit id>`): if a manual cancel races the
        // deposit-hold expiration job, Square dedupes to a single refund
        // instead of issuing two.
        // Refund routing is legacy-aware: pre-fix deposits may live under
        // the platform merchant, so fall back to platform credentials only
        // for the refund (returning money, never taking it).
        await refundSquarePayment(
          (await resolveRefundCredentials(supabase, shop, appointment.barber_id)).accessToken,
          paidDeposit.square_payment_id,
          Number(paidDeposit.amount),
          `deposit-refund-${paidDeposit.id}`,
          'Appointment cancelled within refund window'
        )
        await supabase.from('deposits').update({
          status: 'refunded',
          refunded_at: new Date().toISOString(),
        }).eq('id', paidDeposit.id)
        refunded = true
      } catch (err: any) {
        return NextResponse.json({ error: `Refund failed: ${err.message}` }, { status: 502 })
      }
    }
  }

  const { error: cancelUpdateErr } = await supabase.from('appointments').update({
    status: 'cancelled',
    late_cancel: lateCancel,
    ...(reason ? { cancellation_reason: reason } : {}),
  }).eq('id', appointmentId)

  // The refund (if any) has already gone out above, so a failed update
  // must not be reported as a successful cancel: the appointment would
  // stay active with its slot blocked AND the client would have their
  // deposit back. Fail loudly instead — a retry is safe (the deposit row
  // is already 'refunded', so it cannot refund twice) — and never fire
  // waitlist outreach for a slot that is not actually free.
  if (cancelUpdateErr) {
    logger.error('cancel_status_update_failed', { appointmentId, refunded, message: cancelUpdateErr.message })
    return NextResponse.json({
      error: refunded
        ? 'The deposit was refunded, but the cancellation did not save. Try cancelling again — the deposit will not be refunded twice.'
        : 'The cancellation did not save. Please try again.',
      refunded,
    }, { status: 500 })
  }

  await triggerWaitlistOutreach(
    supabase,
    appointment,
    shop.waitlist_min_notice_hours ?? 4,
    typeof tzRaw === 'string' && tzRaw ? resolveTimeZone(tzRaw) : undefined
  )

  // Tell the barber when someone else cancelled their appointment
  // (owner, or a client via the portal). If the barber cancelled it
  // themselves, they already know.
  if (appointment.barber_id && user.id !== appointment.barber_id) {
    try {
      let serviceName: string | null = null
      if (appointment.service_id) {
        const { data: svc } = await supabase
          .from('services')
          .select('name')
          .eq('id', appointment.service_id)
          .maybeSingle()
        serviceName = svc?.name ?? null
      }
      await sendNotification({
        userId: appointment.barber_id,
        shopId: appointment.shop_id,
        type: 'booking_cancelled',
        title: 'Booking cancelled',
        body: `${appointment.client_name || 'A client'} cancelled${serviceName ? ` their ${serviceName}` : ''} — ${formatApptWhen(appointment.date, appointment.time)}.`,
        link: `/dashboard/calendar?appt=${appointmentId}`,
      })
    } catch (err) {
      logger.warn('cancel_notify_failed', { error: String(err), appointmentId })
    }
  }

  return NextResponse.json({ cancelled: true, refunded, lateCancel })
}
