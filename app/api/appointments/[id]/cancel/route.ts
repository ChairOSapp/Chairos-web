import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { resolveSquareCredentials, refundSquarePayment } from '@/lib/square'
import { triggerWaitlistOutreach } from '@/lib/waitlistNotify'

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
    .select('id, shop_id, barber_id, service_id, date, time, status')
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
    .select('owner_id, barbers_collect_own_payments, deposit_refund_window_hours, waitlist_min_notice_hours')
    .eq('id', appointment.shop_id)
    .maybeSingle()
  if (!shop) {
    return NextResponse.json({ error: 'Shop not found' }, { status: 404 })
  }

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
    const apptDateTime = new Date(`${appointment.date}T${appointment.time}`)
    const hoursUntilAppointment = (apptDateTime.getTime() - Date.now()) / (60 * 60 * 1000)
    const withinRefundWindow = hoursUntilAppointment >= (shop.deposit_refund_window_hours ?? 48)

    if (withinRefundWindow) {
      try {
        await refundSquarePayment(
          (await resolveSquareCredentials(supabase, shop, appointment.barber_id)).accessToken,
          paidDeposit.square_payment_id,
          Number(paidDeposit.amount),
          `deposit-cancel-refund-${paidDeposit.id}`,
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
    ...(reason ? { cancellation_reason: reason } : {}),
  }).eq('id', appointmentId)

  await triggerWaitlistOutreach(supabase, appointment, shop.waitlist_min_notice_hours ?? 4)

  return NextResponse.json({ cancelled: true, refunded })
}
