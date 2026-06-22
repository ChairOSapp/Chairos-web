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
  const state = searchParams.get('state')
  const errorParam = searchParams.get('error')

  // Decode role from state; fall back to barber for backward compat with old plain-userId state
  let userId = state || ''
  let role = 'barber'
  try {
    const parsed = JSON.parse(Buffer.from(state || '', 'base64url').toString())
    userId = parsed.userId
    role = parsed.role || 'barber'
  } catch {
    // old-style state was just a raw user ID string — keep as-is, role stays 'barber'
    userId = state || ''
  }

  const settingsPath = role === 'owner' ? '/dashboard/settings' : '/dashboard/barber/settings'

  if (errorParam || !code || !userId) {
    return NextResponse.redirect(`${origin}${settingsPath}?square_error=access_denied`)
  }

  try {
    const redirectUri = `${origin}/api/square/callback`
    const isProd = process.env.SQUARE_ENVIRONMENT === 'production'

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
      return NextResponse.redirect(`${origin}${settingsPath}?square_error=token_failed`)
    }

    const client = new SquareClient({
      token: tokenData.access_token,
      environment: isProd ? SquareEnvironment.Production : SquareEnvironment.Sandbox,
    })

    const { locations } = await client.locations.list()
    const primaryLocation = locations?.find(l => l.status === 'ACTIVE') ?? locations?.[0]

    // Look up shop_id for this user
    let shopId: string | null = null
    if (role === 'owner') {
      const { data: shop } = await supabase
        .from('shops').select('id').eq('owner_id', userId).maybeSingle()
      shopId = shop?.id ?? null
    } else {
      const { data: sb } = await supabase
        .from('shop_barbers').select('shop_id').eq('barber_id', userId).eq('active', true).maybeSingle()
      shopId = sb?.shop_id ?? null
    }

    await supabase
      .from('square_accounts')
      .upsert(
        {
          user_id: userId,
          shop_id: shopId,
          square_merchant_id: tokenData.merchant_id,
          square_access_token: tokenData.access_token,
          square_refresh_token: tokenData.refresh_token ?? null,
          square_location_id: primaryLocation?.id ?? null,
          connected_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )

    return NextResponse.redirect(`${origin}${settingsPath}?square_connected=1`)
  } catch (err: any) {
    console.error('Square OAuth callback error:', err)
    return NextResponse.redirect(`${origin}${settingsPath}?square_error=server_error`)
  }
}
