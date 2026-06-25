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

  const { error } = await getAdmin()
    .from('client_shop_memberships')
    .upsert(
      { client_id: clientId, shop_id: shopId },
      { onConflict: 'client_id,shop_id', ignoreDuplicates: true }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
