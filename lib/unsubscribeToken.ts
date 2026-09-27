import jwt from 'jsonwebtoken'

const SECRET = process.env.SUPABASE_JWT_SECRET!

/**
 * Subject scheme for unsubscribe tokens:
 * - existing clients: the clients.id UUID (unchanged — emails already sent
 *   keep working)
 * - manual-list campaign recipients (no client row): `manual:<campaign_recipients.id>`
 * - legacy manual tokens (sent before this scheme): the raw email address —
 *   handled by the unsubscribe route as a fallback
 */
export const MANUAL_UNSUB_PREFIX = 'manual:'

export function generateUnsubscribeToken(clientId: string): string {
  return jwt.sign({ sub: clientId, purpose: 'email_unsubscribe' }, SECRET, { expiresIn: '365d' })
}

export function generateManualUnsubscribeToken(campaignRecipientId: string): string {
  return jwt.sign({ sub: `${MANUAL_UNSUB_PREFIX}${campaignRecipientId}`, purpose: 'email_unsubscribe' }, SECRET, { expiresIn: '365d' })
}

export function verifyUnsubscribeToken(token: string): string {
  // Pin the algorithm: these tokens are always HS256-signed by us
  // (algorithm-confusion hardening).
  const payload = jwt.verify(token, SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload
  if (payload.purpose !== 'email_unsubscribe' || !payload.sub) {
    throw new Error('Invalid token')
  }
  return payload.sub
}
