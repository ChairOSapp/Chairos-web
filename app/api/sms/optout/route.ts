import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Twilio sends a POST when a client replies STOP/HELP/etc.
export async function POST(req: NextRequest) {
  const body = await req.text()
  const params = new URLSearchParams(body)

  // Validate the request came from Twilio
  const signature = req.headers.get('x-twilio-signature') || ''
  const authToken = process.env.TWILIO_AUTH_TOKEN!
  // Construct the public URL — use forwarded host in production (Vercel sets x-forwarded-host)
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || ''
  const proto = req.headers.get('x-forwarded-proto') || 'https'
  const webhookUrl = `${proto}://${host}/api/sms/optout`
  const paramsObj = Object.fromEntries(params.entries())
  if (!twilio.validateRequest(authToken, signature, webhookUrl, paramsObj)) {
    console.warn('[sms/optout] Invalid Twilio signature — rejected')
    return new NextResponse('Forbidden', { status: 403 })
  }

  const from = params.get('From') ?? ''
  const messageBody = (params.get('Body') ?? '').trim().toUpperCase()

  const stopKeywords = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']
  if (!stopKeywords.includes(messageBody)) {
    // Not an opt-out — return empty TwiML response
    return new NextResponse('<Response></Response>', {
      headers: { 'Content-Type': 'text/xml' },
    })
  }

  const cleanPhone = from.replace(/\D/g, '')
  if (cleanPhone) {
    const supabase = getSupabase()
    await supabase
      .from('clients')
      .update({ sms_consent: false, sms_consent_at: null })
      .eq('phone', cleanPhone)
  }

  return new NextResponse(
    '<Response><Message>You have been unsubscribed and will no longer receive SMS messages. Reply START to resubscribe.</Message></Response>',
    { headers: { 'Content-Type': 'text/xml' } }
  )
}
