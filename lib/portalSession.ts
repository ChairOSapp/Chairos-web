// Session handling for the client-facing portal (/my). Portal visitors
// have no Supabase Auth account -- they're contact records in `clients`,
// not auth.users -- so this is a lightweight signed cookie, not a Supabase
// session. That means RLS can't key off auth.uid() here: every portal API
// route runs under the service-role client and enforces "a client can only
// see their own data" itself, by resolving the verified phone from this
// cookie before ever querying anything -- the same trust model this app
// already uses for the public booking flow and kiosk check-in (both also
// anonymous, both also service-role + app-level scoping). The new portal
// tables (client_accounts, client_portal_otp_codes) stay RLS-locked to
// service-role-only as defense in depth, matching booking_sessions.
import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'

const COOKIE_NAME = 'chairos_portal_session'
const SESSION_DAYS = 90

export interface PortalSessionPayload {
  clientAccountId: string
  phone: string
}

function secret(): string {
  const s = process.env.SUPABASE_JWT_SECRET
  if (!s) throw new Error('SUPABASE_JWT_SECRET is not set')
  return s
}

export function issuePortalSession(res: NextResponse, payload: PortalSessionPayload) {
  const token = jwt.sign(payload, secret(), { expiresIn: `${SESSION_DAYS}d` })
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  })
}

export function clearPortalSession(res: NextResponse) {
  res.cookies.set(COOKIE_NAME, '', { path: '/', maxAge: 0 })
}

export function readPortalSession(req: NextRequest): PortalSessionPayload | null {
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return null
  try {
    const decoded = jwt.verify(token, secret()) as PortalSessionPayload
    if (!decoded?.clientAccountId || !decoded?.phone) return null
    return decoded
  } catch {
    return null
  }
}
