import { NextRequest, NextResponse } from 'next/server'
import { SquareClient, SquareEnvironment } from 'square'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const admin = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function getSquareClient(token: string) {
  return new SquareClient({
    token,
    environment: process.env.SQUARE_ENVIRONMENT === 'production'
      ? SquareEnvironment.Production
      : SquareEnvironment.Sandbox,
  })
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    appointmentId: string
    tipAmount: number      // dollars, e.g. 5.00
    sourceId?: string      // card nonce (manual entry or one-time)
    saveCard?: boolean     // store card on file
    useCardOnFile?: boolean // charge stored card_id
  }

  const { appointmentId, tipAmount = 0, sourceId, saveCard = false, useCardOnFile = false } = body

  if (!appointmentId) return NextResponse.json({ error: 'appointmentId required' }, { status: 400 })
  if (!sourceId && !useCardOnFile) return NextResponse.json({ error: 'sourceId or useCardOnFile required' }, { status: 400 })

  // Load appointment + client
  const { data: appt } = await admin
    .from('appointments')
    .select('id, shop_id, price, tip_amount, payment_status, barber_id, client_id, client_name, services(name)')
    .eq('id', appointmentId)
    .maybeSingle()

  if (!appt) return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
  if (appt.payment_status === 'paid') return NextResponse.json({ error: 'Already paid' }, { status: 409 })

  const { data: shop } = await admin
    .from('shops')
    .select('id, owner_id, barbers_collect_own_payments')
    .eq('id', appt.shop_id)
    .maybeSingle()

  // Resolve which Square account to charge through
  let accessToken = process.env.SQUARE_ACCESS_TOKEN!
  let locationId = process.env.SQUARE_LOCATION_ID!

  if (shop?.barbers_collect_own_payments && appt.barber_id) {
    const { data: sq } = await admin
      .from('square_accounts')
      .select('square_access_token, square_location_id')
      .eq('user_id', appt.barber_id)
      .maybeSingle()
    if (sq?.square_access_token) { accessToken = sq.square_access_token; locationId = sq.square_location_id || locationId }
  } else if (shop?.owner_id) {
    const { data: sq } = await admin
      .from('square_accounts')
      .select('square_access_token, square_location_id')
      .eq('user_id', shop.owner_id)
      .maybeSingle()
    if (sq?.square_access_token) { accessToken = sq.square_access_token; locationId = sq.square_location_id || locationId }
  }

  const squareClient = getSquareClient(accessToken)

  const servicePrice = parseFloat(String(appt.price)) || 0
  const tipDollars = Math.max(0, parseFloat(String(tipAmount)) || 0)
  const totalCents = BigInt(Math.round((servicePrice + tipDollars) * 100))
  const serviceName = (appt as any).services?.name || 'Service'

  try {
    let finalSourceId = sourceId

    // If charging card on file, load customer + card from clients table
    if (useCardOnFile && appt.client_id) {
      const { data: client } = await admin
        .from('clients')
        .select('square_customer_id, square_card_id, square_card_last4')
        .eq('id', appt.client_id)
        .maybeSingle()

      if (!client?.square_customer_id || !client?.square_card_id) {
        return NextResponse.json({ error: 'No card on file for this client' }, { status: 400 })
      }
      // For card-on-file, sourceId is the card_id prefixed for Square
      finalSourceId = client.square_card_id
    }

    const paymentPayload: any = {
      sourceId: finalSourceId,
      idempotencyKey: `${appointmentId}-${Date.now()}`,
      amountMoney: { amount: totalCents, currency: 'USD' },
      locationId,
      note: `ChairOS POS — ${serviceName} ($${servicePrice.toFixed(2)}) + tip ($${tipDollars.toFixed(2)}) — ${appt.client_name}`,
      referenceId: appointmentId,
    }

    // If charging card on file, attach customer ID
    if (useCardOnFile && appt.client_id) {
      const { data: client } = await admin
        .from('clients')
        .select('square_customer_id')
        .eq('id', appt.client_id)
        .maybeSingle()
      if (client?.square_customer_id) paymentPayload.customerId = client.square_customer_id
    }

    // If saving card: create/find Square customer, then save card BEFORE charging
    let newCustomerId: string | null = null
    let newCardId: string | null = null
    let newCardBrand: string | null = null
    let newCardLast4: string | null = null

    if (saveCard && !useCardOnFile && appt.client_id && sourceId) {
      const { data: client } = await admin
        .from('clients')
        .select('square_customer_id, full_name, phone, email')
        .eq('id', appt.client_id)
        .maybeSingle()

      let customerId = client?.square_customer_id

      if (!customerId) {
        const { customer } = await squareClient.customers.create({
          givenName: client?.full_name?.split(' ')[0] || appt.client_name?.split(' ')[0] || '',
          familyName: client?.full_name?.split(' ').slice(1).join(' ') || appt.client_name?.split(' ').slice(1).join(' ') || '',
          phoneNumber: client?.phone || undefined,
          emailAddress: client?.email || undefined,
        })
        customerId = customer?.id || null
        newCustomerId = customerId
      }

      if (customerId) {
        const { card } = await squareClient.cards.create({
          idempotencyKey: `card-${appt.client_id}-${Date.now()}`,
          sourceId: sourceId,
          card: { customerId },
        })
        newCardId = card?.id || null
        newCardBrand = card?.cardBrand || null
        newCardLast4 = card?.last4 || null

        // Use saved card as source for the charge
        paymentPayload.customerId = customerId
        // For a new card save, we can charge the sourceId directly (one call) — Square handles it
        // after save the card is available but we still charge the nonce directly here
      }
    }

    const { payment } = await squareClient.payments.create(paymentPayload)

    const paid = payment?.status === 'COMPLETED'

    // Update appointment: mark done + paid, record tip
    await admin.from('appointments').update({
      status: 'done',
      payment_status: paid ? 'paid' : 'failed',
      square_payment_id: payment?.id ?? null,
      amount_paid: paid ? servicePrice + tipDollars : null,
      tip_amount: paid ? tipDollars : 0,
    }).eq('id', appointmentId)

    // Record tip separately for barber earnings tracking
    if (paid && tipDollars > 0 && appt.barber_id) {
      await admin.from('tips').insert({
        shop_id: appt.shop_id,
        barber_id: appt.barber_id,
        client_id: appt.client_id ?? null,
        amount: tipDollars,
        appointment_id: appointmentId,
      })
    }

    // Save card details to client if requested
    if (paid && saveCard && appt.client_id && (newCustomerId || newCardId)) {
      const update: Record<string, any> = {}
      if (newCustomerId) update.square_customer_id = newCustomerId
      if (newCardId) { update.square_card_id = newCardId; update.square_card_brand = newCardBrand; update.square_card_last4 = newCardLast4 }
      await admin.from('clients').update(update).eq('id', appt.client_id)
    }

    return NextResponse.json({
      paymentId: payment?.id,
      status: payment?.status,
      total: servicePrice + tipDollars,
      cardSaved: paid && saveCard && !!newCardId,
    })
  } catch (err: any) {
    await admin.from('appointments').update({ payment_status: 'failed' }).eq('id', appointmentId)
    return NextResponse.json({ error: err.message || 'Payment failed' }, { status: 500 })
  }
}
