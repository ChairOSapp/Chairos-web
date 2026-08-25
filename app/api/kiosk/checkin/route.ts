import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  const { shopCode, name, phone, requestedBarberId, serviceId } = await req.json()
  if (!shopCode || !name || !phone) {
    return NextResponse.json({ error: 'shopCode, name, and phone are required' }, { status: 400 })
  }

  const admin = getAdmin()

  const { data: shop } = await admin
    .from('shops')
    .select('id, owner_id')
    .eq('shop_code', shopCode)
    .maybeSingle()
  if (!shop) return NextResponse.json({ error: 'Shop not found' }, { status: 404 })

  // requestedBarberId / serviceId are optional and caller-controlled --
  // validate they actually belong to this shop before writing them,
  // same defense-in-depth already used in /api/book/membership.
  let validatedBarberId: string | null = null
  if (requestedBarberId) {
    const { data: barber } = await admin
      .from('shop_barbers')
      .select('barber_id')
      .eq('shop_id', shop.id)
      .eq('barber_id', requestedBarberId)
      .eq('active', true)
      .maybeSingle()
    validatedBarberId = barber?.barber_id || null
  }
  let validatedServiceId: string | null = null
  if (serviceId) {
    const { data: service } = await admin
      .from('services')
      .select('id')
      .eq('shop_id', shop.id)
      .eq('id', serviceId)
      .eq('active', true)
      .maybeSingle()
    validatedServiceId = service?.id || null
  }

  const walkInId = crypto.randomUUID()
  const { error: insertError } = await admin.from('walk_ins').insert({
    id: walkInId,
    shop_id: shop.id,
    client_name: name,
    client_phone: phone,
    requested_barber_id: validatedBarberId,
    service_id: validatedServiceId,
  })

  if (insertError) {
    logger.error('kiosk_checkin_insert_failed', { shopId: shop.id, message: insertError.message })
    return NextResponse.json({ error: 'Could not check in right now' }, { status: 500 })
  }

  if (shop.owner_id) {
    await admin.from('notifications').insert({
      user_id: shop.owner_id,
      shop_id: shop.id,
      type: 'walk_in',
      title: 'Walk-in checked in',
      body: `${name} checked in at the kiosk and is waiting.`,
      read: false,
    })
  }

  logger.info('kiosk_checkin', { shopId: shop.id, walkInId })
  return NextResponse.json({ id: walkInId })
}
