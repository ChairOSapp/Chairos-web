import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'

export async function POST(req: NextRequest) {
  const { token } = await req.json()

  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) {
    // Dormant until configured, same pattern as the Supabase Auth
    // Turnstile integration on signup/login -- this is a *separate*
    // secret key from that one (Supabase holds its own internally and
    // doesn't expose it back to the app), so it needs its own env var
    // to call Cloudflare's siteverify endpoint directly.
    logger.warn('booking_captcha_not_configured')
    return NextResponse.json({ ok: true })
  }

  if (!token) {
    return NextResponse.json({ error: 'Captcha verification required' }, { status: 400 })
  }

  const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ secret, response: token }),
  })
  const verifyData = await verifyRes.json()

  if (!verifyData.success) {
    logger.warn('booking_captcha_failed', { errorCodes: verifyData['error-codes'] })
    return NextResponse.json({ error: 'Captcha verification failed' }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
