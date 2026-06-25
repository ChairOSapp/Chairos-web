import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const ADMIN_EMAILS = [
  ...(process.env.ADMIN_EMAIL ? [process.env.ADMIN_EMAIL] : []),
  'tbbryant07@gmail.com',
]

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

export type HealthStatus = 'healthy' | 'warning' | 'critical'

export interface AdminUser {
  id: string
  email: string
  full_name: string | null
  role: string | null
  plan_type: string | null
  subscription_status: string | null
  stripe_subscription_id: string | null
  created_at: string
  shop_id: string | null
  shop_name: string | null
  shop_code: string | null
  health: HealthStatus
  health_reasons: string[]
}

export async function GET(req: NextRequest) {
  const user = await getRequestUser(req)
  if (!user?.email || !ADMIN_EMAILS.includes(user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = getAdminSupabase()

  // Fetch all profiles
  const { data: profiles, error: profilesErr } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, plan_type, subscription_status, stripe_subscription_id, stripe_customer_id, created_at')
    .order('created_at', { ascending: false })

  if (profilesErr) return NextResponse.json({ error: profilesErr.message }, { status: 500 })

  // Fetch all shops (owner_id → shop)
  const { data: shops } = await supabase
    .from('shops')
    .select('id, name, owner_id, shop_code')

  // Fetch all shop_barbers (barber_id → shop_id)
  const { data: shopBarbers } = await supabase
    .from('shop_barbers')
    .select('barber_id, shop_id, active')
    .eq('active', true)

  // Fetch recent automation_logs (last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: recentLogs } = await supabase
    .from('automation_logs')
    .select('created_at')
    .gte('created_at', sevenDaysAgo)
    .limit(1)

  const hasRecentAutomation = (recentLogs?.length ?? 0) > 0

  const shopByOwner: Record<string, { id: string; name: string; code: string | null }> = {}
  for (const s of shops ?? []) {
    shopByOwner[s.owner_id] = { id: s.id, name: s.name, code: s.shop_code ?? null }
  }

  const shopByBarber: Record<string, string> = {}
  for (const sb of shopBarbers ?? []) {
    if (sb.barber_id) shopByBarber[sb.barber_id] = sb.shop_id
  }

  const shopById: Record<string, { id: string; name: string; code: string | null }> = {}
  for (const s of shops ?? []) {
    shopById[s.id] = { id: s.id, name: s.name, code: s.shop_code ?? null }
  }

  const users: AdminUser[] = (profiles ?? []).map(p => {
    const reasons: string[] = []
    let health: HealthStatus = 'healthy'

    const role = p.role ?? 'unknown'
    const planType = p.plan_type
    const status = p.subscription_status

    // Health check: profile always exists (we have it)

    // Owner checks
    if (role === 'owner') {
      const shop = shopByOwner[p.id]
      if (!shop) {
        reasons.push('No shop row linked to this owner')
        health = 'critical'
      }
      if (!status || status === 'cancelled') {
        reasons.push(`Subscription: ${status ?? 'none'}`)
        if (health !== 'critical') health = 'critical'
      } else if (status === 'past_due' || status === 'grace_period') {
        reasons.push(`Subscription ${status}`)
        if (health === 'healthy') health = 'warning'
      }
    }

    // Solo barber checks
    if (planType === 'solo') {
      if (!status || status === 'cancelled') {
        reasons.push(`Subscription: ${status ?? 'none'}`)
        if (health !== 'critical') health = 'critical'
      } else if (status === 'past_due' || status === 'grace_period') {
        reasons.push(`Subscription ${status}`)
        if (health === 'healthy') health = 'warning'
      }
    }

    // Shop barber checks
    if (planType === 'shop') {
      const linkedShopId = shopByBarber[p.id]
      if (!linkedShopId) {
        reasons.push('Not linked to any active shop')
        if (health !== 'critical') health = 'warning'
      }
    }

    // Automation freshness (shop-wide warning only if no recent logs at all)
    if (!hasRecentAutomation && (role === 'owner' || planType === 'solo')) {
      reasons.push('No automation activity in last 7 days')
      if (health === 'healthy') health = 'warning'
    }

    const ownerShop = shopByOwner[p.id]
    const barberShopId = shopByBarber[p.id]
    const shopInfo = ownerShop ?? (barberShopId ? shopById[barberShopId] : null)

    return {
      id: p.id,
      email: p.email ?? '',
      full_name: p.full_name,
      role,
      plan_type: planType,
      subscription_status: status,
      stripe_subscription_id: p.stripe_subscription_id,
      created_at: p.created_at,
      shop_id: shopInfo?.id ?? null,
      shop_name: shopInfo?.name ?? null,
      shop_code: shopInfo?.code ?? null,
      health,
      health_reasons: reasons,
    }
  })

  return NextResponse.json({ users })
}
