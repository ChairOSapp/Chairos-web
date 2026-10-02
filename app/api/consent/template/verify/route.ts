import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import { getTemplatePayload } from '@/lib/consent/templatePayload'
import { resolveConsentPhone } from '../otp/route'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const MAX_ATTEMPTS = 5

// POST /api/consent/template/verify — check the SMS code, then hand over
// the full signing payload (PII + signing token). This is the only path
// that issues those; the GET route no longer does (M3/M5).
export async function POST(req: NextRequest) {
  const { appointmentId, code } = await req.json().catch(() => ({}))
  if (!appointmentId || !code) {
    return NextResponse.json({ error: 'appointmentId and code are required' }, { status: 400 })
  }

  const admin = getAdmin()
  const bare = await resolveConsentPhone(admin, appointmentId)
  if (!bare) {
    return NextResponse.json({ error: 'No phone number on file for this appointment.' }, { status: 400 })
  }

  const { data: otpRow } = await admin
    .from('consent_otp_codes')
    .select('code_hash, attempts, expires_at')
    .eq('phone', bare)
    .maybeSingle()
  if (!otpRow) {
    return NextResponse.json({ error: 'No code was sent. Request a new one.' }, { status: 400 })
  }
  if (new Date(otpRow.expires_at) < new Date()) {
    await admin.from('consent_otp_codes').delete().eq('phone', bare)
    return NextResponse.json({ error: 'That code expired. Request a new one.' }, { status: 400 })
  }

  const codeHash = createHash('sha256').update(String(code).trim()).digest('hex')
  if (codeHash !== otpRow.code_hash) {
    // Atomic increment with optimistic locking (same pattern as M9).
    let attempts = otpRow.attempts
    for (let i = 0; i < 3; i++) {
      const { data: inc } = await admin.from('consent_otp_codes')
        .update({ attempts: attempts + 1 })
        .eq('phone', bare)
        .eq('attempts', attempts)
        .select('attempts')
        .maybeSingle()
      if (inc) { attempts = inc.attempts; break }
      const { data: fresh } = await admin.from('consent_otp_codes')
        .select('attempts').eq('phone', bare).maybeSingle()
      if (!fresh) break
      attempts = fresh.attempts
    }
    if (attempts >= MAX_ATTEMPTS) {
      await admin.from('consent_otp_codes').delete().eq('phone', bare)
      return NextResponse.json({ error: 'Too many incorrect attempts. Request a new code.' }, { status: 429 })
    }
    return NextResponse.json({ error: 'Incorrect code.' }, { status: 400 })
  }

  // Code correct — consume it so it can't be replayed.
  await admin.from('consent_otp_codes').delete().eq('phone', bare)

  const payload = await getTemplatePayload(admin, appointmentId)
  if ((payload as any).error) {
    return NextResponse.json({ error: (payload as any).error }, { status: (payload as any).status || 500 })
  }
  return NextResponse.json(payload)
}
