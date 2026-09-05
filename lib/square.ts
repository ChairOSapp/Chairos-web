import { SquareClient, SquareEnvironment } from 'square'
import { SupabaseClient } from '@supabase/supabase-js'

export interface SaveCardResult {
  ok: boolean
  error?: string
  status?: number
  last4?: string
  brand?: string
}

/**
 * Tokenizes and saves a card on file for a client against a specific
 * shop's Square account, shared by the public booking flow
 * (/api/square/save-card) and the client portal (/api/portal/save-card) --
 * each route does its own authorization before calling this, since the
 * two callers trust very different things (an appointment relationship
 * vs. a verified portal session).
 */
export async function saveCardForClient(
  admin: SupabaseClient,
  clientId: string,
  shopId: string,
  sourceId: string
): Promise<SaveCardResult> {
  const { data: client } = await admin
    .from('clients')
    .select('square_customer_id, full_name, phone, email')
    .eq('id', clientId)
    .maybeSingle()
  if (!client) return { ok: false, error: 'Client not found', status: 404 }

  const { data: shop } = await admin.from('shops').select('owner_id').eq('id', shopId).maybeSingle()
  let accessToken = process.env.SQUARE_ACCESS_TOKEN!
  let locationId = process.env.SQUARE_LOCATION_ID!
  if (shop?.owner_id) {
    const { data: sq } = await admin
      .from('square_accounts')
      .select('square_access_token, square_location_id')
      .eq('user_id', shop.owner_id)
      .maybeSingle()
    if (sq?.square_access_token) { accessToken = sq.square_access_token; locationId = sq.square_location_id || locationId }
  }
  void locationId // reserved for parity with other Square routes; card creation doesn't need it

  // maxRetries is the SDK's own transport-level retry -- it resends the
  // exact same already-built request on a transient failure, including
  // whatever idempotencyKey the card-create call below set once, so it
  // can't end up saving the same card twice.
  const squareClient = new SquareClient({
    token: accessToken,
    environment: squareEnvironment(),
    maxRetries: 3,
  })

  try {
    let customerId = client.square_customer_id
    if (!customerId) {
      const { customer } = await squareClient.customers.create({
        givenName: client.full_name?.split(' ')[0] || '',
        familyName: client.full_name?.split(' ').slice(1).join(' ') || '',
        phoneNumber: client.phone || undefined,
        emailAddress: client.email || undefined,
      })
      customerId = customer?.id || null
    }
    if (!customerId) return { ok: false, error: 'Could not create Square customer', status: 500 }

    const { card } = await squareClient.cards.create({
      idempotencyKey: `save-${clientId}-${Date.now()}`,
      sourceId,
      card: { customerId },
    })

    await admin.from('clients').update({
      square_customer_id: customerId,
      square_card_id: card?.id ?? null,
      square_card_brand: card?.cardBrand ?? null,
      square_card_last4: card?.last4 ?? null,
    }).eq('id', clientId)

    return { ok: true, last4: card?.last4, brand: card?.cardBrand }
  } catch (err: any) {
    return { ok: false, error: err.message, status: 500 }
  }
}

/**
 * Tokenizes and saves a card on file for a renting barber, against the
 * shop owner's Square account (the owner is who collects rent, regardless
 * of barbers_collect_own_payments -- that setting only affects who
 * collects client payments). Mirrors saveCardForClient's shape.
 */
export async function saveCardForBarber(
  admin: SupabaseClient,
  shopBarberId: string,
  sourceId: string
): Promise<SaveCardResult> {
  const { data: shopBarber } = await admin
    .from('shop_barbers')
    .select('id, shop_id, barber_name, alias, square_customer_id')
    .eq('id', shopBarberId)
    .maybeSingle()
  if (!shopBarber) return { ok: false, error: 'Staff record not found', status: 404 }

  const { data: shop } = await admin.from('shops').select('owner_id').eq('id', shopBarber.shop_id).maybeSingle()
  if (!shop?.owner_id) return { ok: false, error: 'Shop not found', status: 404 }

  const { data: ownerSquare } = await admin
    .from('square_accounts')
    .select('square_access_token')
    .eq('user_id', shop.owner_id)
    .maybeSingle()
  if (!ownerSquare?.square_access_token) return { ok: false, error: 'Shop owner has not connected Square', status: 400 }

  const squareClient = new SquareClient({
    token: ownerSquare.square_access_token,
    environment: squareEnvironment(),
    maxRetries: 3,
  })

  try {
    let customerId = shopBarber.square_customer_id
    if (!customerId) {
      const { customer } = await squareClient.customers.create({
        givenName: shopBarber.barber_name || shopBarber.alias || 'Staff',
      })
      customerId = customer?.id || null
    }
    if (!customerId) return { ok: false, error: 'Could not create Square customer', status: 500 }

    const { card } = await squareClient.cards.create({
      idempotencyKey: `save-barber-${shopBarberId}-${Date.now()}`,
      sourceId,
      card: { customerId },
    })

    await admin.from('shop_barbers').update({
      square_customer_id: customerId,
      square_card_id: card?.id ?? null,
      square_card_brand: card?.cardBrand ?? null,
      square_card_last4: card?.last4 ?? null,
    }).eq('id', shopBarberId)

    return { ok: true, last4: card?.last4, brand: card?.cardBrand }
  } catch (err: any) {
    return { ok: false, error: err.message, status: 500 }
  }
}

export function squareEnvironment() {
  return process.env.SQUARE_ENVIRONMENT === 'production' ? SquareEnvironment.Production : SquareEnvironment.Sandbox
}

export function squareClientFor(accessToken: string) {
  return new SquareClient({ token: accessToken, environment: squareEnvironment() })
}

/**
 * Resolves which Square account should be charged for an appointment,
 * mirroring the routing rule used by /api/square/create-payment and
 * /api/square/checkout: if the shop lets barbers collect their own
 * payments and the appointment has a barber, use the barber's connected
 * Square account; otherwise use the shop owner's. Falls back to the
 * platform-level env credentials if no square_accounts row exists.
 */
export async function resolveSquareCredentials(
  supabase: SupabaseClient,
  shop: { owner_id: string | null; barbers_collect_own_payments?: boolean | null },
  barberId?: string | null
): Promise<{ accessToken: string; locationId: string }> {
  let accessToken = process.env.SQUARE_ACCESS_TOKEN!
  let locationId = process.env.SQUARE_LOCATION_ID!

  if (shop.barbers_collect_own_payments && barberId) {
    const { data: squareAccount } = await supabase
      .from('square_accounts')
      .select('square_access_token, square_location_id')
      .eq('user_id', barberId)
      .maybeSingle()
    if (squareAccount?.square_access_token) {
      accessToken = squareAccount.square_access_token
      locationId = squareAccount.square_location_id || locationId
    }
  } else if (shop.owner_id) {
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

  return { accessToken, locationId }
}

/** Computes a deposit amount in dollars from the shop's deposit settings and the service price. */
export function computeDepositAmount(depositType: 'flat' | 'percent', depositAmount: number, servicePrice: number): number {
  return depositType === 'flat' ? depositAmount : Math.round(servicePrice * (depositAmount / 100) * 100) / 100
}

/** Refunds a completed Square payment in full. Used for the Task 4 late-payment race and Task 6 cancellation refunds. */
export async function refundSquarePayment(
  accessToken: string,
  paymentId: string,
  amountDollars: number,
  idempotencyKey: string,
  reason: string
) {
  const client = squareClientFor(accessToken)
  const amountCents = BigInt(Math.round(amountDollars * 100))
  return client.refunds.refundPayment({
    idempotencyKey,
    paymentId,
    amountMoney: { amount: amountCents, currency: 'USD' },
    reason,
  })
}
