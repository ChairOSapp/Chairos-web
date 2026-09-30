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

function twimlHangup() {
  return new NextResponse(
    '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>',
    { headers: { 'Content-Type': 'text/xml' } }
  )
}

// Voice webhook for PLATFORM-PROVISIONED missed-call numbers
// (shops.missed_call_number, the paid add-on). The shop forwards
// unanswered calls to this number, so any call that arrives here IS a
// missed call by definition — no <Dial>, no status checks. The caller
// gets one transactional SMS with the shop's booking link and the call
// hangs up.
//
// Every outcome is logged to automation_logs (type 'missed_call_textback')
// so owners can see what was sent and what was suppressed. Non-2xx is
// reserved for signature failures only — Twilio retries those; every
// business-logic outcome returns TwiML so a permanently-unresolvable
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
  const webhookUrl = `${proto}://${host}/api/voice/inbound-call`
  const paramsObj = Object.fromEntries(params.entries())
  if (!twilio.validateRequest(authToken, signature, webhookUrl, paramsObj)) {
    logger.warn('voice_inbound_call_invalid_signature')
    return new NextResponse('Forbidden', { status: 403 })
  }

  const callSid = params.get('CallSid') || ''
  const called = normalizePhone(params.get('To') || '')
  const caller = normalizePhone(params.get('From') || '')

  if (!called.e164 || !caller.e164) {
    return twimlHangup()
  }

  // Resolve the shop from the platform-provisioned number that was called.
  const { data: shop } = await supabase
    .from('shops')
    .select('id, shop_code, owner_id, missed_call_addon_active, missed_call_textback_enabled, missed_call_number')
    .in('missed_call_number', [called.e164, called.bare])
    .maybeSingle()

  async function log(result: string, extra: Record<string, unknown> = {}) {
    await supabase.from('automation_logs').insert({
      type: 'missed_call_textback',
      payload: {
        shop_id: shop?.id ?? null,
        caller: caller.e164,
        call_sid: callSid,
        via: 'platform_number',
        ...extra,
      },
      result,
    })
  }

  if (!shop) {
    await log('unknown_number')
    return twimlHangup()
  }

  // Paid add-on: the number only works while the subscription item is live.
  if (!shop.missed_call_addon_active) {
    await log('addon_inactive')
    return twimlHangup()
  }

  // Strictly opt-in — default OFF so no shop accrues surprise SMS spend.
  if (!shop.missed_call_textback_enabled) {
    await log('disabled')
    return twimlHangup()
  }

  // Billing gate: text-backs spend the platform's Twilio budget, so
  // expired/blocked shops don't send (same gate as campaign/SMS sends).
  if (shop.owner_id) {
    const billingBlock = await requireActiveBilling(supabase, shop.owner_id)
    if (billingBlock) {
      await log('billing_blocked')
      return twimlHangup()
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
    return twimlHangup()
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
    return twimlHangup()
  }

  // Per-shop spend guard so a flood of missed calls can't run up the bill.
  const shopLimit = await checkRateLimit('missedCallTextback', `shop:${shop.id}`)
  if (!shopLimit.ok) {
    await log('rate_limited')
    return twimlHangup()
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://chairos.cc'
  const bookingUrl = `${siteUrl}/book/${shop.shop_code}`
  const message = `Sorry we missed your call! Book online anytime here: ${bookingUrl}`

  try {
    const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
    const result = await withRetry('twilio_sms', () => twilioClient.messages.create({
      body: message,
      // Text from the number they just called, so they recognize it.
      from: shop.missed_call_number!,
      to: caller.e164,
    }))
    await log('sent', { booking_url: bookingUrl, message_sid: result.sid })
    logger.info('missed_call_textback_sent', { shop: shop.id, sid: result.sid, via: 'platform_number' })
  } catch (err) {
    logger.error('missed_call_textback_failed', { message: err instanceof Error ? err.message : String(err) })
    await log('send_failed')
  }

  return twimlHangup()
}
