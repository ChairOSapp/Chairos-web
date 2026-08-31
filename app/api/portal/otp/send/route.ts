import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import twilio from 'twilio'
import { logger } from '@/lib/logger'
import { withRetry } from '@/lib/retry'
import { checkRateLimit } from '@/lib/rate-limit'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  const bare = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  return `+1${bare}`
}

export async function POST(req: NextRequest) {
  const { phone } = await req.json()
  if (!phone) return NextResponse.json({ error: 'phone is required' }, { status: 400 })

  const e164 = normalizePhone(phone)
  if (e164.length !== 12) {
    return NextResponse.json({ error: 'Enter a valid 10-digit phone number' }, { status: 400 })
  }

  // IP-based abuse is covered by proxy.ts (the 'portalOtp' bucket applied
  // to every /api/portal/otp/* path); this second check is phone-scoped so
  // one number can't be targeted repeatedly from rotating IPs.
  const phoneLimit = await checkRateLimit('portalOtp', `phone:${e164}`)
  if (!phoneLimit.ok) {
    return NextResponse.json(
      { error: 'Too many code requests for this number. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(phoneLimit.retryAfterSeconds) } }
    )
  }

  const admin = getAdmin()
  const code = String(Math.floor(100000 + Math.random() * 900000))
  const codeHash = createHash('sha256').update(code).digest('hex')
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()

  const { error: upsertError } = await admin.from('client_portal_otp_codes').upsert({
    phone: e164,
    code_hash: codeHash,
    attempts: 0,
    expires_at: expiresAt,
  }, { onConflict: 'phone' })

  if (upsertError) {
    logger.error('portal_otp_upsert_failed', { message: upsertError.message })
    return NextResponse.json({ error: 'Could not send a code right now' }, { status: 500 })
  }

  try {
    const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
    await withRetry('portal_otp_sms', () => twilioClient.messages.create({
      body: `Your ChairOS code is ${code}. It expires in 5 minutes.`,
      from: process.env.TWILIO_PHONE_NUMBER!,
      to: e164,
    }))
  } catch (err: any) {
    logger.error('portal_otp_sms_failed', { message: err.message })
    return NextResponse.json({ error: 'Could not text a code to that number. Check it and try again.' }, { status: 500 })
  }

  logger.info('portal_otp_sent', {})
  return NextResponse.json({ ok: true })
}
