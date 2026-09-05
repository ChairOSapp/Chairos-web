import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'
import { checkRateLimit } from '@/lib/rate-limit'
import { timeStrToMinutes } from '@/lib/availability'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const STOP_KEYWORDS = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']
const START_KEYWORDS = ['START', 'YES', 'UNSTOP']
const HELP_KEYWORD = 'HELP'

// Shop names are free text and can contain XML-special characters (e.g. "&").
function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

// Keeps every templated SMS under the 160-char constraint regardless of how
// long a shop sets its name — the HELP template has the tightest budget.
function shortShopName(name: string): string {
  const MAX = 10
  return name.length > MAX ? `${name.slice(0, MAX - 1)}…` : name
}

// clients.phone is stored inconsistently in this DB (some E.164, some bare
// 10-digit), so we normalize the incoming number to both forms and match
// against either rather than assuming a single canonical format.
function normalizePhone(raw: string): { e164: string; bare: string } {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) {
    return { e164: `+${digits}`, bare: digits.slice(1) }
  }
  if (digits.length === 10) {
    return { e164: `+1${digits}`, bare: digits }
  }
  return { e164: digits ? `+${digits}` : '', bare: digits }
}

function twiml(message: string) {
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`,
    { headers: { 'Content-Type': 'text/xml' } }
  )
}

function twimlEmpty() {
  return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    headers: { 'Content-Type': 'text/xml' },
  })
}

async function shopNameForClient(supabase: ReturnType<typeof getSupabase>, clientId: string): Promise<string> {
  const { data } = await supabase
    .from('client_shop_memberships')
    .select('shops(name)')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const shop = (data as any)?.shops
  const name = Array.isArray(shop) ? shop[0]?.name : shop?.name
  return name || 'your shop'
}

// Handles two distinct callers on the same endpoint:
//  - Twilio's inbound-message webhook (application/x-www-form-urlencoded),
//    for STOP/START/HELP keyword replies to an SMS.
//  - The public /sms-optout form (application/json), always treated as STOP.
export async function POST(req: NextRequest) {
  const supabase = getSupabase()
  const contentType = req.headers.get('content-type') || ''
  const isTwilio = contentType.includes('application/x-www-form-urlencoded')
  const isJson = contentType.includes('application/json')

  let rawPhone = ''
  let keyword = ''

  if (isTwilio) {
    const bodyText = await req.text()
    const params = new URLSearchParams(bodyText)

    // Validate the request actually came from Twilio before acting on it.
    const signature = req.headers.get('x-twilio-signature') || ''
    const authToken = process.env.TWILIO_AUTH_TOKEN!
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || ''
    const proto = req.headers.get('x-forwarded-proto') || 'https'
    const webhookUrl = `${proto}://${host}/api/sms/optout`
    const paramsObj = Object.fromEntries(params.entries())
    if (!twilio.validateRequest(authToken, signature, webhookUrl, paramsObj)) {
      console.warn('[sms/optout] Invalid Twilio signature — rejected')
      return new NextResponse('Forbidden', { status: 403 })
    }

    rawPhone = params.get('From') ?? ''
    keyword = (params.get('Body') ?? '').trim().toUpperCase()
  } else if (isJson) {
    const jsonBody = await req.json().catch(() => ({}) as any)
    rawPhone = jsonBody.phone ?? ''
    keyword = 'STOP'
  } else {
    return NextResponse.json({ error: 'Unsupported content type' }, { status: 400 })
  }

  const { e164, bare } = normalizePhone(rawPhone)

  const { data: client } = bare
    ? await supabase.from('clients').select('id').in('phone', [e164, bare]).maybeSingle()
    : { data: null }

  if (isJson && !client) {
    return NextResponse.json({ error: 'Phone number not found' }, { status: 404 })
  }

  const shopName = client ? await shopNameForClient(supabase, client.id) : 'your shop'
  const displayName = shortShopName(shopName)

  if (STOP_KEYWORDS.includes(keyword)) {
    if (client) {
      await supabase.from('clients').update({ sms_consent: false, sms_consent_at: null }).eq('id', client.id)
    }
    await supabase.from('automation_logs').insert({
      type: 'sms_optout',
      payload: { clientId: client?.id ?? null, phone: e164, keyword },
      result: client ? 'opted_out' : 'unknown_number',
    })
    if (isJson) return NextResponse.json({ success: true })
    return twiml(`You have been unsubscribed from ${displayName} alerts. Reply START to resubscribe.`)
  }

  // Abandoned-booking reply-to-book and waitlist-claim -- checked before
  // START/HELP because "YES" is both a booking-confirmation keyword and a
  // carrier-mandated resubscribe keyword. An active, reply-eligible session
  // or waitlist offer for this phone means the reply is almost certainly
  // about that pending question, not a coincidental resubscribe -- so it
  // takes priority. STOP is still checked first above and always wins, per
  // compliance. Only engages when this phone actually has an active
  // session/offer; every other inbound text (including a genuinely
  // unrecognized reply to a marketing text) falls through to
  // START/HELP/campaign-click handling below untouched. This shares the
  // webhook rather than using separate routes because Twilio only supports
  // one inbound-message URL per phone number, and this one is already it.
  // An abandoned-booking session takes priority over a waitlist offer if a
  // phone somehow has both active at once -- the same "whichever question
  // is pending" precedent as STOP-vs-reply above.
  if (isTwilio && bare) {
    const bookingReply = await handleBookingReply(supabase, e164, bare, keyword)
    if (bookingReply) return bookingReply

    const waitlistReply = await handleWaitlistReply(supabase, e164, bare, keyword)
    if (waitlistReply) return waitlistReply
  }

  if (START_KEYWORDS.includes(keyword)) {
    if (client) {
      await supabase.from('clients').update({ sms_consent: true, sms_consent_at: new Date().toISOString() }).eq('id', client.id)
    }
    await supabase.from('automation_logs').insert({
      type: 'sms_optin',
      payload: { clientId: client?.id ?? null, phone: e164, keyword },
      result: client ? 'opted_in' : 'unknown_number',
    })
    return twiml(`You have been resubscribed to ${displayName} alerts. Reply STOP to unsubscribe.`)
  }

  if (keyword === HELP_KEYWORD) {
    await supabase.from('automation_logs').insert({
      type: 'sms_help',
      payload: { clientId: client?.id ?? null, phone: e164, keyword },
      result: 'help_sent',
    })
    return twiml(`ChairOS Alerts: Appt reminders & updates from ${displayName}. Msg freq varies. Msg & data rates may apply. Reply STOP to unsubscribe. Support: support@chairos.cc`)
  }

  // Unrecognized keyword — treat as a genuine reply for campaign engagement
  // tracking (SMS has no "open" concept, so a reply is the closest signal to
  // an email click), then acknowledge with empty TwiML either way.
  if (isTwilio && client) {
    const { data: recentRecipient } = await supabase
      .from('campaign_recipients')
      .select('id, click_count, clicked_at')
      .eq('client_id', client.id)
      .not('sent_at', 'is', null)
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (recentRecipient) {
      await supabase.from('campaign_recipients').update({
        clicked_at: recentRecipient.clicked_at ?? new Date().toISOString(),
        click_count: (recentRecipient.click_count ?? 0) + 1,
      }).eq('id', recentRecipient.id)
    }
  }

  return twimlEmpty()
}

const CONFIRM_KEYWORDS = ['YES', 'Y', 'BOOK', 'CONFIRM']
const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000

function formatDateTime(date: string, time: string): { dateLabel: string; timeDisplay: string } {
  const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const [h, m] = time.slice(0, 5).split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return { dateLabel, timeDisplay: `${h12}:${String(m).padStart(2, '0')} ${period}` }
}

// Re-checks the slot at the moment of reply (not just when the recovery
// text was sent) against every non-cancelled appointment for the relevant
// barber(s), buffer-aware -- the same conflict logic as
// /api/book/availability. A null barber_id means "any barber" was fine at
// booking time, so it's available again here if at least one active
// barber at the shop is free.
async function isSlotAvailable(
  supabase: ReturnType<typeof getSupabase>,
  shopId: string,
  barberId: string | null,
  date: string,
  time: string,
  service: { duration_minutes: number; buffer_before_minutes: number; buffer_after_minutes: number }
): Promise<boolean> {
  let barberIds: string[]
  if (barberId) {
    barberIds = [barberId]
  } else {
    const { data: barbers } = await supabase.from('shop_barbers').select('barber_id').eq('shop_id', shopId).eq('active', true)
    barberIds = (barbers || []).map(b => b.barber_id).filter(Boolean)
    if (barberIds.length === 0) return true
  }

  const { data: existingAppts } = await supabase
    .from('appointments')
    .select('barber_id, time, status, services(duration_minutes, buffer_before_minutes, buffer_after_minutes)')
    .eq('shop_id', shopId)
    .eq('date', date)
    .in('barber_id', barberIds)

  const candidateStart = timeStrToMinutes(time.slice(0, 5))
  const candidateEnd = candidateStart + service.duration_minutes
  const occStart = candidateStart - (service.buffer_before_minutes || 0)
  const occEnd = candidateEnd + (service.buffer_after_minutes || 0)

  const byBarber = new Map<string, { start: number; end: number; bufBefore: number; bufAfter: number }[]>()
  for (const id of barberIds) byBarber.set(id, [])
  for (const appt of existingAppts || []) {
    if (!appt.barber_id || appt.status === 'cancelled') continue
    const svc = (appt as any).services
    const start = timeStrToMinutes(appt.time.slice(0, 5))
    const list = byBarber.get(appt.barber_id)
    if (list) list.push({ start, end: start + (svc?.duration_minutes ?? 30), bufBefore: svc?.buffer_before_minutes ?? 0, bufAfter: svc?.buffer_after_minutes ?? 0 })
  }

  return barberIds.some(id => {
    const conflicts = (byBarber.get(id) || []).some(b => {
      const blockedStart = b.start - b.bufBefore
      const blockedEnd = b.end + b.bufAfter
      return occStart < blockedEnd && occEnd > blockedStart
    })
    return !conflicts
  })
}

// Reopens a claimed-but-failed session back to 'abandoned' so a rebooking
// link still works and it isn't left as a dead 'completed' row with no
// appointment_id.
async function reopenSession(supabase: ReturnType<typeof getSupabase>, sessionId: string) {
  await supabase.from('booking_sessions').update({ status: 'abandoned', updated_at: new Date().toISOString() }).eq('id', sessionId)
}

async function handleBookingReply(
  supabase: ReturnType<typeof getSupabase>,
  e164: string,
  bare: string,
  keyword: string
): Promise<NextResponse | null> {
  const { data: session } = await supabase
    .from('booking_sessions')
    .select('id, session_id, shop_id, barber_id, service_id, date, time, client_name, client_phone, client_email')
    .eq('client_phone', bare)
    .eq('status', 'abandoned')
    .eq('recovery_sms_type', 'reply_to_book')
    .not('recovery_sms_sent_at', 'is', null)
    .gte('recovery_sms_sent_at', new Date(Date.now() - REPLY_WINDOW_MS).toISOString())
    .order('recovery_sms_sent_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // No active reply-to-book session for this number -- not our concern,
  // let the caller fall through to its normal handling.
  if (!session) return null

  const phoneLimit = await checkRateLimit('bookingReply', `phone:${bare}`)
  if (!phoneLimit.ok) {
    return twiml('Too many requests. Please try again in a minute, or contact the shop directly.')
  }

  const { data: shop } = await supabase
    .from('shops').select('id, name, owner_id, shop_code').eq('id', session.shop_id).maybeSingle()
  const { data: service } = await supabase
    .from('services').select('id, name, price, duration_minutes, buffer_before_minutes, buffer_after_minutes').eq('id', session.service_id).maybeSingle()
  if (!shop || !service) {
    return twiml('Sorry, something went wrong finding that booking. Please contact the shop directly.')
  }
  const { data: barber } = session.barber_id
    ? await supabase.from('shop_barbers').select('barber_name, alias').eq('barber_id', session.barber_id).eq('shop_id', session.shop_id).maybeSingle()
    : { data: null as any }
  const barberLabel = barber?.barber_name || barber?.alias || null
  const { dateLabel, timeDisplay } = formatDateTime(session.date, session.time)

  if (!CONFIRM_KEYWORDS.includes(keyword)) {
    return twiml(`Reply YES to confirm your ${service.name} appointment on ${dateLabel} at ${timeDisplay}${barberLabel ? ` with ${barberLabel}` : ''}, or ignore this text.`)
  }

  // Claim the session atomically before doing anything else -- a retried
  // or duplicate webhook delivery for the same reply can't create two
  // appointments, since only one request can win this conditional update.
  const { data: claimed } = await supabase
    .from('booking_sessions')
    .update({ status: 'completed', updated_at: new Date().toISOString() })
    .eq('id', session.id)
    .eq('status', 'abandoned')
    .select('id')
    .maybeSingle()
  if (!claimed) {
    return twiml('This booking was already confirmed.')
  }

  const available = await isSlotAvailable(supabase, shop.id, session.barber_id, session.date, session.time, service)
  if (!available) {
    await reopenSession(supabase, session.id)
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://chairos.cc'
    const link = `${siteUrl}/book/${shop.shop_code}?session=${session.session_id}`
    return twiml(`Sorry, that time is no longer available. Pick a new time here: ${link}`)
  }

  const { data: existingClient } = await supabase.from('clients').select('id').eq('phone', bare).maybeSingle()
  let clientId: string
  if (existingClient) {
    clientId = existingClient.id
    if (session.client_email) await supabase.from('clients').update({ email: session.client_email }).eq('id', clientId)
  } else {
    const { data: newClient, error: newClientErr } = await supabase
      .from('clients')
      .insert({ phone: bare, full_name: session.client_name, email: session.client_email, source: 'online_booking' })
      .select('id')
      .single()
    if (newClientErr || !newClient) {
      await reopenSession(supabase, session.id)
      return twiml('Sorry, something went wrong confirming your booking. Please contact the shop directly.')
    }
    clientId = newClient.id
  }

  const newApptId = randomUUID()
  const { error: apptErr } = await supabase.from('appointments').insert({
    id: newApptId,
    shop_id: shop.id,
    barber_id: session.barber_id,
    service_id: service.id,
    client_id: clientId,
    client_name: session.client_name,
    client_phone: session.client_phone,
    client_email: session.client_email,
    date: session.date,
    time: session.time,
    price: service.price,
    status: 'pending',
    payment_status: 'unpaid',
    source: 'recovery',
  })
  if (apptErr) {
    await reopenSession(supabase, session.id)
    return twiml('Sorry, something went wrong confirming your booking. Please contact the shop directly.')
  }

  await supabase.from('booking_sessions').update({ appointment_id: newApptId }).eq('id', session.id)
  await supabase.from('client_shop_memberships').upsert(
    { client_id: clientId, shop_id: shop.id },
    { onConflict: 'client_id,shop_id', ignoreDuplicates: true }
  )

  await supabase.from('notifications').insert({
    user_id: shop.owner_id,
    shop_id: shop.id,
    type: 'booking',
    title: 'New booking',
    body: `${session.client_name} booked ${service.name}${barberLabel ? ` with ${barberLabel}` : ''} on ${dateLabel} at ${timeDisplay} (recovered via text)`,
    read: false,
  })
  if (session.barber_id) {
    await supabase.from('notifications').insert({
      user_id: session.barber_id,
      shop_id: shop.id,
      type: 'booking',
      title: 'New appointment',
      body: `${session.client_name} booked ${service.name} on ${dateLabel} at ${timeDisplay} (recovered via text)`,
      read: false,
    })
  }

  await supabase.from('automation_logs').insert({
    type: 'abandoned_booking_recovery_confirmed',
    payload: { sessionId: session.session_id, phone: e164, appointmentId: newApptId },
    result: 'booked',
  })

  return twiml(`You're booked! ${service.name} on ${dateLabel} at ${timeDisplay}${barberLabel ? ` with ${barberLabel}` : ''} at ${shop.name}. See you soon!`)
}

// Reverts a claimed-but-failed waitlist offer back to 'waiting' so the
// entry is still eligible for a future cancellation of this same exact
// slot, rather than being left stuck on a dead 'claimed'/'notified' row.
async function reopenWaitlistEntry(supabase: ReturnType<typeof getSupabase>, entryId: string) {
  await supabase.from('appointment_waitlist').update({
    status: 'waiting', notified_at: null, notify_expires_at: null, notify_barber_id: null, updated_at: new Date().toISOString(),
  }).eq('id', entryId)
}

// Mirrors handleBookingReply above: matches this phone's most recent
// unexpired waitlist offer, requires the same YES/Y/BOOK/CONFIRM reply,
// re-checks availability at the moment of reply (same buffer-aware
// isSlotAvailable check, since the slot could have been filled through
// normal booking in the meantime), and creates the real appointment --
// tagged source 'waitlist' rather than 'recovery' so owners can tell the
// two recovery paths apart in reporting.
async function handleWaitlistReply(
  supabase: ReturnType<typeof getSupabase>,
  e164: string,
  bare: string,
  keyword: string
): Promise<NextResponse | null> {
  const { data: entry } = await supabase
    .from('appointment_waitlist')
    .select('id, shop_id, client_id, client_name, client_phone, service_id, desired_date, desired_time, notify_barber_id, notify_expires_at')
    .eq('client_phone', bare)
    .eq('status', 'notified')
    .gt('notify_expires_at', new Date().toISOString())
    .order('notified_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // No active waitlist offer for this number -- not our concern, let the
  // caller fall through to its normal handling.
  if (!entry) return null

  const phoneLimit = await checkRateLimit('waitlistClaim', `phone:${bare}`)
  if (!phoneLimit.ok) {
    return twiml('Too many requests. Please try again in a minute, or contact the shop directly.')
  }

  const { data: shop } = await supabase
    .from('shops').select('id, name, owner_id, shop_code').eq('id', entry.shop_id).maybeSingle()
  const { data: service } = await supabase
    .from('services').select('id, name, price, duration_minutes, buffer_before_minutes, buffer_after_minutes').eq('id', entry.service_id).maybeSingle()
  if (!shop || !service) {
    return twiml('Sorry, something went wrong finding that offer. Please contact the shop directly.')
  }
  const { data: barber } = entry.notify_barber_id
    ? await supabase.from('shop_barbers').select('barber_name, alias').eq('barber_id', entry.notify_barber_id).eq('shop_id', entry.shop_id).maybeSingle()
    : { data: null as any }
  const barberLabel = barber?.barber_name || barber?.alias || null
  const { dateLabel, timeDisplay } = formatDateTime(entry.desired_date, entry.desired_time)

  if (!CONFIRM_KEYWORDS.includes(keyword)) {
    return twiml(`Reply YES to claim the ${service.name} spot on ${dateLabel} at ${timeDisplay}${barberLabel ? ` with ${barberLabel}` : ''}, or ignore this text.`)
  }

  // Claim atomically before doing anything else -- a retried or duplicate
  // webhook delivery, or a race with the claim-window-expiry sweep, can't
  // double-claim this offer since only one request can win this
  // conditional update.
  const { data: claimed } = await supabase
    .from('appointment_waitlist')
    .update({ status: 'claimed', updated_at: new Date().toISOString() })
    .eq('id', entry.id)
    .eq('status', 'notified')
    .select('id')
    .maybeSingle()
  if (!claimed) {
    return twiml('Sorry, that offer just expired or was already claimed.')
  }

  const available = await isSlotAvailable(supabase, shop.id, entry.notify_barber_id, entry.desired_date, entry.desired_time, service)
  if (!available) {
    await reopenWaitlistEntry(supabase, entry.id)
    return twiml(`Sorry, that time was just booked by someone else. You're still on the waitlist for ${service.name} on ${dateLabel} at ${timeDisplay}.`)
  }

  const { data: existingClient } = await supabase.from('clients').select('id').eq('phone', bare).maybeSingle()
  let clientId: string
  if (existingClient) {
    clientId = existingClient.id
  } else {
    const { data: newClient, error: newClientErr } = await supabase
      .from('clients')
      .insert({ phone: bare, full_name: entry.client_name, source: 'online_booking' })
      .select('id')
      .single()
    if (newClientErr || !newClient) {
      await reopenWaitlistEntry(supabase, entry.id)
      return twiml('Sorry, something went wrong confirming your booking. Please contact the shop directly.')
    }
    clientId = newClient.id
  }

  const newApptId = randomUUID()
  const { error: apptErr } = await supabase.from('appointments').insert({
    id: newApptId,
    shop_id: shop.id,
    barber_id: entry.notify_barber_id,
    service_id: service.id,
    client_id: clientId,
    client_name: entry.client_name,
    client_phone: entry.client_phone,
    date: entry.desired_date,
    time: entry.desired_time,
    price: service.price,
    status: 'pending',
    payment_status: 'unpaid',
    source: 'waitlist',
  })
  if (apptErr) {
    await reopenWaitlistEntry(supabase, entry.id)
    return twiml('Sorry, something went wrong confirming your booking. Please contact the shop directly.')
  }

  await supabase.from('appointment_waitlist').update({ claimed_appointment_id: newApptId }).eq('id', entry.id)
  await supabase.from('client_shop_memberships').upsert(
    { client_id: clientId, shop_id: shop.id },
    { onConflict: 'client_id,shop_id', ignoreDuplicates: true }
  )

  await supabase.from('notifications').insert({
    user_id: shop.owner_id,
    shop_id: shop.id,
    type: 'booking',
    title: 'Waitlist spot claimed',
    body: `${entry.client_name} claimed the ${service.name} spot on ${dateLabel} at ${timeDisplay}${barberLabel ? ` with ${barberLabel}` : ''} from the waitlist`,
    read: false,
  })
  if (entry.notify_barber_id) {
    await supabase.from('notifications').insert({
      user_id: entry.notify_barber_id,
      shop_id: shop.id,
      type: 'booking',
      title: 'New appointment',
      body: `${entry.client_name} claimed your open ${service.name} slot on ${dateLabel} at ${timeDisplay} from the waitlist`,
      read: false,
    })
  }

  await supabase.from('automation_logs').insert({
    type: 'appointment_waitlist_claimed',
    payload: { waitlistId: entry.id, phone: e164, appointmentId: newApptId },
    result: 'booked',
  })

  return twiml(`You're booked! ${service.name} on ${dateLabel} at ${timeDisplay}${barberLabel ? ` with ${barberLabel}` : ''} at ${shop.name}. See you soon!`)
}
