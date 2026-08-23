import { SquareClient, SquareEnvironment } from 'square'
import { SupabaseClient } from '@supabase/supabase-js'

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
