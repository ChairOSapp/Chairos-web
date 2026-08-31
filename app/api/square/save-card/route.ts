// Saves a card on file for a client during booking (no charge).
// Call this when require_card_to_book is on and client opts to save card.
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { saveCardForClient } from '@/lib/square'

const admin = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    sourceId: string
    clientId: string
    shopId: string
  }
  const { sourceId, clientId, shopId } = body
  if (!sourceId || !clientId || !shopId) {
    return NextResponse.json({ error: 'sourceId, clientId, shopId required' }, { status: 400 })
  }

  // This route is intentionally callable without a ChairOS auth session
  // (the caller is an anonymous booking client, not a logged-in barber or
  // owner), so authorization has to come from proving a real relationship
  // between clientId and shopId rather than a session check. The booking
  // flow always creates the appointment before calling this route, so
  // requiring an existing appointment for this client at this shop blocks
  // an arbitrary caller from attaching a card to a client they have no
  // relationship to, without breaking the legitimate save-during-booking flow.
  const { data: relation } = await admin
    .from('appointments')
    .select('id')
    .eq('client_id', clientId)
    .eq('shop_id', shopId)
    .limit(1)
    .maybeSingle()

  if (!relation) {
    return NextResponse.json({ error: 'Client is not associated with this shop' }, { status: 403 })
  }

  const result = await saveCardForClient(admin, clientId, shopId, sourceId)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status || 500 })
  return NextResponse.json({ saved: true, last4: result.last4, brand: result.brand })
}
