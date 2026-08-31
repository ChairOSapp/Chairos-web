import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// booking_sessions has no anon-facing RLS policy at all (locked down to
// service role only), so the public booking page writes through this
// route instead. It captures the in-progress session as soon as the
// visitor has entered enough to be worth recovering -- name, phone, and a
// selected service/date/time -- so the abandoned-booking sweep has real
// data to text them about instead of nothing.
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { sessionId, shopId, barberId, serviceId, date, time, clientName, clientPhone, clientEmail } = body

  if (!sessionId || !shopId || !serviceId || !date || !time || !clientName || !clientPhone) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const admin = getAdmin()

  // Validate the referenced shop/service/barber are real and actually
  // belong together before storing them -- same defense-in-depth already
  // used in /api/book/membership and /api/kiosk/otp/send.
  const { data: shop } = await admin.from('shops').select('id').eq('id', shopId).maybeSingle()
  if (!shop) return NextResponse.json({ error: 'Invalid shopId' }, { status: 404 })

  const { data: service } = await admin
    .from('services').select('id').eq('id', serviceId).eq('shop_id', shopId).eq('active', true).maybeSingle()
  if (!service) return NextResponse.json({ error: 'Invalid serviceId' }, { status: 404 })

  let validatedBarberId: string | null = null
  if (barberId) {
    const { data: barber } = await admin
      .from('shop_barbers').select('barber_id').eq('shop_id', shopId).eq('barber_id', barberId).eq('active', true).maybeSingle()
    validatedBarberId = barber?.barber_id || null
  }

  const normalizedPhone = String(clientPhone).replace(/\D/g, '')

  // Never resurrect a session that already turned into a real booking --
  // only upsert while it's still in progress or was previously abandoned
  // (e.g. the visitor came back and started editing again).
  const { data: existing } = await admin
    .from('booking_sessions').select('status').eq('session_id', sessionId).maybeSingle()
  if (existing?.status === 'completed') {
    return NextResponse.json({ ok: true })
  }

  const { error } = await admin.from('booking_sessions').upsert({
    session_id: sessionId,
    shop_id: shopId,
    barber_id: validatedBarberId,
    service_id: serviceId,
    date,
    time,
    client_name: clientName,
    client_phone: normalizedPhone,
    client_email: clientEmail || null,
    status: 'in_progress',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'session_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// Powers the deposit-required recovery link, which sends the visitor back
// to the booking page with ?session=<id> so their selections can be
// restored without asking them to redo the whole flow. session_id is an
// unguessable UUID that acts as a capability token (same pattern as the
// consent/signed/[token] route) -- there's no other auth to scope this to
// since the visitor never had a Supabase session.
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId')
  if (!sessionId) return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })

  const admin = getAdmin()
  const { data: session } = await admin
    .from('booking_sessions')
    .select('shop_id, barber_id, service_id, date, time, client_name, client_phone, client_email, status')
    .eq('session_id', sessionId)
    .maybeSingle()

  if (!session || session.status === 'completed') {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  return NextResponse.json({ session })
}
