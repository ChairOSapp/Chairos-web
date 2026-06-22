import { NextRequest, NextResponse } from 'next/server'
import { SquareClient, SquareEnvironment } from 'square'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  let appointmentId = ''
  try {
    const body = await req.json() as { sourceId: string; appointmentId: string }
    const { sourceId } = body
    appointmentId = body.appointmentId

    if (!sourceId || !appointmentId) {
      return NextResponse.json({ error: 'sourceId and appointmentId are required' }, { status: 400 })
    }

    const { data: appointment, error: apptErr } = await supabase
      .from('appointments')
      .select('id, price, payment_status, barber_id, client_name, services(name)')
      .eq('id', appointmentId)
      .maybeSingle()

    if (apptErr || !appointment) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
    }
    if (appointment.payment_status === 'paid') {
      return NextResponse.json({ error: 'Appointment already paid' }, { status: 409 })
    }

    // Prefer barber's own Square account; fall back to shop default
    let accessToken = process.env.SQUARE_ACCESS_TOKEN!
    let locationId = process.env.SQUARE_LOCATION_ID!

    if (appointment.barber_id) {
      const { data: squareAccount } = await supabase
        .from('square_accounts')
        .select('square_access_token, square_location_id')
        .eq('user_id', appointment.barber_id)
        .maybeSingle()

      if (squareAccount?.square_access_token) {
        accessToken = squareAccount.square_access_token
        locationId = squareAccount.square_location_id || locationId
      }
    }

    const client = new SquareClient({
      token: accessToken,
      environment: process.env.SQUARE_ENVIRONMENT === 'production'
        ? SquareEnvironment.Production
        : SquareEnvironment.Sandbox,
    })

    const amountCents = BigInt(Math.round(parseFloat(appointment.price) * 100))
    const serviceName = (appointment as any).services?.name || 'Appointment'

    const { payment } = await client.payments.create({
      sourceId,
      idempotencyKey: `${appointmentId}-${Date.now()}`,
      amountMoney: { amount: amountCents, currency: 'USD' },
      locationId,
      note: `ChairOS - ${serviceName} for ${appointment.client_name}`,
      referenceId: appointmentId,
    })

    await supabase
      .from('appointments')
      .update({
        payment_status: payment?.status === 'COMPLETED' ? 'paid' : 'failed',
        square_payment_id: payment?.id ?? null,
        amount_paid: payment?.status === 'COMPLETED' ? parseFloat(appointment.price) : null,
      })
      .eq('id', appointmentId)

    return NextResponse.json({ paymentId: payment?.id, status: payment?.status })
  } catch (err: any) {
    if (appointmentId) {
      await supabase
        .from('appointments')
        .update({ payment_status: 'failed' })
        .eq('id', appointmentId)
    }
    return NextResponse.json({ error: err.message || 'Payment failed' }, { status: 500 })
  }
}
