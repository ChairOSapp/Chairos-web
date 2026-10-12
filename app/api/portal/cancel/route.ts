import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { readPortalSession } from '@/lib/portalSession'
import { resolvePortalClient } from '@/lib/portalData'
import { triggerWaitlistOutreach } from '@/lib/waitlistNotify'
import { resolveTimeZone } from '@/lib/wallclock'
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

  const { appointmentId, tz } = await req.json()
  if (!appointmentId) return NextResponse.json({ error: 'appointmentId is required' }, { status: 400 })

  const admin = getAdmin()
  const portalClient = await resolvePortalClient(admin, session.phone)
  if (!portalClient) return NextResponse.json({ error: 'No client record found' }, { status: 404 })

  // Verify ownership. Column names are the real schema's: the slot time
  // is `time` (there is no start_time / cancelled_at / is_late_cancel
  // column) — this route previously selected and wrote columns that do
  // not exist, so every portal cancellation failed: the select errored
  // (404 for every appointment) and the update would have 500'd.
  const { data: appointment } = await admin
    .from('appointments')
    .select('id, shop_id, barber_id, service_id, status, date, time')
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
    .select('cancellation_window_hours, cancellation_policy, waitlist_min_notice_hours')
    .eq('id', appointment.shop_id)
    .maybeSingle()

  const cancelWindowHours = shop?.cancellation_window_hours ?? 24
  const apptDateTime = new Date(`${appointment.date}T${appointment.time}`)
  const hoursUntil = (apptDateTime.getTime() - Date.now()) / (1000 * 60 * 60)
  const isLateCancel = hoursUntil < cancelWindowHours

  const { error } = await admin
    .from('appointments')
    .update({
      status: 'cancelled',
      cancellation_reason: 'client_portal',
    })
    .eq('id', appointmentId)

  if (error) {
    logger.error('portal_cancel_failed', { appointmentId, message: error.message })
    return NextResponse.json({ error: 'Could not cancel appointment' }, { status: 500 })
  }

  logger.info('portal_cancel', { appointmentId, isLateCancel })

  // Offer the freed slot to the waitlist, exactly like a staff-side
  // cancel — client-initiated cancellations used to free the slot
  // silently, so the auto-fill never fired for the most common kind of
  // cancellation. Outreach failure must not fail the cancellation.
  try {
    await triggerWaitlistOutreach(
      admin,
      appointment,
      shop?.waitlist_min_notice_hours ?? 4,
      typeof tz === 'string' && tz ? resolveTimeZone(tz) : undefined,
    )
  } catch (err) {
    logger.error('portal_cancel_waitlist_outreach_failed', {
      appointmentId,
      message: err instanceof Error ? err.message : String(err),
    })
  }

  return NextResponse.json({
    ok: true,
    isLateCancel,
    policy: isLateCancel ? shop?.cancellation_policy : null,
  })
}
