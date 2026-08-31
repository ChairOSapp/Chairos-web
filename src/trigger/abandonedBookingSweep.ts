import { schedules } from "@trigger.dev/sdk"
import { createClient } from "@supabase/supabase-js"
import twilio from "twilio"
import { logger } from "@/lib/logger"

// Deliberately not importing lib/square here -- it pulls in the full
// `square` SDK for one trivial arithmetic helper, and that import was the
// prime suspect for this task silently dying before ever reaching Twilio
// (no automation_logs row on any exit path, in an environment with no
// SQUARE_* vars configured at all). Inlining the one line of math it
// actually needs removes the dependency entirely.
function computeDepositAmount(depositType: 'flat' | 'percent', depositAmount: number, servicePrice: number): number {
  return depositType === 'flat' ? depositAmount : Math.round(servicePrice * (depositAmount / 100) * 100) / 100
}

// Replaces the old wait.for()-based abandonedBookingRecovery task, which
// was never actually triggered by anything (the booking page never called
// it) and relied on the caller to already know a session had gone stale.
// This follows the same pattern as depositHoldExpiration: a periodic scan
// that finds sessions past their timeout itself, so nothing upstream has
// to remember to fire it.

const TIMEOUT_MINUTES = Number(process.env.BOOKING_ABANDON_TIMEOUT_MINUTES) || 20
const REPLY_KEYWORDS_HINT = 'YES'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function normalizePhoneE164(raw: string): string | null {
  const digits = (raw || '').replace(/\D/g, '')
  const bare = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  const e164 = `+1${bare}`
  return /^\+1\d{10}$/.test(e164) ? e164 : null
}

// sms_consent gates marketing texts (the "text me reminders" checkbox).
// This recovery text is transactional and disclosed on the booking page
// itself, so it does NOT check sms_consent -- but a hard STOP is always a
// hard stop regardless of which flow is texting. automation_logs already
// records every sms_optin/sms_optout event; the most recent one for this
// number is the real opt-out signal to respect here.
async function hasOptedOut(supabase: ReturnType<typeof getSupabase>, e164: string): Promise<boolean> {
  // /api/sms/optout always logs payload.phone in e164 form, so matching
  // on e164 alone is sufficient here.
  const { data } = await supabase
    .from('automation_logs')
    .select('type, created_at')
    .in('type', ['sms_optin', 'sms_optout'])
    .eq('payload->>phone', e164)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.type === 'sms_optout'
}

export const abandonedBookingSweep = schedules.task({
  id: "abandoned-booking-sweep",
  cron: "*/5 * * * *",
  run: async () => {
    const supabase = getSupabase()
    const cutoff = new Date(Date.now() - TIMEOUT_MINUTES * 60_000).toISOString()

    const { data: staleSessions, error } = await supabase
      .from('booking_sessions')
      .select('id, session_id, shop_id, barber_id, service_id, date, time, client_name, client_phone, client_email')
      .eq('status', 'in_progress')
      .lt('updated_at', cutoff)

    if (error) throw error
    if (!staleSessions || staleSessions.length === 0) return { abandoned: 0, sent: 0 }

    let abandonedCount = 0
    let sentCount = 0

    for (const session of staleSessions) {
      // Optimistic claim -- guards against a race with the visitor
      // completing the booking between the select above and this update.
      const { data: claimed } = await supabase
        .from('booking_sessions')
        .update({ status: 'abandoned', updated_at: new Date().toISOString() })
        .eq('id', session.id)
        .eq('status', 'in_progress')
        .select('id')
        .maybeSingle()
      if (!claimed) continue
      abandonedCount++

      const result = await sendRecoveryForSession(supabase, session)
      if (result.sent) sentCount++
    }

    logger.info('abandoned_booking_sweep_run_complete', { scanned: staleSessions.length, abandoned: abandonedCount, sent: sentCount })
    return { abandoned: abandonedCount, sent: sentCount }
  },
})

async function sendRecoveryForSession(
  supabase: ReturnType<typeof getSupabase>,
  session: { id: string; session_id: string; shop_id: string; barber_id: string | null; service_id: string; date: string; time: string; client_name: string; client_phone: string; client_email: string | null }
): Promise<{ sent: boolean; reason?: string }> {
  const [{ data: shop }, { data: service }, { data: barber }] = await Promise.all([
    supabase.from('shops').select('id, name, shop_code, vertical, deposits_enabled, deposit_type, deposit_amount').eq('id', session.shop_id).maybeSingle(),
    supabase.from('services').select('id, name, price, deposit_required').eq('id', session.service_id).maybeSingle(),
    session.barber_id
      ? supabase.from('shop_barbers').select('barber_name, alias').eq('barber_id', session.barber_id).eq('shop_id', session.shop_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  if (!shop || !service) {
    await logOutcome(supabase, session, 'skipped:missing_shop_or_service')
    return { sent: false, reason: 'missing_shop_or_service' }
  }

  const e164 = normalizePhoneE164(session.client_phone)
  if (!e164) {
    await logOutcome(supabase, session, `skipped:invalid_phone:${session.client_phone}`)
    return { sent: false, reason: 'invalid_phone' }
  }
  if (await hasOptedOut(supabase, e164)) {
    await logOutcome(supabase, session, 'skipped:opted_out')
    return { sent: false, reason: 'opted_out' }
  }

  const requiresDeposit =
    (shop.vertical === 'tattoo' || (shop.vertical === 'salon' && shop.deposits_enabled)) &&
    service.deposit_required === true

  const dateLabel = new Date(session.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const timeLabel = session.time.slice(0, 5)
  const [h, m] = timeLabel.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  const timeDisplay = `${h12}:${String(m).padStart(2, '0')} ${period}`
  const barberLabel = (barber as any)?.barber_name || (barber as any)?.alias || null
  const firstName = (session.client_name || '').split(' ')[0] || 'there'
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://chairos.cc'

  let smsText: string
  let recoveryType: 'reply_to_book' | 'deposit_link'

  if (requiresDeposit) {
    recoveryType = 'deposit_link'
    const amount = service.price != null
      ? computeDepositAmount(shop.deposit_type, Number(shop.deposit_amount), Number(service.price))
      : null
    const link = `${siteUrl}/book/${shop.shop_code}?session=${session.session_id}`
    smsText = `Hi ${firstName}, you didn't finish booking at ${shop.name}. Your ${service.name} slot on ${dateLabel} at ${timeDisplay}${barberLabel ? ` with ${barberLabel}` : ''} is held -- finish${amount != null ? ` and pay your $${amount} deposit` : ''} here: ${link}`
  } else {
    recoveryType = 'reply_to_book'
    smsText = `Hi ${firstName}, you didn't finish booking at ${shop.name}. Reply ${REPLY_KEYWORDS_HINT} to confirm: ${service.name} on ${dateLabel} at ${timeDisplay}${barberLabel ? ` with ${barberLabel}` : ''}. Reply STOP to opt out.`
  }

  const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
  let result: string
  try {
    const msg = await twilioClient.messages.create({ body: smsText, from: process.env.TWILIO_PHONE_NUMBER!, to: e164 })
    result = `sent:${msg.sid}`
  } catch (err: any) {
    result = `twilio_error:${err.message}`
  }

  const sent = result.startsWith('sent')
  if (sent) {
    await supabase
      .from('booking_sessions')
      .update({ recovery_sms_sent_at: new Date().toISOString(), recovery_sms_type: recoveryType })
      .eq('id', session.id)
  }

  await logOutcome(supabase, session, result, recoveryType)
  return { sent }
}

async function logOutcome(
  supabase: ReturnType<typeof getSupabase>,
  session: { session_id: string; client_phone: string },
  result: string,
  recoveryType?: string
) {
  await supabase.from('automation_logs').insert({
    type: 'abandoned_booking_recovery',
    payload: { sessionId: session.session_id, phone: session.client_phone, recoveryType },
    result,
  })
  logger.info('abandoned_booking_recovery_sent', { sessionId: session.session_id, result, recoveryType })
}
