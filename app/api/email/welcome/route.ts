import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getResend } from '@/lib/resend'
import { logger } from '@/lib/logger'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: NextRequest) {
  // Fail-closed per-IP bucket (also wired for this path in proxy.ts).
  const rateLimit = await checkRateLimit('email', getClientIp(req))
  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    )
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    }
  )

  // Not an open relay: only the signed-in user can trigger this, and the
  // recipient is always their own address.
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionEmail = user.email ?? ''
  if (!EMAIL_RE.test(sessionEmail)) {
    return NextResponse.json({ error: 'No valid email on session' }, { status: 400 })
  }

  // The body carries no identity — everything is derived from the session.
  // If a caller passes an email anyway, it must match the session email.
  let bodyEmail: unknown = null
  try {
    const body = await req.json()
    bodyEmail = body?.email ?? null
  } catch {
    // Empty/missing body is fine — nothing in it is trusted anyway.
  }
  if (bodyEmail != null && bodyEmail !== sessionEmail) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    logger.warn('welcome_email_not_configured')
    return NextResponse.json({ ok: true })
  }

  // Name comes from the auth session / own profile row, never the body.
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  let displayName = typeof meta.full_name === 'string' ? meta.full_name.trim() : ''
  let role = typeof meta.role === 'string' ? meta.role : ''
  if (!displayName || !role) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, role')
      .eq('id', user.id)
      .maybeSingle()
    if (!displayName) displayName = (profile?.full_name ?? '').trim()
    if (!role) role = profile?.role ?? ''
  }

  const firstName = escapeHtml(displayName.split(' ')[0] || 'there')
  const nextStep = role === 'owner'
    ? "Next, sign in and we'll walk you through setting up your shop."
    : "Next, sign in and you'll be taken straight to choose your plan."

  try {
    await getResend().emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to: sessionEmail,
      subject: 'Welcome to ChairOS',
      html: `
        <p>Hi ${firstName},</p>
        <p>Welcome to ChairOS! Your account is set up and your 30-day free trial has started.</p>
        <p>${nextStep}</p>
        <p>Questions? Just reply to this email.</p>
        <p>— The ChairOS team</p>
      `,
    })
    logger.info('welcome_email_sent', { role })
  } catch (err: any) {
    logger.error('welcome_email_failed', { message: err.message })
  }

  return NextResponse.json({ ok: true })
}
