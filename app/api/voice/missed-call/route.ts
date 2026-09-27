import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'
import { checkRateLimit } from '@/lib/rate-limit'
import { requireActiveBilling } from '@/lib/billing'
import { withRetry } from '@/lib/retry'
import { logger } from '@/lib/logger'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// A call counts as "missed" only when the caller was never connected to
// anyone. Answered calls (CallStatus=completed / DialCallStatus=completed
// or =answered) and non-terminal events are ignored.
const UNANSWERED_STATUSES = new Set(['no-answer', 'busy', 'failed', 'canceled'])

// Same normalization the SMS paths use: clients.phone is stored
// inconsistently (some E.164, some bare 10-digit), so match both forms.
function normalizePhone(raw: string): { e164: string; bare: string } {
  const digits = (raw || '').replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) {
    return { e164: `+${digits}`, bare: digits.slice(1) }
  }
  if (digits.length === 10) {
    return { e164: `+1${digits}`, bare: digits }
  }
  return { e164: digits ? `+${digits}` : '', bare: digits }
}

const DEDUPE_WINDOW_MS = 4 * 60 * 60 * 1000

// Twilio voice status-callback webhook for the missed-call text-back.
// The shop points its Twilio voice number's Status Callback URL here
// (and, if it rings staff via <Dial>, uses this URL as the Dial action
// too). When a call to that number ends unanswered, the caller gets one
// transactional SMS with the shop's booking link.
//
// Every outcome is logged to automation_logs (type 'missed_call_textback')
// so owners can see what was sent and what was suppressed. Non-2xx is
// reserved for signature failures only — Twilio retries those; every
// business-logic outcome returns 200 so a permanently-unresolvable
// callback doesn't retry forever.
export async function POST(req: NextRequest) {
  const supabase = getSupabase()
  const contentType = req.headers.get('content-type') || ''
  if (!contentType.includes('application/x-www-form-urlencoded')) {
    return NextResponse.json({ error: 'Unsupported content type' }, { status: 400 })
  }

  const bodyText = await req.text()
  const params = new URLSearchParams(bodyText)

  // Validate the request actually came from Twilio before acting on it.
  const signature = req.headers.get('x-twilio-signature') || ''
  const authToken = process.env.TWILIO_AUTH_TOKEN!
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || ''
  const proto = req.headers.get('x-forwarded-proto') || 'https'
  const webhookUrl = `${proto}://${host}/api/voice/missed-call`
  const paramsObj = Object.fromEntries(params.entries())
  if (!twilio.validateRequest(authToken, signature, webhookUrl, paramsObj)) {
    logger.warn('voice_missed_call_invalid_signature')
    return new NextResponse('Forbidden', { status: 403 })
  }

  const callSid = params.get('CallSid') || ''
  const callStatus = (params.get('CallStatus') || '').toLowerCase()
  const dialCallStatus = (params.get('DialCallStatus') || '').toLowerCase()
  // When used as a <Dial> action URL, DialCallStatus is authoritative;
  // otherwise fall back to the call's own terminal status. Per Twilio's
  // docs, DialCallStatus=completed means the called party answered and
  // was connected, and DialCallStatus=answered means the same for a
  // conference leg -- both are answered calls, never missed.
  const ANSWERED_DIAL_STATUSES = new Set(['completed', 'answered'])
  const missed = dialCallStatus ? !ANSWERED_DIAL_STATUSES.has(dialCallStatus) : UNANSWERED_STATUSES.has(callStatus)

  const called = normalizePhone(params.get('To') || '')
  const caller = normalizePhone(params.get('From') || '')

  if (!called.e164 || !caller.e164) {
    return NextResponse.json({ ok: true, result: 'missing_number' })
  }

  // Resolve the shop from the Twilio number that was called.
  const { data: shop } = await supabase
    .from('shops')
    .select('id, shop_code, owner_id, missed_call_textback_enabled')
    .in('twilio_voice_number', [called.e164, called.bare])
    .maybeSingle()

  async function log(result: string, extra: Record<string, unknown> = {}) {
    await supabase.from('automation_logs').insert({
      type: 'missed_call_textback',
      payload: {
        shop_id: shop?.id ?? null,
        caller: caller.e164,
        call_sid: callSid,
        call_status: callStatus,
        dial_call_status: dialCallStatus || null,
        ...extra,
      },
      result,
    })
  }

  if (!shop) {
    await log('unknown_number')
    return NextResponse.json({ ok: true, result: 'unknown_number' })
  }

  if (!missed) {
    await log('call_answered')
    return NextResponse.json({ ok: true, result: 'call_answered' })
  }

  // Strictly opt-in — default OFF so no shop accrues surprise SMS spend.
  if (!shop.missed_call_textback_enabled) {
    await log('disabled')
    return NextResponse.json({ ok: true, result: 'disabled' })
  }

  // Billing gate: text-backs spend the platform's Twilio budget, so
  // expired/blocked shops don't send (same gate as campaign/SMS sends).
  if (shop.owner_id) {
    const billingBlock = await requireActiveBilling(supabase, shop.owner_id)
    if (billingBlock) {
      await log('billing_blocked')
      return NextResponse.json({ ok: true, result: 'billing_blocked' })
    }
  }

  // Respect an explicit SMS opt-out for a known client number. Unknown
  // callers still get this one transactional text — it's sent in direct
  // response to their own call, carries no marketing, and the existing
  // /api/sms/optout webhook honors a STOP reply.
  const { data: client } = await supabase
    .from('clients')
    .select('id, sms_consent')
    .in('phone', [caller.e164, caller.bare])
    .maybeSingle()
  if (client && client.sms_consent === false) {
    await log('suppressed_optout')
    return NextResponse.json({ ok: true, result: 'suppressed_optout' })
  }

  // Dedupe: at most one text-back per caller per shop every 4 hours.
  const windowStart = new Date(Date.now() - DEDUPE_WINDOW_MS).toISOString()
  const { data: recent } = await supabase
    .from('automation_logs')
    .select('id')
    .eq('type', 'missed_call_textback')
    .eq('result', 'sent')
    .eq('payload->>caller', caller.e164)
    .eq('payload->>shop_id', shop.id)
    .gte('created_at', windowStart)
    .limit(1)
    .maybeSingle()
  if (recent) {
    await log('suppressed_duplicate')
    return NextResponse.json({ ok: true, result: 'suppressed_duplicate' })
  }

  // Per-shop spend guard so a flood of missed calls can't run up the bill.
  const shopLimit = await checkRateLimit('missedCallTextback', `shop:${shop.id}`)
  if (!shopLimit.ok) {
    await log('rate_limited')
    return NextResponse.json({ ok: true, result: 'rate_limited' })
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://chairos.cc'
  const bookingUrl = `${siteUrl}/book/${shop.shop_code}`
  const message = `Sorry we missed your call! Book online anytime here: ${bookingUrl}`

  try {
    const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
    const result = await withRetry('twilio_sms', () => twilioClient.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER!,
      to: caller.e164,
    }))
    await log('sent', { booking_url: bookingUrl, message_sid: result.sid })
    logger.info('missed_call_textback_sent', { shop: shop.id, sid: result.sid })
  } catch (err) {
    logger.error('missed_call_textback_failed', { message: err instanceof Error ? err.message : String(err) })
    await log('send_failed')
  }

  return NextResponse.json({ ok: true, result: 'sent' })
}
