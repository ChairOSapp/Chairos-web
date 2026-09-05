import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import twilio from 'twilio'
import { logger } from '@/lib/logger'

// How long a notified waitlist candidate has to reply YES before the slot
// moves to the next person. Deliberately much shorter than the shop's
// waitlist_min_notice_hours cutoff (default 4h = 240min) so there's always
// real runway left to fill the slot -- or fall back to normal booking --
// even after a full notify cycle goes unanswered.
export const WAITLIST_CLAIM_WINDOW_MINUTES = 30

const CONFIRM_KEYWORDS = ['YES', 'Y', 'BOOK', 'CONFIRM']
export { CONFIRM_KEYWORDS as WAITLIST_CONFIRM_KEYWORDS }

// Bounds the notify-next loop (opted-out/invalid-phone candidates are
// skipped in-line) so a long-dead waiting list can't spin indefinitely.
const MAX_CANDIDATES_PER_CYCLE = 10

export function getAdminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export function normalizeWaitlistPhone(raw: string): { e164: string; bare: string } | null {
  const digits = (raw || '').replace(/\D/g, '')
  const bare = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  if (bare.length !== 10) return null
  return { e164: `+1${bare}`, bare }
}

async function hasOptedOut(supabase: SupabaseClient, e164: string): Promise<boolean> {
  const { data } = await supabase
    .from('automation_logs')
    .select('type')
    .in('type', ['sms_optin', 'sms_optout'])
    .eq('payload->>phone', e164)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.type === 'sms_optout'
}

function formatDateTime(date: string, time: string): { dateLabel: string; timeDisplay: string } {
  const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const [h, m] = time.slice(0, 5).split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return { dateLabel, timeDisplay: `${h12}:${String(m).padStart(2, '0')} ${period}` }
}

async function logOutcome(supabase: SupabaseClient, payload: Record<string, unknown>, result: string) {
  await supabase.from('automation_logs').insert({ type: 'appointment_waitlist_notify', payload, result })
  logger.info('appointment_waitlist_notify', { ...payload, result })
}

export interface NotifySlot {
  shopId: string
  serviceId: string
  /** date as YYYY-MM-DD */
  date: string
  /** time as HH:MM:SS or HH:MM */
  time: string
  /** the barber whose slot actually opened up -- null if it was an "any barber" appointment */
  barberId: string | null
}

export type NotifyOutcome =
  | { notified: true; waitlistId: string }
  | { notified: false; reason: 'skipped_claim_window_exceeds_start' | 'no_match' | 'twilio_error' | 'max_candidates_exhausted' }

// The single entry point for offering an opened-up slot to the waitlist --
// used both right after a qualifying cancellation and by the claim-window
// expiry sweep when cascading to the next person. Always re-checks the
// claim-window-vs-appointment-start guard itself (never assumes the caller
// already did), since a cascade can eat into the runway a prior candidate
// had.
export async function notifyNextWaitlistCandidate(
  supabase: SupabaseClient,
  slot: NotifySlot
): Promise<NotifyOutcome> {
  const apptStart = new Date(`${slot.date}T${slot.time.slice(0, 5)}:00`)
  const minutesUntilStart = (apptStart.getTime() - Date.now()) / 60_000

  if (minutesUntilStart < WAITLIST_CLAIM_WINDOW_MINUTES) {
    await logOutcome(supabase, { shopId: slot.shopId, serviceId: slot.serviceId, date: slot.date, time: slot.time }, 'skipped_claim_window_exceeds_start')
    return { notified: false, reason: 'skipped_claim_window_exceeds_start' }
  }

  for (let attempt = 0; attempt < MAX_CANDIDATES_PER_CYCLE; attempt++) {
    let query = supabase
      .from('appointment_waitlist')
      .select('id, client_id, client_name, client_phone, staff_id')
      .eq('shop_id', slot.shopId)
      .eq('service_id', slot.serviceId)
      .eq('desired_date', slot.date)
      .eq('desired_time', slot.time)
      .eq('status', 'waiting')
      .order('created_at', { ascending: true })
      .limit(1)

    // A specific-barber opening can also satisfy an "any staff" waitlister;
    // an "any barber" opening can only satisfy an "any staff" waitlister,
    // since there's no specific barber to hand a specific-staff request.
    query = slot.barberId
      ? query.or(`staff_id.eq.${slot.barberId},staff_id.is.null`)
      : query.is('staff_id', null)

    const { data: candidate } = await query.maybeSingle()
    if (!candidate) {
      await logOutcome(supabase, { shopId: slot.shopId, serviceId: slot.serviceId, date: slot.date, time: slot.time }, 'no_match')
      return { notified: false, reason: 'no_match' }
    }

    // Optimistic claim -- guards a race with another cancellation cycle
    // (or a concurrent sweep run) picking the same candidate.
    const notifiedAt = new Date()
    const expiresAt = new Date(notifiedAt.getTime() + WAITLIST_CLAIM_WINDOW_MINUTES * 60_000)
    const { data: claimed } = await supabase
      .from('appointment_waitlist')
      .update({
        status: 'notified',
        notify_barber_id: slot.barberId,
        notified_at: notifiedAt.toISOString(),
        notify_expires_at: expiresAt.toISOString(),
        updated_at: notifiedAt.toISOString(),
      })
      .eq('id', candidate.id)
      .eq('status', 'waiting')
      .select('id')
      .maybeSingle()
    if (!claimed) continue // lost the race -- try the next candidate

    const phone = normalizeWaitlistPhone(candidate.client_phone)
    if (!phone) {
      await supabase.from('appointment_waitlist').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('id', candidate.id)
      await logOutcome(supabase, { waitlistId: candidate.id, phone: candidate.client_phone, shopId: slot.shopId, serviceId: slot.serviceId, date: slot.date, time: slot.time }, 'skipped_invalid_phone')
      continue
    }
    if (await hasOptedOut(supabase, phone.e164)) {
      await supabase.from('appointment_waitlist').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('id', candidate.id)
      await logOutcome(supabase, { waitlistId: candidate.id, phone: phone.e164, shopId: slot.shopId, serviceId: slot.serviceId, date: slot.date, time: slot.time }, 'skipped_opted_out')
      continue
    }

    const [{ data: shop }, { data: service }, { data: barber }] = await Promise.all([
      supabase.from('shops').select('name').eq('id', slot.shopId).maybeSingle(),
      supabase.from('services').select('name').eq('id', slot.serviceId).maybeSingle(),
      slot.barberId
        ? supabase.from('shop_barbers').select('barber_name, alias').eq('barber_id', slot.barberId).eq('shop_id', slot.shopId).maybeSingle()
        : Promise.resolve({ data: null as any }),
    ])

    const { dateLabel, timeDisplay } = formatDateTime(slot.date, slot.time)
    const barberLabel = (barber as any)?.barber_name || (barber as any)?.alias || null
    const firstName = (candidate.client_name || '').split(' ')[0] || 'there'
    const smsText = `Hi ${firstName}, a spot opened up at ${shop?.name || 'the shop'}: ${service?.name || 'your service'} on ${dateLabel} at ${timeDisplay}${barberLabel ? ` with ${barberLabel}` : ''}. Reply YES within ${WAITLIST_CLAIM_WINDOW_MINUTES} min to claim it. Reply STOP to opt out.`

    // The candidate is already optimistically claimed ('notified') above --
    // anything that goes wrong past this point, including a bad Twilio
    // client construction (misconfigured credentials), must still hit the
    // revert-to-waiting path below rather than throw uncaught and leave the
    // candidate stuck in 'notified' with no text ever actually sent.
    let result: string
    try {
      const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
      const msg = await twilioClient.messages.create({ body: smsText, from: process.env.TWILIO_PHONE_NUMBER!, to: phone.e164 })
      result = `sent:${msg.sid}`
    } catch (err: any) {
      result = `twilio_error:${err.message}`
    }

    if (!result.startsWith('sent')) {
      // Infra failure, not this candidate's fault -- undo the claim and
      // stop the cycle rather than burning through the rest of the list
      // against a Twilio outage.
      await supabase.from('appointment_waitlist').update({ status: 'waiting', notified_at: null, notify_expires_at: null, notify_barber_id: null, updated_at: new Date().toISOString() }).eq('id', candidate.id)
      await logOutcome(supabase, { waitlistId: candidate.id, phone: phone.e164, shopId: slot.shopId, serviceId: slot.serviceId, date: slot.date, time: slot.time }, result)
      return { notified: false, reason: 'twilio_error' }
    }

    await logOutcome(supabase, { waitlistId: candidate.id, phone: phone.e164, shopId: slot.shopId, serviceId: slot.serviceId, date: slot.date, time: slot.time }, result)
    return { notified: true, waitlistId: candidate.id }
  }

  return { notified: false, reason: 'max_candidates_exhausted' }
}

export interface CancelledAppointment {
  id: string
  shop_id: string
  barber_id: string | null
  service_id: string | null
  date: string
  time: string
}

// A cancellation less than the shop's waitlist_min_notice_hours before the
// slot's start time never reaches out to the waitlist at all -- there's no
// realistic way for someone to make it in on a last-minute scramble text,
// so offering it would just be setting someone up to fail. That's
// deliberate, not a bug, and is logged explicitly as such so it's visible
// in automation_logs rather than silently doing nothing. Called from
// /api/appointments/[id]/cancel right after an appointment is cancelled.
export async function triggerWaitlistOutreach(
  supabase: SupabaseClient,
  appointment: CancelledAppointment,
  minNoticeHours: number
): Promise<void> {
  if (!appointment.service_id) return // walk-ins / manual entries with no service on record have no waitlist to match against

  const apptStart = new Date(`${appointment.date}T${appointment.time}`)
  const hoursUntilStart = (apptStart.getTime() - Date.now()) / (60 * 60 * 1000)

  if (hoursUntilStart <= minNoticeHours) {
    const payload = { appointmentId: appointment.id, shopId: appointment.shop_id, hoursUntilStart: Math.round(hoursUntilStart * 100) / 100, minNoticeHours }
    await supabase.from('automation_logs').insert({ type: 'appointment_waitlist_notify', payload, result: 'skipped_insufficient_notice' })
    logger.info('appointment_waitlist_notify', { ...payload, result: 'skipped_insufficient_notice' })
    return
  }

  await notifyNextWaitlistCandidate(supabase, {
    shopId: appointment.shop_id,
    serviceId: appointment.service_id,
    date: appointment.date,
    time: appointment.time,
    barberId: appointment.barber_id,
  })
}
