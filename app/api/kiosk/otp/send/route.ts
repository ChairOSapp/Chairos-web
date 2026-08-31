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
  const { shopCode, name, phone, requestedBarberId, serviceId } = await req.json()
  if (!shopCode || !name || !phone) {
    return NextResponse.json({ error: 'shopCode, name, and phone are required' }, { status: 400 })
  }

  const e164 = normalizePhone(phone)
  if (e164.length !== 12) {
    return NextResponse.json({ error: 'Enter a valid 10-digit phone number' }, { status: 400 })
  }

  // IP-based abuse is covered by proxy.ts (the 'kioskOtp' bucket applied
  // to every /api/kiosk/otp/* path); this second check is phone-scoped so
  // one number can't be targeted repeatedly from rotating IPs.
  const phoneLimit = await checkRateLimit('kioskOtp', `phone:${e164}`)
  if (!phoneLimit.ok) {
    return NextResponse.json(
      { error: 'Too many code requests for this number. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(phoneLimit.retryAfterSeconds) } }
    )
  }

  const admin = getAdmin()

  const { data: shop } = await admin
    .from('shops')
    .select('id')
    .eq('shop_code', shopCode)
    .maybeSingle()
  if (!shop) return NextResponse.json({ error: 'Shop not found' }, { status: 404 })

  // requestedBarberId / serviceId are optional and caller-controlled --
  // validate they actually belong to this shop before storing them,
  // same defense-in-depth already used in /api/book/membership.
  let validatedBarberId: string | null = null
  if (requestedBarberId) {
    const { data: barber } = await admin
      .from('shop_barbers')
      .select('barber_id')
      .eq('shop_id', shop.id)
      .eq('barber_id', requestedBarberId)
      .eq('active', true)
      .maybeSingle()
    validatedBarberId = barber?.barber_id || null
  }
  let validatedServiceId: string | null = null
  if (serviceId) {
    const { data: service } = await admin
      .from('services')
      .select('id')
      .eq('shop_id', shop.id)
      .eq('id', serviceId)
      .eq('active', true)
      .maybeSingle()
    validatedServiceId = service?.id || null
  }

  const code = String(Math.floor(100000 + Math.random() * 900000))
  const codeHash = createHash('sha256').update(code).digest('hex')
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()

  const { error: upsertError } = await admin.from('kiosk_otp_codes').upsert({
    shop_id: shop.id,
    phone: e164,
    code_hash: codeHash,
    name,
    requested_barber_id: validatedBarberId,
    service_id: validatedServiceId,
    attempts: 0,
    expires_at: expiresAt,
  }, { onConflict: 'shop_id,phone' })

  if (upsertError) {
    logger.error('kiosk_otp_upsert_failed', { shopId: shop.id, message: upsertError.message })
    return NextResponse.json({ error: 'Could not send a code right now' }, { status: 500 })
  }

  try {
    const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
    await withRetry('kiosk_otp_sms', () => twilioClient.messages.create({
      body: `Your ChairOS check-in code is ${code}. It expires in 5 minutes.`,
      from: process.env.TWILIO_PHONE_NUMBER!,
      to: e164,
    }))
  } catch (err: any) {
    logger.error('kiosk_otp_sms_failed', { shopId: shop.id, message: err.message })
    return NextResponse.json({ error: 'Could not text a code to that number. Check it and try again.' }, { status: 500 })
  }

  logger.info('kiosk_otp_sent', { shopId: shop.id })
  return NextResponse.json({ ok: true })
}
