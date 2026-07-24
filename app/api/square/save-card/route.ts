// Saves a card on file for a client during booking (no charge).
// Call this when require_card_to_book is on and client opts to save card.
import { NextRequest, NextResponse } from 'next/server'
import { SquareClient, SquareEnvironment } from 'square'
import { createClient as createAdmin } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const body = await req.json() as {
    sourceId: string
    clientId: string
    shopId: string
  }
  const { sourceId, clientId, shopId } = body
  if (!sourceId || !clientId || !shopId) {
    return NextResponse.json({ error: 'sourceId, clientId, shopId required' }, { status: 400 })
  }

  const { data: client } = await admin
    .from('clients')
    .select('square_customer_id, full_name, phone, email')
    .eq('id', clientId)
    .maybeSingle()

  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  // Authorization: confirm the client actually belongs to this shop before
  // creating/overwriting any Square card data. Clients have no shop_id column,
  // so the association is proven via a shop membership or an appointment at the
  // shop (the public booking flow creates the appointment before calling this).
  const [{ data: membership }, { data: appt }] = await Promise.all([
    admin
      .from('client_shop_memberships')
      .select('client_id')
      .eq('client_id', clientId)
      .eq('shop_id', shopId)
      .maybeSingle(),
    admin
      .from('appointments')
      .select('id')
      .eq('client_id', clientId)
      .eq('shop_id', shopId)
      .limit(1)
      .maybeSingle(),
  ])
  if (!membership && !appt) {
    return NextResponse.json({ error: 'Client does not belong to this shop' }, { status: 403 })
  }

  // Resolve Square account for this shop
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

  const squareClient = new SquareClient({
    token: accessToken,
    environment: process.env.SQUARE_ENVIRONMENT === 'production'
      ? SquareEnvironment.Production
      : SquareEnvironment.Sandbox,
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

    if (!customerId) return NextResponse.json({ error: 'Could not create Square customer' }, { status: 500 })

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

    return NextResponse.json({ saved: true, last4: card?.last4, brand: card?.cardBrand })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
