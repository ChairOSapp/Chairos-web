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

export type PulseSeverity = 'critical' | 'warning' | 'info'

export interface PulseAction {
  id: string
  severity: PulseSeverity
  kind: 'trial_ending' | 'past_due' | 'no_hours' | 'no_square'
  title: string
  why: string
  detail: string
  refId: string | null
  refName: string | null
}

interface DayBucket { date: string; count: number }

function bucketByDay(rows: { created_at: string }[], days: number): DayBucket[] {
  const out: DayBucket[] = []
  const now = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(now.getDate() - i)
    out.push({ date: d.toISOString().slice(0, 10), count: 0 })
  }
  const byDate = new Map(out.map(b => [b.date, b]))
  for (const r of rows) {
    const key = r.created_at.slice(0, 10)
    const b = byDate.get(key)
    if (b) b.count++
  }
  return out
}

function startOfDay(d: Date): Date {
  const c = new Date(d)
  c.setHours(0, 0, 0, 0)
  return c
}

// Founder-only operational pulse: what needs action, what's trending, and
// how the customer base is doing. Financial truth (MRR etc.) stays in
// /api/admin/metrics; this endpoint is the "is the business healthy right
// now" briefing and deliberately avoids Stripe calls.
export async function GET(req: NextRequest) {
  const user = await getRequestUser(req)
  if (!isAdminEmail(user?.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = getAdminSupabase()
  const now = new Date()
  const in7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const ago14d = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
  const ago24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const ago7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const thisWeekStart = startOfDay(new Date(now))
  thisWeekStart.setDate(now.getDate() - now.getDay())
  const lastWeekStart = new Date(thisWeekStart)
  lastWeekStart.setDate(thisWeekStart.getDate() - 7)

  const [
    { data: profiles },
    { data: shops },
    { data: squareAccounts },
    { data: recentSignups },
    { data: recentAppointments },
    { data: weekAppointments },
    { data: lastWeekAppointments },
    { count: totalClients },
    { count: lockedRelationships },
    { count: atRiskClients },
    { data: recentAutomation },
    { count: notifications7d },
  ] = await Promise.all([
    supabase.from('profiles').select('id, email, full_name, subscription_status, trial_end, plan_type, role'),
    supabase.from('shops').select('id, name, shop_code, owner_id, hours'),
    supabase.from('square_accounts').select('shop_id'),
    supabase.from('profiles').select('created_at').gte('created_at', ago14d.toISOString()),
    supabase.from('appointments').select('created_at').gte('created_at', ago14d.toISOString()),
    supabase.from('appointments').select('status').gte('date', thisWeekStart.toISOString().slice(0, 10)),
    supabase.from('appointments').select('status')
      .gte('date', lastWeekStart.toISOString().slice(0, 10))
      .lt('date', thisWeekStart.toISOString().slice(0, 10)),
    supabase.from('client_shop_memberships').select('*', { count: 'exact', head: true }),
    supabase.from('client_locks').select('*', { count: 'exact', head: true }).eq('locked', true),
    supabase.from('lapse_alerts').select('*', { count: 'exact', head: true }).is('resolved_at', null),
    supabase.from('automation_logs').select('created_at').gte('created_at', ago24h.toISOString()).limit(1),
    supabase.from('notifications').select('*', { count: 'exact', head: true }).gte('created_at', ago7d.toISOString()),
  ])

  // ── Action queue ──
  const actions: PulseAction[] = []
  const profileById = new Map((profiles ?? []).map(p => [p.id, p]))
  const connectedShopIds = new Set((squareAccounts ?? []).map(a => a.shop_id).filter(Boolean))

  for (const p of profiles ?? []) {
    const name = p.full_name || p.email || 'An account'
    if (p.subscription_status === 'trialing' && p.trial_end) {
      const trialEnd = new Date(p.trial_end)
      if (trialEnd <= in7d) {
        const daysLeft = Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / 86400000))
        actions.push({
          id: `trial-${p.id}`,
          severity: daysLeft <= 2 ? 'critical' : 'warning',
          kind: 'trial_ending',
          title: `${name}'s trial ends ${daysLeft === 0 ? 'today' : `in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`}`,
          why: 'Trials that end without a card on file usually just vanish. A nudge now beats a win-back email later.',
          detail: `${p.plan_type ?? 'unknown'} plan · ends ${trialEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
          refId: p.id,
          refName: name,
        })
      }
    }
    if (p.subscription_status === 'past_due' || p.subscription_status === 'grace_period') {
      actions.push({
        id: `billing-${p.id}`,
        severity: p.subscription_status === 'past_due' ? 'critical' : 'warning',
        kind: 'past_due',
        title: `${name} — payment ${p.subscription_status === 'past_due' ? 'failed' : 'in grace period'}`,
        why: 'The card on file didn\u2019t go through. Every day past due is one step closer to an involuntary cancel.',
        detail: `${p.plan_type ?? 'unknown'} plan · ${p.email ?? ''}`,
        refId: p.id,
        refName: name,
      })
    }
  }

  for (const s of shops ?? []) {
    if (!s.hours) {
      const owner = profileById.get(s.owner_id)
      actions.push({
        id: `hours-${s.id}`,
        severity: 'warning',
        kind: 'no_hours',
        title: `${s.name} has no hours set`,
        why: 'Their booking page tells every visitor "no times available" — the shop looks broken and bookings quietly stop.',
        detail: `Owner: ${owner?.full_name || owner?.email || 'unknown'}${s.shop_code ? ` · ${s.shop_code}` : ''}`,
        refId: s.id,
        refName: s.name,
      })
    }
    if (!connectedShopIds.has(s.id)) {
      const owner = profileById.get(s.owner_id)
      actions.push({
        id: `square-${s.id}`,
        severity: 'warning',
        kind: 'no_square',
        title: `${s.name} hasn\u2019t connected Square`,
        why: 'No card payments, no deposits, no card-on-file. They\u2019re leaving the features that get them paid on the table.',
        detail: `Owner: ${owner?.full_name || owner?.email || 'unknown'}${s.shop_code ? ` · ${s.shop_code}` : ''}`,
        refId: s.id,
        refName: s.name,
      })
    }
  }

  const severityRank: Record<PulseSeverity, number> = { critical: 0, warning: 1, info: 2 }
  actions.sort((a, b) => severityRank[a.severity] - severityRank[b.severity])

  const status: 'healthy' | 'attention' | 'critical' =
    actions.some(a => a.severity === 'critical') ? 'critical'
    : actions.length > 0 ? 'attention'
    : 'healthy'

  const headline =
    status === 'healthy'
      ? 'All quiet — nothing needs you right now.'
      : status === 'critical'
        ? `${actions.filter(a => a.severity === 'critical').length} thing${actions.filter(a => a.severity === 'critical').length === 1 ? '' : 's'} can\u2019t wait — start at the top.`
        : `${actions.length} thing${actions.length === 1 ? '' : 's'} worth a look today.`

  // ── Trends ──
  const signupsDaily = bucketByDay(recentSignups ?? [], 14)
  const appointmentsDaily = bucketByDay(recentAppointments ?? [], 14)

  function noShowRate(rows: { status: string }[] | null): number | null {
    const list = rows ?? []
    const done = list.filter(r => r.status === 'done' || r.status === 'completed').length
    const noShow = list.filter(r => r.status === 'no_show').length
    const denom = done + noShow
    return denom > 0 ? Math.round((noShow / denom) * 1000) / 10 : null
  }
  const noShowThisWeek = noShowRate(weekAppointments)
  const noShowLastWeek = noShowRate(lastWeekAppointments)

  return NextResponse.json({
    status,
    headline,
    generatedAt: now.toISOString(),
    actions,
    trends: {
      signupsDaily,
      appointmentsDaily,
      noShowThisWeek,
      noShowLastWeek,
    },
    customers: {
      totalClients: totalClients ?? 0,
      lockedRelationships: lockedRelationships ?? 0,
      atRiskClients: atRiskClients ?? 0,
    },
    product: {
      automationFresh: (recentAutomation?.length ?? 0) > 0,
      notifications7d: notifications7d ?? 0,
    },
  })
}
