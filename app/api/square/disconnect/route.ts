import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function POST(req: NextRequest) {
  const { role } = await req.json() as { role: 'owner' | 'barber' }

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

  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  if (role === 'barber') {
    await serviceClient.from('shop_barbers').update({
      square_access_token: null,
      square_refresh_token: null,
      square_merchant_id: null,
      square_token_expires_at: null,
    }).eq('barber_id', user.id)
  } else {
    await serviceClient.from('shops').update({
      square_access_token: null,
      square_refresh_token: null,
      square_merchant_id: null,
      square_token_expires_at: null,
    }).eq('owner_id', user.id)
  }

  return NextResponse.json({ ok: true })
}
