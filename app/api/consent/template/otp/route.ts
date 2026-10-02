import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash, randomInt } from 'crypto'
import { logger } from '@/lib/logger'
import { checkRateLimit } from '@/lib/rate-limit'
import { sendSMS } from '@/lib/sms'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function normalizeBare(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
}

/** Resolve the appointment's client phone (clients table, then appointment row). */
export async function resolveConsentPhone(admin: any, appointmentId: string): Promise<string | null> {
  const { data: appointment } = await admin
    .from('appointments')
    .select('id, client_id, client_phone')
    .eq('id', appointmentId)
    .maybeSingle()
  if (!appointment) return null
  let phone: string | null = appointment.client_phone ?? null
  if (appointment.client_id) {
    const { data: client } = await admin
      .from('clients')
      .select('phone')
      .eq('id', appointment.client_id)
      .maybeSingle()
    phone = client?.phone ?? phone
  }
  if (!phone) return null
  const bare = normalizeBare(phone)
  return bare.length === 10 ? bare : null
}

// POST /api/consent/template/otp — text a one-time code to the appointment's
// client phone so they can prove ownership before seeing PII or signing.
export async function POST(req: NextRequest) {
  const { appointmentId } = await req.json().catch(() => ({}))
  if (!appointmentId) {
    return NextResponse.json({ error: 'appointmentId is required' }, { status: 400 })
  }

  const admin = getAdmin()
  const bare = await resolveConsentPhone(admin, appointmentId)
  if (!bare) {
    return NextResponse.json(
      { error: 'No phone number on file for this appointment. Please contact the shop.' },
      { status: 400 }
    )
  }

  // Phone-scoped second check so one number can't be targeted from rotating IPs.
  const phoneLimit = await checkRateLimit('consentOtp', `phone:${bare}`)
  if (!phoneLimit.ok) {
    return NextResponse.json(
      { error: 'Too many code requests for this number. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(phoneLimit.retryAfterSeconds) } }
    )
  }

  const code = String(randomInt(100000, 1000000))
  const codeHash = createHash('sha256').update(code).digest('hex')
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()

  const { error: upsertError } = await admin.from('consent_otp_codes').upsert(
    { phone: bare, code_hash: codeHash, attempts: 0, expires_at: expiresAt },
    { onConflict: 'phone' }
  )
  if (upsertError) {
    logger.error('consent_otp_upsert_failed', { message: upsertError.message })
    return NextResponse.json({ error: 'Could not send a code right now' }, { status: 500 })
  }

  try {
    await sendSMS(`+1${bare}`, `Your ChairOS verification code is ${code}. It expires in 5 minutes.`)
  } catch (err) {
    logger.error('consent_otp_sms_failed', { message: (err as Error).message })
    return NextResponse.json({ error: 'Could not send a code right now' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
