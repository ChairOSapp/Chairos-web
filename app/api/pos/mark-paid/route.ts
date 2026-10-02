import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { fromDollars, subtract, add, toCents } from '@/lib/money'
import { isPaymentMethod } from '@/lib/paymentMethods'

function getAdmin() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// POS checkout for payments collected OUTSIDE Square — cash in hand,
// Venmo, Zelle, Cash App, etc. No card, no Square charge. Records how the
// appointment was paid and marks it done, so cash income still flows into
// earnings, tips, and the 1099 summary.
export async function POST(req: NextRequest) {
  const admin = getAdmin()
  const cookieStore = await cookies()
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    appointmentId?: string
    tipAmount?: number
    discount?: number
    paymentMethod?: string
  }
  const { appointmentId, tipAmount = 0, discount = 0, paymentMethod } = body

  if (!appointmentId) return NextResponse.json({ error: 'appointmentId required' }, { status: 400 })
  if (!isPaymentMethod(paymentMethod) || paymentMethod === 'square') {
    return NextResponse.json({ error: 'A non-Square payment method is required' }, { status: 400 })
  }

  const { data: appt } = await admin
    .from('appointments')
    .select('id, shop_id, price, payment_status, barber_id, client_id, client_name')
    .eq('id', appointmentId)
    .maybeSingle()

  if (!appt) return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
  if (appt.payment_status === 'paid') return NextResponse.json({ error: 'Already paid' }, { status: 409 })

  const { data: shop } = await admin
    .from('shops')
    .select('id, owner_id')
    .eq('id', appt.shop_id)
    .maybeSingle()

  // Same authorization as the Square POS checkout: the shop's owner or the
  // appointment's assigned barber — never an unrelated authenticated user.
  const isOwner = shop?.owner_id === user.id
  const isBarber = appt.barber_id === user.id
  if (!isOwner && !isBarber) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (appt.price == null) {
    return NextResponse.json(
      { error: 'Set a price for this service first — then mark it paid.' },
      { status: 400 }
    )
  }

  const servicePrice = parseFloat(String(appt.price)) || 0
  const tipDollars = Math.max(0, parseFloat(String(tipAmount)) || 0)
  const discountDollars = Math.max(0, Math.min(servicePrice, parseFloat(String(discount)) || 0))
  const chargeBaseDinero = subtract(fromDollars(servicePrice), fromDollars(discountDollars))
  const chargeBase = toCents(chargeBaseDinero) / 100
  const total = toCents(add(chargeBaseDinero, fromDollars(tipDollars))) / 100

  await admin.from('appointments').update({
    status: 'done',
    payment_status: 'paid',
    payment_method: paymentMethod,
    amount_paid: total,
    tip_amount: tipDollars,
  }).eq('id', appointmentId)

  // Tips count toward barber earnings regardless of how the service was paid.
  if (tipDollars > 0 && appt.barber_id) {
    await admin.from('tips').insert({
      shop_id: appt.shop_id,
      barber_id: appt.barber_id,
      client_id: appt.client_id ?? null,
      amount: tipDollars,
      appointment_id: appointmentId,
    })
  }

  return NextResponse.json({ ok: true, total, paymentMethod })
}
