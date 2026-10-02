import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveConsentPhone } from './otp/route'

function getSupabase() {
  return createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Public route: clients have no Supabase Auth session. The appointment UUID
// alone is NOT enough to see PII or get a signing token anymore (M3/M5) —
// this GET only reveals the shop name and a masked phone number. The client
// proves phone ownership via POST /api/consent/template/otp + verify, which
// returns the full payload.
export async function GET(req: NextRequest) {
  const supabase = getSupabase()
  const appointmentId = req.nextUrl.searchParams.get('appointmentId')
  if (!appointmentId) {
    return NextResponse.json({ error: 'appointmentId is required' }, { status: 400 })
  }

  const { data: appointment } = await supabase
    .from('appointments')
    .select('id, shop_id')
    .eq('id', appointmentId)
    .maybeSingle()
  if (!appointment) {
    return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
  }

  const { data: shop } = await supabase
    .from('shops')
    .select('name')
    .eq('id', appointment.shop_id)
    .maybeSingle()

  const bare = await resolveConsentPhone(supabase, appointmentId)
  if (!bare) {
    return NextResponse.json(
      { error: 'No phone number on file for this appointment. Please contact the shop.' },
      { status: 400 }
    )
  }

  return NextResponse.json({
    verificationRequired: true,
    shopName: shop?.name || 'the shop',
    maskedPhone: `(***) ***-${bare.slice(-4)}`,
  })
}
