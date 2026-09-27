import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { readPortalSession } from '@/lib/portalSession'
import { resolvePortalClient } from '@/lib/portalData'
import { saveCardForClient } from '@/lib/square'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  const session = readPortalSession(req)
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { sourceId, shopId, consent, consentText, barberId } = await req.json() as {
    sourceId?: string; shopId?: string; consent?: boolean; consentText?: string; barberId?: string | null
  }
  if (!sourceId || !shopId) return NextResponse.json({ error: 'sourceId and shopId are required' }, { status: 400 })
  // Card-network stored-credential rules: no card goes on file without the
  // person's explicit opt-in to the disclosed terms. Fail closed.
  if (consent !== true || !consentText?.trim()) {
    return NextResponse.json({ error: 'Please agree to the card-on-file terms to save your card.' }, { status: 400 })
  }

  const admin = getAdmin()
  const portalClient = await resolvePortalClient(admin, session.phone)
  if (!portalClient) return NextResponse.json({ error: 'No client record found' }, { status: 404 })

  // Authorization here comes from the verified session, not a passed-in
  // clientId -- unlike /api/square/save-card (called by an anonymous
  // booking client with no session at all), so it just needs to confirm
  // shopId is really one of this client's own shop relationships.
  if (!portalClient.shops.some(s => s.shopId === shopId)) {
    return NextResponse.json({ error: 'You are not a client of this shop' }, { status: 403 })
  }

  // Per-barber shops save the card under the barber's Square merchant --
  // the same account booking and charging route to. The barber must be
  // active at this shop; a token minted against any other merchant is
  // useless for saving here, so reject it rather than mis-saving.
  let resolvedBarberId: string | null = null
  if (barberId) {
    const { data: sb } = await admin
      .from('shop_barbers')
      .select('barber_id')
      .eq('shop_id', shopId)
      .eq('barber_id', barberId)
      .eq('active', true)
      .maybeSingle()
    if (!sb) return NextResponse.json({ error: 'Barber not found at this shop' }, { status: 403 })
    resolvedBarberId = barberId
  }

  const result = await saveCardForClient(admin, portalClient.clientId, shopId, sourceId, { scope: 'client_card_on_file', text: (consentText as string).trim() }, resolvedBarberId)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status || 500 })
  return NextResponse.json({ saved: true, last4: result.last4, brand: result.brand })
}
