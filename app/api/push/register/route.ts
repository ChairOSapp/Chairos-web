import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { registerPushToken, unregisterPushToken } from '@/lib/push'

async function getUserId() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

// Called by the iOS app on launch (and whenever the APNs token rotates).
// APNs device tokens are 64 hex chars; anything else is rejected.
// Every attempt is logged to push_reg_debug (service-role insert) so a
// missing push_tokens row can be traced to client vs server.
export async function POST(req: NextRequest) {
  const userId = await getUserId()
  const { token, platform, clientError } = await req.json().catch(() => ({}))
  const tokenOk = typeof token === 'string' && /^[0-9a-fA-F]{64}$/.test(token)

  const result =
    typeof clientError === 'string' && clientError
      ? `client_error:${clientError.slice(0, 120)}`
      : !userId
        ? 'unauthorized'
        : !tokenOk
          ? 'bad_token'
          : 'accepted'
  try {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    await admin.from('push_reg_debug').insert({
      has_user: !!userId,
      token_prefix: typeof token === 'string' ? token.slice(0, 8) : null,
      token_ok: tokenOk,
      platform: typeof platform === 'string' ? platform : null,
      result,
    })
  } catch {
    // Debug logging must never break registration.
  }

  if (result.startsWith('client_error')) return NextResponse.json({ ok: true })
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!tokenOk) {
    return NextResponse.json({ error: 'Invalid device token' }, { status: 400 })
  }
  const plat = platform === 'android' ? 'android' : 'ios'

  try {
    await registerPushToken(userId, token, plat)
  } catch (e) {
    return NextResponse.json({ error: 'Could not save token' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

// Called on sign-out so a logged-out device stops receiving this user's pushes.
export async function DELETE(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { token } = await req.json().catch(() => ({}))
  if (typeof token !== 'string' || !token) {
    return NextResponse.json({ error: 'Invalid device token' }, { status: 400 })
  }
  await unregisterPushToken(userId, token)
  return NextResponse.json({ ok: true })
}
