import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { readPortalSession } from '@/lib/portalSession'
import { resolvePortalClient } from '@/lib/portalData'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Per-shop card-on-file status for the signed-in portal client -- the
// "wallet" view. Square cards live under the merchant that saved them,
// so a card is only usable at a shop when the client's current card is
// the one saved there. The latest card_file_consents row per shop tells
// us which card that was; comparing it to the client's current
// square_card_id gives an honest per-shop status:
//
//   current -- this shop has the client's current card on file
//   stale   -- the client saved a card here before, but has since saved
//              a newer card elsewhere (charge flows use the current one)
//   none    -- never saved a card for this shop
export async function GET(req: NextRequest) {
  const session = readPortalSession(req)
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const admin = getAdmin()
  const portalClient = await resolvePortalClient(admin, session.phone)
  if (!portalClient) return NextResponse.json({ error: 'No client record found' }, { status: 404 })

  const cards: { shopId: string; status: 'current' | 'stale' | 'none'; brand: string | null; last4: string | null }[] = []
  for (const s of portalClient.shops) {
    const { data: consent } = await admin
      .from('card_file_consents')
      .select('square_card_id')
      .eq('holder_type', 'client')
      .eq('client_id', portalClient.clientId)
      .eq('shop_id', s.shopId)
      .order('consented_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    let status: 'current' | 'stale' | 'none' = 'none'
    if (consent?.square_card_id && portalClient.squareCardId) {
      status = consent.square_card_id === portalClient.squareCardId ? 'current' : 'stale'
    }
    cards.push({
      shopId: s.shopId,
      status,
      brand: status === 'current' ? portalClient.squareCardBrand : null,
      last4: status === 'current' ? portalClient.squareCardLast4 : null,
    })
  }

  return NextResponse.json({ cards })
}
