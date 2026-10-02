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

// Founder-only, read-only deep dossier for one shop: every chair, every
// dollar, every integration. Aggregates only — no client PII (names,
// phones, emails) ever leaves this endpoint.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRequestUser(req)
  if (!isAdminEmail(user?.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id: shopId } = await params
  const supabase = getAdminSupabase()

  const { data: shop, error: shopErr } = await supabase
    .from('shops')
    .select('id, name, vertical, shop_code, owner_id, created_at, slug, city, state')
    .eq('id', shopId)
    .maybeSingle()
  if (shopErr) return NextResponse.json({ error: shopErr.message }, { status: 500 })
  if (!shop) return NextResponse.json({ error: 'Shop not found' }, { status: 404 })

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [
    { data: owner },
    { data: barbers },
    { data: appointments },
    { data: memberships },
    { data: locks },
    { data: services },
    { data: squareAcct },
    { data: automations },
  ] = await Promise.all([
    supabase.from('profiles').select('id, email, full_name, role, plan_type, subscription_status, stripe_customer_id, stripe_subscription_id, created_at').eq('id', shop.owner_id).maybeSingle(),
    supabase.from('shop_barbers').select('barber_id, active, created_at').eq('shop_id', shopId),
    supabase.from('appointments').select('id, barber_id, price, status, payment_status, payment_method, created_at, date').eq('shop_id', shopId),
    supabase.from('client_shop_memberships').select('client_id').eq('shop_id', shopId),
    supabase.from('client_locks').select('locked').eq('shop_id', shopId),
    supabase.from('services').select('id, price').eq('shop_id', shopId),
    supabase.from('square_accounts').select('id').eq('shop_id', shopId).maybeSingle(),
    supabase.from('automation_logs').select('created_at').eq('shop_id', shopId).order('created_at', { ascending: false }).limit(1),
  ])

  // Chair stats
  const barberIds = (barbers ?? []).map(b => b.barber_id).filter(Boolean)
  const { data: barberProfiles } = barberIds.length
    ? await supabase.from('profiles').select('id, email, full_name, subscription_status, created_at').in('id', barberIds)
    : { data: [] as any[] }
  const profileById = new Map((barberProfiles ?? []).map(p => [p.id, p]))

  const chairs = (barbers ?? []).map(b => {
    const appts = (appointments ?? []).filter(a => a.barber_id === b.barber_id)
    const done = appts.filter(a => a.status === 'done')
    const revenue = done.reduce((s, a) => s + (Number(a.price) || 0), 0)
    const last30 = appts.filter(a => a.created_at >= thirtyDaysAgo).length
    const p = profileById.get(b.barber_id)
    return {
      barber_id: b.barber_id,
      full_name: p?.full_name ?? null,
      email: p?.email ?? null,
      active: b.active,
      since: b.created_at,
      appointments: appts.length,
      completed: done.length,
      revenue: Math.round(revenue * 100) / 100,
      last30d: last30,
    }
  }).sort((a, b) => b.revenue - a.revenue)

  // Appointment + revenue aggregates
  const done = (appointments ?? []).filter(a => a.status === 'done')
  const revenueTotal = done.reduce((s, a) => s + (Number(a.price) || 0), 0)
  const byStatus: Record<string, number> = {}
  for (const a of appointments ?? []) byStatus[a.status] = (byStatus[a.status] ?? 0) + 1
  const byMethod: Record<string, number> = {}
  for (const a of done) {
    const m = a.payment_method || 'unknown'
    byMethod[m] = Math.round(((byMethod[m] ?? 0) + (Number(a.price) || 0)) * 100) / 100
  }
  const last30 = (appointments ?? []).filter(a => a.created_at >= thirtyDaysAgo)
  const last30Revenue = last30.filter(a => a.status === 'done').reduce((s, a) => s + (Number(a.price) || 0), 0)

  // Weekly volume for the last 8 weeks (viability trend)
  const weekly: { week: string; appointments: number; revenue: number }[] = []
  for (let i = 7; i >= 0; i--) {
    const start = new Date(Date.now() - (i + 1) * 7 * 24 * 60 * 60 * 1000)
    const end = new Date(Date.now() - i * 7 * 24 * 60 * 60 * 1000)
    const inWeek = (appointments ?? []).filter(a => {
      const d = new Date(a.created_at)
      return d >= start && d < end
    })
    weekly.push({
      week: start.toISOString().slice(0, 10),
      appointments: inWeek.length,
      revenue: Math.round(inWeek.filter(a => a.status === 'done').reduce((s, a) => s + (Number(a.price) || 0), 0) * 100) / 100,
    })
  }

  const lockedCount = (locks ?? []).filter(l => l.locked).length
  const lastAppt = (appointments ?? []).reduce<string | null>(
    (max, a) => (!max || a.created_at > max ? a.created_at : max), null
  )

  return NextResponse.json({
    shop: {
      id: shop.id,
      name: shop.name,
      vertical: shop.vertical,
      shop_code: shop.shop_code,
      slug: shop.slug,
      city: shop.city,
      state: shop.state,
      created_at: shop.created_at,
    },
    owner: owner ? {
      id: owner.id,
      email: owner.email,
      full_name: owner.full_name,
      plan_type: owner.plan_type,
      subscription_status: owner.subscription_status,
      stripe_customer_id: owner.stripe_customer_id,
      stripe_subscription_id: owner.stripe_subscription_id,
      created_at: owner.created_at,
    } : null,
    chairs,
    stats: {
      appointments: (appointments ?? []).length,
      completed: done.length,
      byStatus,
      revenueTotal: Math.round(revenueTotal * 100) / 100,
      byPaymentMethod: byMethod,
      last30d: last30.length,
      last30dRevenue: Math.round(last30Revenue * 100) / 100,
      weekly,
      clients: (memberships ?? []).length,
      locked: lockedCount,
      services: (services ?? []).length,
      lastAppointmentAt: lastAppt,
    },
    integrations: {
      squareConnected: !!squareAcct,
      lastAutomationAt: (automations ?? [])[0]?.created_at ?? null,
    },
  })
}
