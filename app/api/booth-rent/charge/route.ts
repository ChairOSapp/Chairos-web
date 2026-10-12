import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { runBoothRentChargeForPayment } from '@/src/trigger/boothRentCharge'

async function getUserId() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: {
        getAll: () => cookieStore.getAll(),
        // Without setAll, a token rotation during this request is
        // dropped on the floor — the pattern every other route uses.
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            try { cookieStore.set(name, value, options) } catch { /* read-only context */ }
          })
        },
      } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

// POST /api/booth-rent/charge
// { paymentId } — Owner taps "Charge" to run a barber's card for booth rent.
export async function POST(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { paymentId } = await req.json().catch(() => ({}))
  if (!paymentId) return NextResponse.json({ error: 'paymentId is required' }, { status: 400 })

  const result = await runBoothRentChargeForPayment(paymentId, userId)
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 400 })
  return NextResponse.json({ ok: true, message: result.message })
}
