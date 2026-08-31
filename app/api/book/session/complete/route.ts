import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Called right after the public booking flow successfully creates a real
// appointment, so the abandoned-booking sweep never fires a recovery text
// for a booking that already went through.
export async function POST(req: NextRequest) {
  const { sessionId, appointmentId } = await req.json()
  if (!sessionId || !appointmentId) {
    return NextResponse.json({ error: 'sessionId and appointmentId are required' }, { status: 400 })
  }

  const admin = getAdmin()
  const { error } = await admin
    .from('booking_sessions')
    .update({ status: 'completed', appointment_id: appointmentId, updated_at: new Date().toISOString() })
    .eq('session_id', sessionId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
