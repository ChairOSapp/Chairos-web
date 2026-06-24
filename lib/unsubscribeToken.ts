import jwt from 'jsonwebtoken'

const SECRET = process.env.SUPABASE_JWT_SECRET!

export function generateUnsubscribeToken(clientId: string): string {
  return jwt.sign({ sub: clientId, purpose: 'email_unsubscribe' }, SECRET, { expiresIn: '365d' })
}

export function verifyUnsubscribeToken(token: string): string {
  const payload = jwt.verify(token, SECRET) as jwt.JwtPayload
  if (payload.purpose !== 'email_unsubscribe' || !payload.sub) {
    throw new Error('Invalid token')
  }
  return payload.sub
}
