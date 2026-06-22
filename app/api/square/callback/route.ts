import { NextRequest, NextResponse } from 'next/server'
import { SquareClient, SquareEnvironment } from 'square'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state') // user ID encoded as state
  const errorParam = searchParams.get('error')

  if (errorParam || !code || !state) {
    return NextResponse.redirect(`${origin}/dashboard/barber/settings?square_error=access_denied`)
  }

  try {
    const redirectUri = `${origin}/api/square/callback`
    const isProd = process.env.SQUARE_ENVIRONMENT === 'production'

    // Exchange authorization code for access token
    const tokenRes = await fetch(
      isProd
        ? 'https://connect.squareup.com/oauth2/token'
        : 'https://connect.squareupsandbox.com/oauth2/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Square-Version': '2024-01-18' },
        body: JSON.stringify({
          client_id: process.env.SQUARE_APPLICATION_ID,
          client_secret: process.env.SQUARE_APPLICATION_SECRET,
          code,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
        }),
      }
    )

    const tokenData = await tokenRes.json()

    if (!tokenRes.ok || !tokenData.access_token) {
      console.error('Square token exchange failed:', tokenData)
      return NextResponse.redirect(`${origin}/dashboard/barber/settings?square_error=token_failed`)
    }

    // Fetch merchant locations using the new access token
    const barberClient = new SquareClient({
      token: tokenData.access_token,
      environment: isProd ? SquareEnvironment.Production : SquareEnvironment.Sandbox,
    })

    const { locations } = await barberClient.locations.list()
    const primaryLocation = locations?.find(l => l.status === 'ACTIVE') ?? locations?.[0]

    await supabase
      .from('square_accounts')
      .upsert(
        {
          user_id: state,
          square_merchant_id: tokenData.merchant_id,
          square_access_token: tokenData.access_token,
          square_refresh_token: tokenData.refresh_token ?? null,
          square_location_id: primaryLocation?.id ?? null,
          connected_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )

    return NextResponse.redirect(`${origin}/dashboard/barber/settings?square_connected=1`)
  } catch (err: any) {
    console.error('Square OAuth callback error:', err)
    return NextResponse.redirect(`${origin}/dashboard/barber/settings?square_error=server_error`)
  }
}
