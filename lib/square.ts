import { SquareClient, SquareEnvironment } from 'square'
import { SupabaseClient } from '@supabase/supabase-js'
import { logger } from './logger'

export interface SaveCardResult {
  ok: boolean
  error?: string
  status?: number
  last4?: string
  brand?: string
}

/**
 * Card-on-file consent. Card-network stored-credential rules require an
 * explicit disclosure + affirmative opt-in before a card is saved for
 * future charges. Every save-card path must collect this and pass it
 * through; the exact text the person agreed to is stored verbatim.
 */
export interface CardConsent {
  /** 'client_card_on_file' (deposits + appointment payments) or 'booth_rent' (recurring rent) */
  scope: string
  /** The exact disclosure text shown to the person */
  text: string
}

export interface CardConsentRecord extends CardConsent {
  shopId: string
  holderType: 'client' | 'barber'
  clientId?: string | null
  shopBarberId?: string | null
  squareCustomerId?: string | null
  squareCardId?: string | null
}

/** Writes the consent record for a newly saved card. Best-effort: the
 *  person already consented (the text arrived with the request), so a DB
 *  hiccup must not fake a failed save — it logs loudly instead. */
export async function recordCardConsent(admin: SupabaseClient, r: CardConsentRecord): Promise<void> {
  try {
    const { error } = await admin.from('card_file_consents').insert({
      shop_id: r.shopId,
      holder_type: r.holderType,
      client_id: r.clientId ?? null,
      shop_barber_id: r.shopBarberId ?? null,
      square_customer_id: r.squareCustomerId ?? null,
      square_card_id: r.squareCardId ?? null,
      consent_scope: r.scope,
      consent_text: r.text,
    })
    if (error) throw error
  } catch (err: any) {
    logger.error('card_consent_record_failed', {
      shopId: r.shopId, holderType: r.holderType, scope: r.scope,
      message: err?.message || String(err),
    })
  }
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
  sourceId: string,
  consent: CardConsent,
  barberId?: string | null
): Promise<SaveCardResult> {
  if (!consent?.text || !consent?.scope) {
    return { ok: false, error: 'Card-on-file consent is required', status: 400 }
  }
  const { data: client } = await admin
    .from('clients')
    .select('square_customer_id, full_name, phone, email')
    .eq('id', clientId)
    .maybeSingle()
  if (!client) return { ok: false, error: 'Client not found', status: 404 }

  const { data: shop } = await admin.from('shops').select('id, owner_id, barbers_collect_own_payments').eq('id', shopId).maybeSingle()
  // Fail closed: a saved card must live under the SHOP's Square merchant.
  // Saving it under the platform's credentials would orphan the card from
  // the shop that will charge it.
  const collectsOwn = Boolean((shop as any)?.barbers_collect_own_payments && barberId)
  const route = await resolveShopSquareAccount(admin, {
    id: shopId,
    owner_id: shop?.owner_id ?? null,
    barbers_collect_own_payments: (shop as any)?.barbers_collect_own_payments ?? false,
  }, barberId)
  if (!route) {
    return { ok: false, error: squareNotConnectedMessage(collectsOwn ? 'barber' : 'shop owner'), status: 400 }
  }
  const accessToken = route.accessToken
  void route.locationId // card creation is merchant-scoped via the token; no location needed

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

    await recordCardConsent(admin, {
      shopId,
      holderType: 'client',
      clientId,
      squareCustomerId: customerId,
      squareCardId: card?.id ?? null,
      scope: consent.scope,
      text: consent.text,
    })

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
  sourceId: string,
  consent: CardConsent
): Promise<SaveCardResult> {
  if (!consent?.text || !consent?.scope) {
    return { ok: false, error: 'Card-on-file consent is required', status: 400 }
  }
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

    await recordCardConsent(admin, {
      shopId: shopBarber.shop_id,
      holderType: 'barber',
      shopBarberId,
      squareCustomerId: customerId,
      squareCardId: card?.id ?? null,
      scope: consent.scope,
      text: consent.text,
    })

    return { ok: true, last4: card?.last4, brand: card?.cardBrand }
  } catch (err: any) {
    return { ok: false, error: err.message, status: 500 }
  }
}

export function squareEnvironment() {
  return process.env.SQUARE_ENVIRONMENT === 'production' ? SquareEnvironment.Production : SquareEnvironment.Sandbox
}

function squareOAuthTokenUrl() {
  return process.env.SQUARE_ENVIRONMENT === 'production'
    ? 'https://connect.squareup.com/oauth2/token'
    : 'https://connect.squareupsandbox.com/oauth2/token'
}

export function squareClientFor(accessToken: string) {
  return new SquareClient({ token: accessToken, environment: squareEnvironment() })
}

/**
 * Which Square account a charge/tokenization should route through.
 * THE single routing rule for all money paths (charges, deposits, the
 * card widget, saved cards): if the shop lets barbers collect their own
 * payments and a barber is in play, use the barber's connected Square
 * account; otherwise the shop owner's.
 */
export interface ShopSquareRoute {
  /** square_accounts.user_id whose OAuth token is used */
  userId: string
  accessToken: string
  locationId: string
  kind: 'owner' | 'barber'
}

/**
 * Fail-closed Square account resolution. Returns null when the routed
 * party (owner, or barber when barbers collect their own) has NO
 * connected Square account. Callers must refuse the money operation
 * with an actionable "connect Square" message — NEVER silently fall
 * back to the platform's credentials (that routed client money into
 * the platform owner's Square account with no warning).
 *
 * If the row exists but has no location stored (older connections), the
 * first active Square location is looked up and persisted.
 */
export async function resolveShopSquareAccount(
  admin: SupabaseClient,
  shop: { id?: string; owner_id: string | null; barbers_collect_own_payments?: boolean | null },
  barberId?: string | null
): Promise<ShopSquareRoute | null> {
  let userId: string | null = null
  let kind: 'owner' | 'barber' = 'owner'

  if (shop.barbers_collect_own_payments && barberId) {
    userId = barberId
    kind = 'barber'
  } else if (shop.owner_id) {
    userId = shop.owner_id
    kind = 'owner'
  }
  if (!userId) return null

  const { data: row } = await admin
    .from('square_accounts')
    .select('user_id, square_access_token, square_refresh_token, square_location_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (!row?.square_access_token) return null

  let locationId = row.square_location_id as string | null
  if (!locationId) {
    // Older connections may not have a location stored — look it up once
    // and persist it so every later call is a pure DB read.
    locationId = await fetchAndPersistLocationId(admin, userId, row.square_access_token)
    if (!locationId) return null
  }

  return { userId, accessToken: row.square_access_token, locationId, kind }
}

async function fetchAndPersistLocationId(
  admin: SupabaseClient,
  userId: string,
  accessToken: string
): Promise<string | null> {
  try {
    const client = squareClientFor(accessToken)
    const { locations } = await client.locations.list()
    const primary = locations?.find((l: any) => l.status === 'ACTIVE') ?? locations?.[0]
    const id = (primary as any)?.id ?? null
    if (id) {
      await admin.from('square_accounts').update({ square_location_id: id }).eq('user_id', userId)
    }
    return id
  } catch {
    return null
  }
}

/**
 * Refreshes an expired OAuth access token using the stored refresh token
 * and persists the new pair. Returns the new access token, or null when
 * refresh is impossible (no refresh token, revoked, etc.) — the caller
 * must then tell the user to reconnect Square.
 */
export async function refreshSquareAccessToken(
  admin: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data: row } = await admin
    .from('square_accounts')
    .select('square_refresh_token')
    .eq('user_id', userId)
    .maybeSingle()
  const refreshToken = row?.square_refresh_token as string | null
  if (!refreshToken) return null

  try {
    const res = await fetch(squareOAuthTokenUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Square-Version': '2024-01-18' },
      body: JSON.stringify({
        client_id: process.env.SQUARE_APPLICATION_ID,
        client_secret: process.env.SQUARE_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data?.access_token) return null

    await admin
      .from('square_accounts')
      .update({
        square_access_token: data.access_token,
        square_refresh_token: data.refresh_token ?? refreshToken,
        connected_at: new Date().toISOString(),
      })
      .eq('user_id', userId)

    return data.access_token as string
  } catch {
    return null
  }
}

/** True when a Square SDK error means the OAuth token was rejected (expired/revoked). */
export function isSquareAuthError(err: any): boolean {
  return err?.statusCode === 401
}

/** Marker error thrown when the Square connection needs a manual reconnect. */
export function squareReconnectRequiredError(): any {
  const e: any = new Error('Square connection expired. Reconnect Square in Settings to keep taking cards.')
  e.code = 'square_reconnect_required'
  return e
}

export function isSquareReconnectRequired(err: any): boolean {
  return err?.code === 'square_reconnect_required'
}

/**
 * Runs a Square SDK operation with a routed account, transparently
 * refreshing the OAuth token once on a 401 and retrying. A 401 means the
 * request was REJECTED before processing, so the retry cannot double-charge.
 * Throws square_reconnect_required when refresh is impossible.
 */
export async function withFreshSquareClient<T>(
  admin: SupabaseClient,
  route: ShopSquareRoute,
  op: (client: SquareClient) => Promise<T>
): Promise<T> {
  try {
    return await op(squareClientFor(route.accessToken))
  } catch (err: any) {
    if (!isSquareAuthError(err)) throw err
    const fresh = await refreshSquareAccessToken(admin, route.userId)
    if (!fresh) throw squareReconnectRequiredError()
    return op(squareClientFor(fresh))
  }
}

/**
 * Refund routing. Refunds RETURN money, so the priority is inverted from
 * charges: use the routed shop account when connected; fall back to the
 * platform credentials ONLY for legacy payments taken before per-shop
 * fail-closed routing existed (those charges live under the platform
 * merchant and can only be refunded with the platform token). Failing to
 * refund a customer is worse than using the legacy credential.
 */
export async function resolveRefundCredentials(
  admin: SupabaseClient,
  shop: { owner_id: string | null; barbers_collect_own_payments?: boolean | null },
  barberId?: string | null
): Promise<{ accessToken: string; legacy: boolean }> {
  const route = await resolveShopSquareAccount(admin, shop, barberId)
  if (route) return { accessToken: route.accessToken, legacy: false }
  return { accessToken: process.env.SQUARE_ACCESS_TOKEN!, legacy: true }
}

/** Shared copy for "no Square connected" failures. `who` names the party that must connect. */
export function squareNotConnectedMessage(who: 'shop owner' | 'barber'): string {
  return who === 'shop owner'
    ? 'This shop has not connected Square yet. The shop owner can connect it in Settings → Payments.'
    : 'This barber has not connected Square yet. They can connect it in their chair settings.'
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

/**
 * True when a Square SDK error definitively means "no charge happened":
 * any 4xx (the payment was rejected before processing -- decline, bad
 * nonce, bad amount) or a payment-method error code. 5xx, 429s, timeouts
 * and network errors are AMBIGUOUS (Square may have charged) and must
 * keep the idempotency key stable so a retry dedupes instead of
 * double-charging.
 */
export function isDefinitiveSquareRejection(err: any): boolean {
  const statusCode = err?.statusCode
  if (typeof statusCode === 'number') {
    if (statusCode >= 400 && statusCode < 500) return true
    return false
  }
  const codes: string[] = (err?.errors || []).map((e: any) => String(e?.code || ''))
  return codes.some((c) =>
    /DECLINED|INSUFFICIENT|EXPIRED|INVALID|CVV|CVC|CARD_|PAYMENT_METHOD/i.test(c)
  )
}

/**
 * Maps a raw Square/gateway error to a customer-safe message. The booking
 * UI keys its friendly copy off keywords ('declined', 'insufficient',
 * ...), so those are preserved; everything else collapses to a generic
 * message instead of leaking raw SDK text to customers.
 */
export function safeSquareErrorMessage(err: any): string {
  const raw = String(err?.message || '')
  const detail = (err?.errors || [])
    .map((e: any) => `${e?.code || ''} ${e?.detail || ''}`)
    .join(' ')
  const hay = `${raw} ${detail}`.toLowerCase()
  // Keep the 'declined'/'insufficient' keywords: the booking UI keys its
  // friendly copy off them. Copy is deliberately gentle — a decline is
  // never the client's fault to be embarrassed about.
  if (hay.includes('declin')) return 'Your card was declined. Nothing was charged, and you are welcome to try a different card.'
  if (hay.includes('insufficient')) return 'There are insufficient funds for this one. Nothing was charged, so feel free to try a different card.'
  if (hay.includes('expired')) return 'This card looks expired. Nothing was charged.'
  if (hay.includes('cvv') || hay.includes('cvc') || hay.includes('security code')) {
    return 'The security code (CVV) does not match. Nothing was charged. Mind double-checking it?'
  }
  return 'That did not go through. Nothing was charged. Please try again or use a different card.'
}
