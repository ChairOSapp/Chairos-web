import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash, randomUUID } from 'crypto'
import { logger } from '@/lib/logger'

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

const MAX_ATTEMPTS = 5

export async function POST(req: NextRequest) {
  const { shopCode, phone, code } = await req.json()
  if (!shopCode || !phone || !code) {
    return NextResponse.json({ error: 'shopCode, phone, and code are required' }, { status: 400 })
  }

  const e164 = normalizePhone(phone)
  const admin = getAdmin()

  const { data: shop } = await admin
    .from('shops')
    .select('id, owner_id')
    .eq('shop_code', shopCode)
    .maybeSingle()
  if (!shop) return NextResponse.json({ error: 'Shop not found' }, { status: 404 })

  const { data: otpRow } = await admin
    .from('kiosk_otp_codes')
    .select('*')
    .eq('shop_id', shop.id)
    .eq('phone', e164)
    .maybeSingle()

  if (!otpRow) {
    return NextResponse.json({ error: 'No code was requested for that number. Request a new one.' }, { status: 400 })
  }

  if (new Date(otpRow.expires_at) < new Date()) {
    await admin.from('kiosk_otp_codes').delete().eq('id', otpRow.id)
    return NextResponse.json({ error: 'That code expired. Request a new one.' }, { status: 400 })
  }

  if (otpRow.attempts >= MAX_ATTEMPTS) {
    await admin.from('kiosk_otp_codes').delete().eq('id', otpRow.id)
    return NextResponse.json({ error: 'Too many incorrect attempts. Request a new code.' }, { status: 429 })
  }

  const codeHash = createHash('sha256').update(String(code)).digest('hex')
  if (codeHash !== otpRow.code_hash) {
    await admin.from('kiosk_otp_codes').update({ attempts: otpRow.attempts + 1 }).eq('id', otpRow.id)
    return NextResponse.json({ error: 'Incorrect code.' }, { status: 400 })
  }

  // Correct code -- consume it and create the real walk-in.
  await admin.from('kiosk_otp_codes').delete().eq('id', otpRow.id)

  const walkInId = randomUUID()
  const { error: insertError } = await admin.from('walk_ins').insert({
    id: walkInId,
    shop_id: shop.id,
    client_name: otpRow.name,
    client_phone: e164,
    requested_barber_id: otpRow.requested_barber_id,
    service_id: otpRow.service_id,
  })

  if (insertError) {
    logger.error('kiosk_checkin_insert_failed', { shopId: shop.id, message: insertError.message })
    return NextResponse.json({ error: 'Could not check in right now' }, { status: 500 })
  }

  if (shop.owner_id) {
    await admin.from('notifications').insert({
      user_id: shop.owner_id,
      shop_id: shop.id,
      type: 'walk_in',
      title: 'Walk-in checked in',
      body: `${otpRow.name} checked in at the kiosk and is waiting.`,
      read: false,
    })
  }

  logger.info('kiosk_checkin', { shopId: shop.id, walkInId })
  return NextResponse.json({ id: walkInId })
}
