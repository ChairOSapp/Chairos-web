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

  // Authorization: only record a membership for a client that actually belongs
  // to this shop. The shop must exist and the client must already be linked to
  // it via an appointment (the booking flow creates the appointment before this
  // call) or a prior membership. This prevents forging arbitrary memberships.
  const [{ data: shop }, { data: appt }, { data: existing }] = await Promise.all([
    admin.from('shops').select('id').eq('id', shopId).maybeSingle(),
    admin
      .from('appointments')
      .select('id')
      .eq('client_id', clientId)
      .eq('shop_id', shopId)
      .limit(1)
      .maybeSingle(),
    admin
      .from('client_shop_memberships')
      .select('id')
      .eq('client_id', clientId)
      .eq('shop_id', shopId)
      .maybeSingle(),
  ])
  if (!shop) {
    return NextResponse.json({ error: 'Shop not found' }, { status: 404 })
  }
  if (!appt && !existing) {
    return NextResponse.json({ error: 'Client does not belong to this shop' }, { status: 403 })
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
