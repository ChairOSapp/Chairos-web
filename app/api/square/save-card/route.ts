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
    appointmentId?: string
    consent?: boolean
    consentText?: string
  }
  const { sourceId, clientId, shopId, appointmentId, consent, consentText } = body
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
  // owner), so authorization has to come from the appointment the caller
  // just created. The body-supplied clientId is never trusted on its own
  // (M2) — it must match the appointment's client_id.
  if (!appointmentId) {
    return NextResponse.json({ error: 'appointmentId required' }, { status: 400 })
  }
  const { data: appt } = await admin
    .from('appointments')
    .select('id, client_id, barber_id, shop_id')
    .eq('id', appointmentId)
    .eq('shop_id', shopId)
    .maybeSingle()

  if (!appt || appt.client_id !== clientId) {
    return NextResponse.json({ error: 'Appointment does not match this client' }, { status: 403 })
  }

  const relation = { id: appt.id, barber_id: appt.barber_id }

  // Route the saved card to the same merchant that will charge it (the
  // barber's Square account when barbers collect their own payments) — a
  // card saved under the wrong merchant can't be charged later.
  const result = await saveCardForClient(admin, clientId, shopId, sourceId, { scope: 'client_card_on_file', text: consentText.trim() }, (relation as any)?.barber_id ?? null)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status || 500 })
  return NextResponse.json({ saved: true, last4: result.last4, brand: result.brand })
}
