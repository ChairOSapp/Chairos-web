import { logger } from '@/lib/logger'

/**
 * Server-side Cloudflare Turnstile verification.
 * Returns true when the token verifies. When TURNSTILE_SECRET_KEY is not
 * configured, logs loudly and returns true (fail-open) so booking keeps
 * working — the secret must be added in Vercel for enforcement (M7).
 */
export async function verifyTurnstileToken(token: string | null | undefined): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) {
    logger.warn('turnstile_not_configured')
    return true
  }
  if (!token) return false
  try {
    const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token }),
    })
    const data = await verifyRes.json()
    if (!data.success) {
      logger.warn('turnstile_failed', { errorCodes: data['error-codes'] })
      return false
    }
    return true
  } catch (err) {
    logger.error('turnstile_verify_error', { message: (err as Error).message })
    return false
  }
}
