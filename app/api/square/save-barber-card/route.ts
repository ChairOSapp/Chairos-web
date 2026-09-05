import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { saveCardForBarber } from '@/lib/square'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// A barber saves their own card on file so booth rent can be charged to
// it automatically (src/trigger/boothRentCharge.ts). Self-service only --
// a barber can save their own card, never someone else's; the owner isn't
// authorized here since it's the barber's payment method, not the
// shop's/owner's.
export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cs) { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
      },
    }
  )
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sourceId } = await req.json()
  if (!sourceId) return NextResponse.json({ error: 'sourceId is required' }, { status: 400 })

  const admin = getAdmin()
  const { data: shopBarber } = await admin
    .from('shop_barbers')
    .select('id')
    .eq('barber_id', user.id)
    .eq('active', true)
    .maybeSingle()
  if (!shopBarber) return NextResponse.json({ error: 'No active staff record found for this account' }, { status: 404 })

  const result = await saveCardForBarber(admin, shopBarber.id, sourceId)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status || 500 })
  return NextResponse.json({ ok: true, last4: result.last4, brand: result.brand })
}
