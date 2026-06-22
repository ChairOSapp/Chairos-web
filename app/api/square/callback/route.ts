import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Handles Square OAuth callback — exchanges the code for an access token
// and saves it to either shops (owner) or shop_barbers (barber).
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const errorParam = searchParams.get('error')

  const origin = new URL(req.url).origin

  if (errorParam) {
    return NextResponse.redirect(`${origin}/dashboard/settings?square_error=${errorParam}`)
  }

  if (!code || !state) {
    return NextResponse.redirect(`${origin}/dashboard/settings?square_error=missing_params`)
  }

  let parsed: { userId: string; role: string }
  try {
    parsed = JSON.parse(Buffer.from(state, 'base64').toString())
  } catch {
    return NextResponse.redirect(`${origin}/dashboard/settings?square_error=invalid_state`)
  }

  const { userId, role } = parsed
  const redirectBase = role === 'barber' ? `${origin}/dashboard/barber/settings` : `${origin}/dashboard/settings`

  const appId = process.env.SQUARE_APP_ID
  const appSecret = process.env.SQUARE_APP_SECRET
  if (!appId || !appSecret) {
    return NextResponse.redirect(`${redirectBase}?square_error=not_configured`)
  }

  const redirectUri = `${origin}/api/square/callback`

  const tokenRes = await fetch('https://connect.squareup.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Square-Version': '2024-01-18' },
    body: JSON.stringify({
      client_id: appId,
      client_secret: appSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  })

  if (!tokenRes.ok) {
    return NextResponse.redirect(`${redirectBase}?square_error=token_exchange_failed`)
  }

  const tokenData = await tokenRes.json()
  const { access_token, refresh_token, expires_at, merchant_id } = tokenData

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  if (role === 'barber') {
    await supabase.from('shop_barbers').update({
      square_access_token: access_token,
      square_refresh_token: refresh_token,
      square_merchant_id: merchant_id,
      square_token_expires_at: expires_at,
    }).eq('barber_id', userId)
  } else {
    await supabase.from('shops').update({
      square_access_token: access_token,
      square_refresh_token: refresh_token,
      square_merchant_id: merchant_id,
      square_token_expires_at: expires_at,
    }).eq('owner_id', userId)
  }

  return NextResponse.redirect(`${redirectBase}?square_connected=1`)
}
