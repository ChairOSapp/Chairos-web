import { NextRequest, NextResponse } from 'next/server'
import { SquareClient, SquareEnvironment } from 'square'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
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
      .select('id, shop_id, price, payment_status, barber_id, client_name, services(name)')
      .eq('id', appointmentId)
      .maybeSingle()

    if (apptErr || !appointment) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
    }
    if (appointment.payment_status === 'paid') {
      return NextResponse.json({ error: 'Appointment already paid' }, { status: 409 })
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

    // Determine payment routing based on shop setting
    const { data: shop } = await supabase
      .from('shops')
      .select('id, owner_id, barbers_collect_own_payments')
      .eq('id', (appointment as any).shop_id)
      .maybeSingle()

    let accessToken = process.env.SQUARE_ACCESS_TOKEN!
    let locationId = process.env.SQUARE_LOCATION_ID!

    if (shop?.barbers_collect_own_payments && appointment.barber_id) {
      // Barber collects their own: use barber's Square account
      const { data: squareAccount } = await supabase
        .from('square_accounts')
        .select('square_access_token, square_location_id')
        .eq('user_id', appointment.barber_id)
        .maybeSingle()

      if (squareAccount?.square_access_token) {
        accessToken = squareAccount.square_access_token
        locationId = squareAccount.square_location_id || locationId
      }
    } else if (shop?.owner_id) {
      // Owner collects: use owner's Square account
      const { data: ownerSquare } = await supabase
        .from('square_accounts')
        .select('square_access_token, square_location_id')
        .eq('user_id', shop.owner_id)
        .maybeSingle()

      if (ownerSquare?.square_access_token) {
        accessToken = ownerSquare.square_access_token
        locationId = ownerSquare.square_location_id || locationId
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
