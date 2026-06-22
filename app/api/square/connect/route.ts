import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Redirects the user to Square's OAuth authorization page.
// Query param ?role=owner|barber to track who is connecting.
export async function GET(req: NextRequest) {
  const role = req.nextUrl.searchParams.get('role') || 'owner'

  const appId = process.env.SQUARE_APP_ID
  if (!appId) {
    return NextResponse.json({ error: 'SQUARE_APP_ID not configured' }, { status: 500 })
  }

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
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  const state = Buffer.from(JSON.stringify({ userId: user.id, role })).toString('base64')

  const origin = new URL(req.url).origin
  const redirectUri = `${origin}/api/square/callback`

  const squareUrl = new URL('https://connect.squareup.com/oauth2/authorize')
  squareUrl.searchParams.set('client_id', appId)
  squareUrl.searchParams.set('scope', 'MERCHANT_PROFILE_READ PAYMENTS_READ PAYMENTS_WRITE')
  squareUrl.searchParams.set('redirect_uri', redirectUri)
  squareUrl.searchParams.set('state', state)
  squareUrl.searchParams.set('session', 'false')

  return NextResponse.redirect(squareUrl.toString())
}
