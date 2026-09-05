import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { normalizeWaitlistPhone } from '@/lib/waitlistNotify'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// appointment_waitlist has no anon-facing RLS policy (locked down to
// service role, same as booking_sessions), so the public booking page
// writes through this route. Captures the exact fully-booked slot the
// client asked about -- not a vague date range -- so a later cancellation
// can be matched against it precisely.
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { shopId, barberId, serviceId, date, time, clientName, clientPhone } = body

  if (!shopId || !serviceId || !date || !time || !clientName || !clientPhone) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const phone = normalizeWaitlistPhone(String(clientPhone))
  if (!phone) {
    return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 })
  }

  const admin = getAdmin()

  // Validate the referenced shop/service/barber are real and actually
  // belong together before storing them -- same defense-in-depth already
  // used in /api/book/session.
  const { data: shop } = await admin.from('shops').select('id').eq('id', shopId).maybeSingle()
  if (!shop) return NextResponse.json({ error: 'Invalid shopId' }, { status: 404 })

  const { data: service } = await admin
    .from('services').select('id, duration_minutes').eq('id', serviceId).eq('shop_id', shopId).eq('active', true).maybeSingle()
  if (!service) return NextResponse.json({ error: 'Invalid serviceId' }, { status: 404 })

  let validatedBarberId: string | null = null
  if (barberId) {
    const { data: barber } = await admin
      .from('shop_barbers').select('barber_id').eq('shop_id', shopId).eq('barber_id', barberId).eq('active', true).maybeSingle()
    validatedBarberId = barber?.barber_id || null
  }

  // Normalize time to HH:MM:SS for consistent matching against
  // appointments.time later.
  const time24 = /^\d{2}:\d{2}$/.test(time) ? `${time}:00` : time

  const { data: existingClient } = await admin.from('clients').select('id').eq('phone', phone.bare).maybeSingle()

  // Already waiting for this exact slot -- don't create a duplicate entry
  // or reshuffle their position.
  let existingQuery = admin
    .from('appointment_waitlist')
    .select('id, position')
    .eq('shop_id', shopId)
    .eq('service_id', serviceId)
    .eq('desired_date', date)
    .eq('desired_time', time24)
    .eq('client_phone', phone.bare)
    .eq('status', 'waiting')
  existingQuery = validatedBarberId ? existingQuery.eq('staff_id', validatedBarberId) : existingQuery.is('staff_id', null)
  const { data: existingEntry } = await existingQuery.maybeSingle()
  if (existingEntry) {
    return NextResponse.json({ ok: true, position: existingEntry.position })
  }

  let countQuery = admin
    .from('appointment_waitlist')
    .select('id', { count: 'exact', head: true })
    .eq('shop_id', shopId)
    .eq('service_id', serviceId)
    .eq('desired_date', date)
    .eq('desired_time', time24)
    .eq('status', 'waiting')
  countQuery = validatedBarberId ? countQuery.eq('staff_id', validatedBarberId) : countQuery.is('staff_id', null)
  const { count } = await countQuery
  const position = (count || 0) + 1

  const { data: inserted, error } = await admin.from('appointment_waitlist').insert({
    shop_id: shopId,
    client_id: existingClient?.id || null,
    client_name: clientName,
    client_phone: phone.bare,
    staff_id: validatedBarberId,
    service_id: serviceId,
    desired_date: date,
    desired_time: time24,
    position,
  }).select('id, position').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: inserted.id, position: inserted.position })
}
