import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import { logger } from '@/lib/logger'
import { issuePortalSession } from '@/lib/portalSession'
import { resolvePortalClient } from '@/lib/portalData'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// clients.phone is stored bare (10 digits) app-wide -- client_accounts
// and client_portal_otp_codes use the same bare key so resolvePortalClient
// (which joins straight to clients.phone) actually matches.
function normalizeBare(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
}

const MAX_ATTEMPTS = 5

export async function POST(req: NextRequest) {
  const { phone, code } = await req.json()
  if (!phone || !code) return NextResponse.json({ error: 'phone and code are required' }, { status: 400 })

  const bare = normalizeBare(phone)
  const admin = getAdmin()

  const { data: otpRow } = await admin
    .from('client_portal_otp_codes')
    .select('*')
    .eq('phone', bare)
    .maybeSingle()

  if (!otpRow) {
    return NextResponse.json({ error: 'No code was requested for that number. Request a new one.' }, { status: 400 })
  }

  if (new Date(otpRow.expires_at) < new Date()) {
    await admin.from('client_portal_otp_codes').delete().eq('phone', bare)
    return NextResponse.json({ error: 'That code expired. Request a new one.' }, { status: 400 })
  }

  if (otpRow.attempts >= MAX_ATTEMPTS) {
    await admin.from('client_portal_otp_codes').delete().eq('phone', bare)
    return NextResponse.json({ error: 'Too many incorrect attempts. Request a new code.' }, { status: 429 })
  }

  const codeHash = createHash('sha256').update(String(code)).digest('hex')
  if (codeHash !== otpRow.code_hash) {
    await admin.from('client_portal_otp_codes').update({ attempts: otpRow.attempts + 1 }).eq('phone', bare)
    return NextResponse.json({ error: 'Incorrect code.' }, { status: 400 })
  }

  // Correct code -- consume it and establish the portal session.
  await admin.from('client_portal_otp_codes').delete().eq('phone', bare)

  const { data: account } = await admin
    .from('client_accounts')
    .upsert({ phone: bare, last_login_at: new Date().toISOString() }, { onConflict: 'phone' })
    .select('id')
    .single()

  if (!account) {
    return NextResponse.json({ error: 'Could not sign you in right now' }, { status: 500 })
  }

  const portalClient = await resolvePortalClient(admin, bare)

  logger.info('portal_login', { hasClientRecord: !!portalClient })

  const res = NextResponse.json({ ok: true, client: portalClient })
  issuePortalSession(res, { clientAccountId: account.id, phone: bare })
  return res
}
