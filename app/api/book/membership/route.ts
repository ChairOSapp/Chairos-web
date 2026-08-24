import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  const { clientId, shopId } = await req.json()
  if (!clientId || !shopId) {
    return NextResponse.json({ error: 'clientId and shopId required' }, { status: 400 })
  }

  const admin = getAdmin()

  // This route has no auth session by design (called from the public booking
  // flow right after an anonymous visitor creates their own client record),
  // so it can't check ownership the normal way. At minimum, verify both ids
  // refer to real rows before writing a membership link — this blocks
  // arbitrary-FK spam/enumeration through the endpoint.
  const [{ data: shop }, { data: client }] = await Promise.all([
    admin.from('shops').select('id').eq('id', shopId).maybeSingle(),
    admin.from('clients').select('id').eq('id', clientId).maybeSingle(),
  ])
  if (!shop || !client) {
    return NextResponse.json({ error: 'Invalid clientId or shopId' }, { status: 404 })
  }

  const { error } = await admin
    .from('client_shop_memberships')
    .upsert(
      { client_id: clientId, shop_id: shopId },
      { onConflict: 'client_id,shop_id', ignoreDuplicates: true }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
