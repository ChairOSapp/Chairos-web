import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { resolveRefundCredentials, refundSquarePayment } from '@/lib/square'
import { triggerWaitlistOutreach } from '@/lib/waitlistNotify'
import { sendNotification, formatApptWhen } from '@/lib/notify'
import { logger } from '@/lib/logger'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: appointmentId } = await params

  let reason: string | undefined
  try {
    const body = await req.json()
    reason = typeof body?.reason === 'string' ? body.reason.slice(0, 500) : undefined
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
  const apptDateTime = new Date(`${appointment.date}T${appointment.time}`)
  const hoursUntilAppointment = (apptDateTime.getTime() - Date.now()) / (60 * 60 * 1000)
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

  await supabase.from('appointments').update({
    status: 'cancelled',
    late_cancel: lateCancel,
    ...(reason ? { cancellation_reason: reason } : {}),
  }).eq('id', appointmentId)

  await triggerWaitlistOutreach(supabase, appointment, shop.waitlist_min_notice_hours ?? 4)

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
