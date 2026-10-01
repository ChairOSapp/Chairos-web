import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { readPortalSession } from '@/lib/portalSession'
import { resolvePortalClient } from '@/lib/portalData'
import { logger } from '@/lib/logger'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Client self-serve cancellation from the portal.
// Verifies the appointment belongs to the signed-in client.
export async function POST(req: NextRequest) {
  const session = readPortalSession(req)
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { appointmentId } = await req.json()
  if (!appointmentId) return NextResponse.json({ error: 'appointmentId is required' }, { status: 400 })

  const admin = getAdmin()
  const portalClient = await resolvePortalClient(admin, session.phone)
  if (!portalClient) return NextResponse.json({ error: 'No client record found' }, { status: 404 })

  // Verify ownership
  const { data: appointment } = await admin
    .from('appointments')
    .select('id, shop_id, status, date, start_time')
    .eq('id', appointmentId)
    .eq('client_id', portalClient.clientId)
    .maybeSingle()
  if (!appointment) return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })

  if (appointment.status === 'cancelled') {
    return NextResponse.json({ error: 'This appointment is already cancelled' }, { status: 400 })
  }

  // Check cancellation window
  const { data: shop } = await admin
    .from('shops')
    .select('cancellation_window_hours, cancellation_policy')
    .eq('id', appointment.shop_id)
    .maybeSingle()

  const cancelWindowHours = shop?.cancellation_window_hours ?? 24
  const apptDateTime = new Date(`${appointment.date}T${appointment.start_time}`)
  const hoursUntil = (apptDateTime.getTime() - Date.now()) / (1000 * 60 * 60)
  const isLateCancel = hoursUntil < cancelWindowHours

  const { error } = await admin
    .from('appointments')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancellation_reason: 'client_portal',
      is_late_cancel: isLateCancel,
    })
    .eq('id', appointmentId)

  if (error) {
    logger.error('portal_cancel_failed', { appointmentId, message: error.message })
    return NextResponse.json({ error: 'Could not cancel appointment' }, { status: 500 })
  }

  logger.info('portal_cancel', { appointmentId, isLateCancel })

  return NextResponse.json({
    ok: true,
    isLateCancel,
    policy: isLateCancel ? shop?.cancellation_policy : null,
  })
}
