import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
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

export async function GET(req: NextRequest) {
  const user = await getRequestUser(req)
  if (!isAdminEmail(user?.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = getAdminSupabase()
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-05-27.dahlia' as any })

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)
  const startOfWeek = new Date(now)
  startOfWeek.setDate(now.getDate() - now.getDay())
  startOfWeek.setHours(0, 0, 0, 0)

  // Supabase: new signups this week/month, appointment volume, Client Lock
  // relationships, and shop counts by vertical — all platform-wide, not
  // scoped to any one shop.
  const [
    { count: newSignupsMonth },
    { count: newSignupsWeek },
    { count: totalProfiles },
    { count: appointmentsWeek },
    { count: appointmentsMonth },
    { count: lockedRelationships },
    { data: allShops },
    { data: allProfiles },
  ] = await Promise.all([
    supabase.from('profiles')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startOfMonth.toISOString()),
    supabase.from('profiles')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startOfWeek.toISOString()),
    supabase.from('profiles')
      .select('*', { count: 'exact', head: true }),
    supabase.from('appointments')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startOfWeek.toISOString()),
    supabase.from('appointments')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startOfMonth.toISOString()),
    supabase.from('client_locks')
      .select('*', { count: 'exact', head: true })
      .eq('locked', true),
    supabase.from('shops').select('vertical, owner_id'),
    supabase.from('profiles').select('id, subscription_status'),
  ])

  // Active shops by vertical — "active" here matches the same loose
  // definition already used below for activeShops/activeSolo (active OR
  // still-trialing owner subscription), not just fully-paid. shops.owner_id
  // references auth.users directly (not profiles), so there's no FK
  // PostgREST can embed across -- join in JS instead.
  const statusByProfileId = new Map((allProfiles ?? []).map(p => [p.id, p.subscription_status]))
  const verticalBreakdown: Record<string, number> = {}
  for (const s of allShops ?? []) {
    const ownerStatus = statusByProfileId.get(s.owner_id)
    if (ownerStatus === 'active' || ownerStatus === 'trialing') {
      const v = s.vertical || 'unknown'
      verticalBreakdown[v] = (verticalBreakdown[v] || 0) + 1
    }
  }

  // Recent errors — pulled live from Sentry's REST API if the org/project/
  // auth token are configured, otherwise reported as pending rather than
  // guessed at. Same env vars already used for source-map upload
  // (SENTRY_ORG/SENTRY_PROJECT/SENTRY_AUTH_TOKEN), so this activates on
  // its own the moment those are set with a token that has issue-read scope.
  let recentErrors: { status: 'live' | 'pending' | 'error'; count?: number; issues?: { title: string; culprit: string; lastSeen: string; count: string }[]; reason?: string } = {
    status: 'pending',
    reason: 'SENTRY_ORG, SENTRY_PROJECT, and SENTRY_AUTH_TOKEN are not all configured yet.',
  }
  if (process.env.SENTRY_ORG && process.env.SENTRY_PROJECT && process.env.SENTRY_AUTH_TOKEN) {
    try {
      const sentryRes = await fetch(
        `https://sentry.io/api/0/projects/${process.env.SENTRY_ORG}/${process.env.SENTRY_PROJECT}/issues/?statsPeriod=24h&query=is:unresolved&limit=10`,
        { headers: { Authorization: `Bearer ${process.env.SENTRY_AUTH_TOKEN}` } }
      )
      if (sentryRes.ok) {
        const issues = await sentryRes.json()
        recentErrors = {
          status: 'live',
          count: issues.length,
          issues: issues.map((i: any) => ({
            title: i.title,
            culprit: i.culprit,
            lastSeen: i.lastSeen,
            count: i.count,
          })),
        }
      } else {
        recentErrors = { status: 'error', reason: `Sentry API returned ${sentryRes.status}` }
      }
    } catch (err: any) {
      recentErrors = { status: 'error', reason: err.message }
    }
  }

  // Stripe: active subscriptions for MRR
  let mrr = 0
  let activeShops = 0
  let activeSolo = 0
  let paidCount = 0
  let trialingCount = 0
  let stripeMrrLastMonth = 0

  try {
    // Fetch all active (paid) subscriptions (paginate up to 100)
    const activeSubs = await stripe.subscriptions.list({ status: 'active', limit: 100, expand: ['data.items'] })
    paidCount = activeSubs.data.length
    for (const sub of activeSubs.data) {
      const monthlyAmount = sub.items.data.reduce((sum, item) => {
        const price = item.price
        const unitAmt = (price.unit_amount ?? 0) / 100
        if (price.recurring?.interval === 'month') return sum + unitAmt
        if (price.recurring?.interval === 'year') return sum + unitAmt / 12
        return sum
      }, 0)
      mrr += monthlyAmount

      const meta = sub.metadata
      if (meta?.plan_type === 'shop' || sub.items.data.some(i => i.price.metadata?.plan_type === 'shop')) {
        activeShops++
      } else {
        activeSolo++
      }
    }

    // Also check trialing — counted separately from paid so trial-to-paid
    // conversion can be reported, but still folded into activeShops/
    // activeSolo below since those two fields already meant "active or
    // trialing" before this change and the existing dashboard cards read them.
    const trialingSubs = await stripe.subscriptions.list({ status: 'trialing', limit: 100 })
    trialingCount = trialingSubs.data.length
    for (const sub of trialingSubs.data) {
      const meta = sub.metadata
      if (meta?.plan_type === 'shop' || sub.items.data.some(i => i.price.metadata?.plan_type === 'shop')) {
        activeShops++
      } else {
        activeSolo++
      }
    }

    // Snapshot conversion ratio (paid / (paid + trialing) right now) --
    // not a cohort-tracked "of everyone who ever trialed" rate, since that
    // would need historical trial-start tracking this schema doesn't have.
    const conversionRate = (paidCount + trialingCount) > 0
      ? (paidCount / (paidCount + trialingCount)) * 100
      : null

    // Last month's MRR (cancelled in last month = churned)
    const cancelledThisMonth = await stripe.subscriptions.list({
      status: 'canceled',
      limit: 100,
    })
    const churned = cancelledThisMonth.data.filter(sub => {
      const cancelledAt = new Date((sub as any).canceled_at * 1000)
      return cancelledAt >= startOfMonth
    })
    const churnedCount = churned.length
    const revenueLostToChurn = churned.reduce((sum, sub) => {
      return sum + sub.items.data.reduce((s, item) => {
        const unitAmt = (item.price.unit_amount ?? 0) / 100
        if (item.price.recurring?.interval === 'month') return s + unitAmt
        if (item.price.recurring?.interval === 'year') return s + unitAmt / 12
        return s
      }, 0)
    }, 0)

    // Estimate last month MRR from Supabase profiles (active last month)
    const { data: lastMonthActive } = await supabase.from('profiles')
      .select('subscription_status, plan_type')
      .eq('subscription_status', 'active')
    stripeMrrLastMonth = mrr + revenueLostToChurn

    const mrrChange = stripeMrrLastMonth > 0 ? ((mrr - stripeMrrLastMonth) / stripeMrrLastMonth) * 100 : null

    return NextResponse.json({
      mrr: Math.round(mrr),
      mrrChange,
      activeShops,
      activeSolo,
      newSignups: newSignupsMonth ?? 0,
      newSignupsWeek: newSignupsWeek ?? 0,
      churnedCount,
      revenueLostToChurn: Math.round(revenueLostToChurn),
      totalProfiles: totalProfiles ?? 0,
      paidCount,
      trialingCount,
      conversionRate,
      verticalBreakdown,
      appointmentsWeek: appointmentsWeek ?? 0,
      appointmentsMonth: appointmentsMonth ?? 0,
      lockedRelationships: lockedRelationships ?? 0,
      recentErrors,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
