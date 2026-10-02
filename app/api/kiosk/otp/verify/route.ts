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
  const { shopCode, phone, code, checkinAppointmentId, today } = await req.json()
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
    // Atomically increment the attempt counter with optimistic locking so
    // parallel guesses can't multiply the attempt budget (M9).
    let attempts = otpRow.attempts
    for (let i = 0; i < 3; i++) {
      const { data: inc } = await admin.from('kiosk_otp_codes')
        .update({ attempts: attempts + 1 })
        .eq('id', otpRow.id)
        .eq('attempts', attempts)
        .select('attempts')
        .maybeSingle()
      if (inc) { attempts = inc.attempts; break }
      const { data: fresh } = await admin.from('kiosk_otp_codes')
        .select('attempts').eq('id', otpRow.id).maybeSingle()
      if (!fresh) break
      attempts = fresh.attempts
    }
    if (attempts >= MAX_ATTEMPTS) {
      await admin.from('kiosk_otp_codes').delete().eq('id', otpRow.id)
      return NextResponse.json({ error: 'Too many incorrect attempts. Request a new code.' }, { status: 429 })
    }
    return NextResponse.json({ error: 'Incorrect code.' }, { status: 400 })
  }

  // Correct code -- consume it and create the real walk-in.
  await admin.from('kiosk_otp_codes').delete().eq('id', otpRow.id)

  // Appointment check-in: the kiosk looked the appointment up by phone
  // first, then proved ownership of that phone with the code above.
  // Same OTP security as the walk-in flow, no second code needed.
  if (checkinAppointmentId) {
    const { data: appt } = await admin
      .from('appointments')
      .select('id, shop_id, client_phone, client_name, date, time, status')
      .eq('id', checkinAppointmentId)
      .maybeSingle()
    const phoneMatches =
      !!appt &&
      String(appt.client_phone || '').replace(/\D/g, '').slice(-10) ===
        e164.replace(/\D/g, '').slice(-10)
    const todayValid = !today || /^\d{4}-\d{2}-\d{2}$/.test(String(today))
    const todayOk = todayValid && (!today || appt?.date === today)
    if (!appt || appt.shop_id !== shop.id || !phoneMatches || appt.status === 'cancelled' || !todayOk) {
      return NextResponse.json({ error: 'Could not check in that appointment.' }, { status: 400 })
    }
    const { error: confirmErr } = await admin
      .from('appointments')
      .update({ status: 'confirmed', updated_at: new Date().toISOString() })
      .eq('id', appt.id)
    if (confirmErr) {
      logger.error('kiosk_appt_checkin_failed', { shopId: shop.id, message: confirmErr.message })
      return NextResponse.json({ error: 'Could not check in right now' }, { status: 500 })
    }
    if (shop.owner_id) {
      await admin.from('notifications').insert({
        user_id: shop.owner_id,
        shop_id: shop.id,
        type: 'walk_in',
        title: 'Appointment check-in',
        body: `${appt.client_name} checked in at the kiosk for their appointment.`,
        link: `/dashboard/calendar?appt=${appt.id}`,
        read: false,
      })
    }
    logger.info('kiosk_appt_checkin', { shopId: shop.id, appointmentId: appt.id })
    return NextResponse.json({ appointmentId: appt.id })
  }

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
