import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { resolveSquareCredentials, squareClientFor, computeDepositAmount } from '@/lib/square'

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
  try {
    const body = await req.json() as { sourceId: string; appointmentId: string; publicShopCode?: string }
    const { sourceId, appointmentId, publicShopCode } = body

    if (!sourceId || !appointmentId) {
      return NextResponse.json({ error: 'sourceId and appointmentId are required' }, { status: 400 })
    }

    const { data: appointment, error: apptErr } = await supabase
      .from('appointments')
      .select('id, shop_id, barber_id, client_name, status, services(name, price, deposit_required)')
      .eq('id', appointmentId)
      .maybeSingle()

    if (apptErr || !appointment) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
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
    if (service.price === null || service.price === undefined) {
      return NextResponse.json({ error: 'This service has no price set yet — ask the shop to set one before booking' }, { status: 400 })
    }

    const amount = computeDepositAmount(shop.deposit_type, Number(shop.deposit_amount), Number(service.price))
    depositId = randomUUID()
    const expiresAt = new Date(Date.now() + HOLD_MINUTES * 60_000).toISOString()

    const { error: depositInsertErr } = await supabase.from('deposits').insert({
      id: depositId,
      appointment_id: appointmentId,
      shop_id: shop.id,
      amount,
      type: shop.deposit_type,
      status: 'pending',
      expires_at: expiresAt,
    })
    if (depositInsertErr) {
      return NextResponse.json({ error: depositInsertErr.message }, { status: 500 })
    }

    const { accessToken, locationId } = await resolveSquareCredentials(supabase, shop, appointment.barber_id)
    const client = squareClientFor(accessToken)
    const amountCents = BigInt(Math.round(amount * 100))

    let payment
    try {
      ;({ payment } = await client.payments.create({
        sourceId,
        idempotencyKey: `deposit-${depositId}`,
        amountMoney: { amount: amountCents, currency: 'USD' },
        locationId,
        note: `ChairOS deposit - ${service.name} for ${appointment.client_name}`,
        referenceId: `deposit:${depositId}`,
      }))
    } catch (chargeErr: any) {
      // Ambiguous failure (e.g. our request never got a response back from
      // Square) — do NOT delete the deposit row. It stays 'pending' within
      // its hold window; if the charge actually succeeded at Square, the
      // webhook will confirm it. If the hold expires first, the expiration
      // job + the webhook's late-payment branch (Task 4) handle it safely.
      return NextResponse.json({ error: chargeErr.message || 'Payment failed' }, { status: 500 })
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

    return NextResponse.json({ depositId, paymentId: payment.id, status: payment.status, amount })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Deposit failed' }, { status: 500 })
  }
}
