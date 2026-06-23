import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { randomBytes } from 'crypto'

const SCOPES = 'MERCHANT_PROFILE_READ PAYMENTS_WRITE PAYMENTS_READ ORDERS_WRITE ORDERS_READ'

// Redirects to Square OAuth. Pass ?role=owner|barber to route the callback correctly.
export async function GET(req: NextRequest) {
  const role = req.nextUrl.searchParams.get('role') || 'barber'

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cs) { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const origin = new URL(req.url).origin
  const redirectUri = `${origin}/api/square/callback`

  const isProd = process.env.SQUARE_ENVIRONMENT === 'production'
  const baseUrl = isProd
    ? 'https://connect.squareup.com/oauth2/authorize'
    : 'https://connect.squareupsandbox.com/oauth2/authorize'

  // Generate a cryptographically random nonce for CSRF protection
  const nonce = randomBytes(16).toString('hex')

  // Encode user ID, role, and nonce in state
  const state = Buffer.from(JSON.stringify({ userId: user.id, role, nonce })).toString('base64url')

  const url = new URL(baseUrl)
  url.searchParams.set('client_id', process.env.SQUARE_APPLICATION_ID!)
  url.searchParams.set('scope', SCOPES)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('state', state)
  url.searchParams.set('session', 'false')

  const response = NextResponse.redirect(url.toString())
  response.cookies.set('sq_oauth_nonce', nonce, {
    maxAge: 600,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  })
  return response
}
