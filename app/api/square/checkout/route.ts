import { NextRequest, NextResponse } from 'next/server'
import { SquareClient, SquareEnvironment } from 'square'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { withRetry } from '@/lib/retry'
import {
  resolveShopSquareAccount,
  withFreshSquareClient,
  refreshSquareAccessToken,
  squareReconnectRequiredError,
  isSquareReconnectRequired,
  isSquareAuthError,
  isDefinitiveSquareRejection,
  squareNotConnectedMessage,
  recordCardConsent,
  safeSquareErrorMessage,
} from '@/lib/square'
import { logger } from '@/lib/logger'

const admin = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function getSquareClient(token: string) {
  // maxRetries is the SDK's own transport-level retry -- it resends the
  // exact same already-built request (including whatever idempotencyKey
  // was set once), so it can't duplicate a payment/card the way retrying
  // in application code and rebuilding the request each time could.
  return new SquareClient({
    token,
    environment: process.env.SQUARE_ENVIRONMENT === 'production'
      ? SquareEnvironment.Production
      : SquareEnvironment.Sandbox,
    maxRetries: 3,
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
    tipAmount: number       // dollars, e.g. 5.00
    discount?: number       // dollar amount off service price, e.g. 10.00
    sourceId?: string       // card nonce (manual entry or one-time)
    saveCard?: boolean      // store card on file
    useCardOnFile?: boolean // charge stored card_id
    consentText?: string    // required when saveCard: the card-on-file disclosure the client agreed to
  }

  const { appointmentId, tipAmount = 0, discount = 0, sourceId, saveCard = false, useCardOnFile = false, consentText } = body
  // Card-network stored-credential rules: the POS "save card" toggle must
  // carry the client's explicit opt-in. Fail closed.
  if (saveCard && !consentText?.trim()) {
    return NextResponse.json({ error: 'Please agree to the card-on-file terms to save this card.' }, { status: 400 })
  }

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

  // Authorization: POS checkout is always an authenticated in-shop flow —
  // the caller must be the shop's owner or the appointment's assigned
  // barber, never an unrelated authenticated user from another shop.
  const isOwner = shop?.owner_id === user.id
  const isBarber = appt.barber_id === user.id
  if (!isOwner && !isBarber) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Resolve which Square account to charge through — FAIL CLOSED. If the
  // routed party has no connected Square account, refuse the charge with
  // an actionable message. Never fall back to the platform's credentials:
  // that silently routed client money into the platform owner's account.
  const route = await resolveShopSquareAccount(admin, {
    id: appt.shop_id,
    owner_id: shop?.owner_id ?? null,
    barbers_collect_own_payments: shop?.barbers_collect_own_payments ?? false,
  }, appt.barber_id)
  if (!route) {
    const collectsOwn = Boolean(shop?.barbers_collect_own_payments && appt.barber_id)
    return NextResponse.json(
      { code: 'square_not_connected', error: squareNotConnectedMessage(collectsOwn ? 'barber' : 'shop owner') },
      { status: 400 }
    )
  }
  let squareClient = getSquareClient(route.accessToken)
  const locationId = route.locationId

  const servicePrice = parseFloat(String(appt.price)) || 0
  const serviceName = (appt as any).services?.name || 'Service'

  // A service with no price set must never be checked out as $0 (plus
  // tip). Block with an owner-actionable message instead of silently
  // undercharging -- the owner sets the price in Services, then reruns
  // checkout. The POS page mirrors this with its own blocked banner.
  if (appt.price == null) {
    return NextResponse.json(
      {
        code: 'service_price_missing',
        error: `Set a price for "${serviceName}" first — then run the checkout again.`,
        serviceName,
        settingsPath: '/dashboard/services',
      },
      { status: 400 }
    )
  }
  const tipDollars = Math.max(0, parseFloat(String(tipAmount)) || 0)
  const discountDollars = Math.max(0, Math.min(servicePrice, parseFloat(String(discount)) || 0))
  const chargeBase = servicePrice - discountDollars
  const totalCents = BigInt(Math.round((chargeBase + tipDollars) * 100))

  // paymentAttempt is read inside the try but declared here so the catch
  // block can rotate it after a clean decline.
  let paymentAttempt = 0

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

    // Idempotency key: stable per attempt. After a CLEAN decline Square
    // caches the decline for up to 24h, so a retry must rotate the key —
    // otherwise the owner could never re-charge with a good card.
    const { data: attemptRow } = await admin
      .from('appointments')
      .select('payment_attempt')
      .eq('id', appointmentId)
      .maybeSingle()
    if (typeof (attemptRow as any)?.payment_attempt === 'number') {
      paymentAttempt = (attemptRow as any).payment_attempt
    }
    const idempotencyKey = paymentAttempt > 0 ? `${appointmentId}-a${paymentAttempt}` : appointmentId

    const paymentPayload: any = {
      sourceId: finalSourceId,
      idempotencyKey,
      amountMoney: { amount: totalCents, currency: 'USD' },
      locationId,
      note: `ChairOS POS — ${serviceName} ($${servicePrice.toFixed(2)})${discountDollars > 0 ? ` − discount ($${discountDollars.toFixed(2)})` : ''} + tip ($${tipDollars.toFixed(2)}) — ${appt.client_name}`,
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
          idempotencyKey: crypto.randomUUID(),
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

    // squareClient's own maxRetries only retries on 408/429/5xx responses;
    // this outer retry additionally covers connection-level failures (DNS,
    // timeout, refused connection) that never get an HTTP response at all.
    // Safe to retry either way -- idempotencyKey is stable per attempt, so
    // Square dedupes a retry against an earlier attempt that actually
    // succeeded server-side, rather than double-charging.
    // Receipts: Square emails the client a receipt when buyerEmailAddress
    // is set (per the shop's Square receipt settings).
    if (appt.client_id) {
      const { data: receiptClient } = await admin
        .from('clients')
        .select('email')
        .eq('id', appt.client_id)
        .maybeSingle()
      if ((receiptClient as any)?.email) paymentPayload.buyerEmailAddress = (receiptClient as any).email
    }
    // withFreshSquareClient refreshes an expired OAuth token once on a 401
    // (a definitive rejection — no charge happened — so retry is safe).
    const { payment } = await withFreshSquareClient(admin, route, (c) =>
      withRetry('square_payment_create', () => c.payments.create(paymentPayload))
    )

    const paid = payment?.status === 'COMPLETED'

    // Update appointment: mark done + paid, record tip
    await admin.from('appointments').update({
      status: 'done',
      payment_status: paid ? 'paid' : 'failed',
      square_payment_id: payment?.id ?? null,
      amount_paid: paid ? chargeBase + tipDollars : null,
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
      await recordCardConsent(admin, {
        shopId: appt.shop_id,
        holderType: 'client',
        clientId: appt.client_id,
        squareCustomerId: newCustomerId,
        squareCardId: newCardId,
        scope: 'client_card_on_file',
        text: (consentText as string).trim(),
      })
    }

    return NextResponse.json({
      paymentId: payment?.id,
      status: payment?.status,
      total: chargeBase + tipDollars,
      cardSaved: paid && saveCard && !!newCardId,
    })
  } catch (err: any) {
    // The shop's Square connection died and couldn't be refreshed.
    if (isSquareReconnectRequired(err)) {
      return NextResponse.json({ code: 'square_reconnect_required', error: err.message }, { status: 400 })
    }
    // Definitive rejection (decline etc.): rotate the idempotency key so
    // the next attempt isn't a replay of Square's cached decline.
    if (isDefinitiveSquareRejection(err)) {
      await admin.from('appointments').update({ payment_attempt: paymentAttempt + 1 }).eq('id', appointmentId)
    }
    await admin.from('appointments').update({ payment_status: 'failed' }).eq('id', appointmentId)
    // Log the raw gateway error server-side; the client only ever sees the
    // gentle, customer-safe message — never a raw Square error dump.
    logger.error('Square POS checkout failed', { appointmentId, error: err?.message || String(err) })
    return NextResponse.json({ error: safeSquareErrorMessage(err) }, { status: 500 })
  }
}
