// Saves a card on file for a client during booking (no charge).
// Call this when require_card_to_book is on and client opts to save card.
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { saveCardForClient } from '@/lib/square'

function getAdmin() {
  return createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  const admin = getAdmin()
  const body = await req.json() as {
    sourceId: string
    clientId: string
    shopId: string
    consent?: boolean
    consentText?: string
  }
  const { sourceId, clientId, shopId, consent, consentText } = body
  if (!sourceId || !clientId || !shopId) {
    return NextResponse.json({ error: 'sourceId, clientId, shopId required' }, { status: 400 })
  }
  // Card-network stored-credential rules: no card goes on file without the
  // person's explicit opt-in to the disclosed terms. Fail closed.
  if (consent !== true || !consentText?.trim()) {
    return NextResponse.json({ error: 'Please agree to the card-on-file terms to save your card.' }, { status: 400 })
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
    .select('id, barber_id')
    .eq('client_id', clientId)
    .eq('shop_id', shopId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!relation) {
    return NextResponse.json({ error: 'Client is not associated with this shop' }, { status: 403 })
  }

  // Route the saved card to the same merchant that will charge it (the
  // barber's Square account when barbers collect their own payments) — a
  // card saved under the wrong merchant can't be charged later.
  const result = await saveCardForClient(admin, clientId, shopId, sourceId, { scope: 'client_card_on_file', text: consentText.trim() }, (relation as any)?.barber_id ?? null)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status || 500 })
  return NextResponse.json({ saved: true, last4: result.last4, brand: result.brand })
}
