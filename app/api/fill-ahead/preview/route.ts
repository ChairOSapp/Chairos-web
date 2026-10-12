import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { planFillAhead } from '@/lib/fillAhead'

// Fill Ahead preview: for a target date (usually tomorrow, in the
// shop's local frame -- the dashboard sends its own local dates), which
// open slots could be offered to which due clients, and what are they
// worth? Read-only; the send route re-plans at send time. Candidate
// phone numbers never leave the server -- the preview carries first
// names and counts only.

async function resolveShopId(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data: owned } = await admin
    .from('shops')
    .select('id')
    .eq('owner_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (owned?.id) return owned.id as string
  const { data: staffRow } = await admin
    .from('shop_barbers')
    .select('shop_id')
    .eq('barber_id', userId)
    .eq('active', true)
    .limit(1)
    .maybeSingle()
  return (staffRow?.shop_id as string) ?? null
}

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          },
        },
      }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const date = req.nextUrl.searchParams.get('date') || ''
    const today = req.nextUrl.searchParams.get('today') || ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) {
      return NextResponse.json({ error: 'date and today are required (YYYY-MM-DD)' }, { status: 400 })
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const shopId = await resolveShopId(admin, user.id)
    if (!shopId) return NextResponse.json({ error: 'No shop found for this account' }, { status: 403 })

    const plan = await planFillAhead(admin, shopId, date, today)
    return NextResponse.json({
      date: plan.date,
      totalValue: plan.totalValue,
      offers: plan.offers.map(o => ({
        barberName: o.barberName,
        serviceName: o.serviceName,
        price: o.price,
        time: o.time,
        timeDisplay: o.timeDisplay,
        leadFirstName: (o.candidates[0]?.clientName || '').split(' ')[0] || 'A client',
        backupCount: Math.max(0, o.candidates.length - 1),
      })),
    })
  } catch (err) {
    console.error('[fill-ahead/preview] unhandled error', err)
    return NextResponse.json(
      { error: `Fill Ahead preview hit a server error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    )
  }
}
