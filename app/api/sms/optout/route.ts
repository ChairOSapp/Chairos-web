import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'

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

  // Unrecognized keyword — no DB change, empty TwiML acknowledgement.
  return twimlEmpty()
}
