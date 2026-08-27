import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { isAdminEmail } from '@/lib/admin'

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function getRequestUser(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// Founder-only, read-only bird's-eye view of every shop on the platform.
// Deliberately returns aggregates only (counts, sums, dates) -- never
// exposes client PII (names/phones) or lets the caller mutate anything.
export async function GET(req: NextRequest) {
  const user = await getRequestUser(req)
  if (!isAdminEmail(user?.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = getAdminSupabase()

  const [
    { data: shops, error: shopsErr },
    { data: profiles },
    { data: appointments },
    { data: memberships },
    { data: locks },
  ] = await Promise.all([
    supabase.from('shops').select('id, name, vertical, shop_code, owner_id, created_at'),
    supabase.from('profiles').select('id, email, full_name, subscription_status'),
    supabase.from('appointments').select('shop_id, created_at, price, status'),
    supabase.from('client_shop_memberships').select('shop_id'),
    supabase.from('client_locks').select('shop_id, locked'),
  ])

  if (shopsErr) return NextResponse.json({ error: shopsErr.message }, { status: 500 })

  const profileById = new Map((profiles ?? []).map(p => [p.id, p]))

  const apptsByShop = new Map<string, { count: number; lastActiveAt: string | null; revenue: number }>()
  for (const a of appointments ?? []) {
    const entry = apptsByShop.get(a.shop_id) ?? { count: 0, lastActiveAt: null, revenue: 0 }
    entry.count++
    if (!entry.lastActiveAt || a.created_at > entry.lastActiveAt) entry.lastActiveAt = a.created_at
    if (a.status === 'done') entry.revenue += Number(a.price) || 0
    apptsByShop.set(a.shop_id, entry)
  }

  const clientCountByShop = new Map<string, number>()
  for (const m of memberships ?? []) {
    clientCountByShop.set(m.shop_id, (clientCountByShop.get(m.shop_id) ?? 0) + 1)
  }

  const lockedCountByShop = new Map<string, number>()
  for (const l of locks ?? []) {
    if (!l.locked) continue
    lockedCountByShop.set(l.shop_id, (lockedCountByShop.get(l.shop_id) ?? 0) + 1)
  }

  const result = (shops ?? []).map(s => {
    const owner = profileById.get(s.owner_id)
    const appt = apptsByShop.get(s.id)
    return {
      id: s.id,
      name: s.name,
      vertical: s.vertical,
      shopCode: s.shop_code,
      createdAt: s.created_at,
      ownerEmail: owner?.email ?? null,
      ownerName: owner?.full_name ?? null,
      subscriptionStatus: owner?.subscription_status ?? null,
      lastActiveAt: appt?.lastActiveAt ?? null,
      appointmentCount: appt?.count ?? 0,
      revenueTotal: Math.round((appt?.revenue ?? 0) * 100) / 100,
      clientCount: clientCountByShop.get(s.id) ?? 0,
      lockedCount: lockedCountByShop.get(s.id) ?? 0,
    }
  })

  return NextResponse.json({ shops: result })
}
