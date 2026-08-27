import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createAdmin } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { cookies } from 'next/headers'

function getAdmin() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function dateStr(d: Date) {
  return d.toISOString().split('T')[0]
}

function subtractDays(d: Date, n: number) {
  const r = new Date(d)
  r.setDate(r.getDate() - n)
  return r
}

function getMondayOfWeek(d: Date) {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(d)
  monday.setDate(d.getDate() + diff)
  return monday
}

async function getStaffLabels(admin: ReturnType<typeof getAdmin>, shopId: string | null) {
  if (!shopId) return { staffLabel: 'Barber', staffLabelPlural: 'Barbers' }
  const { data: shop } = await admin.from('shops').select('vertical').eq('id', shopId).maybeSingle()
  const vertical = shop?.vertical || 'barbershop'
  const { data: config } = await admin.from('vertical_config').select('staff_label, staff_label_plural').eq('vertical', vertical).maybeSingle()
  return { staffLabel: config?.staff_label || 'Barber', staffLabelPlural: config?.staff_label_plural || 'Barbers' }
}

export async function POST() {
  try {
    const cookieStore = await cookies()
    const supabaseUser = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll() } }
    )

    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = getAdmin()

    // Check if brief already generated today
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const { data: existing } = await admin
      .from('briefs')
      .select('id, content, summary, delivered_at')
      .eq('recipient_id', user.id)
      .gte('delivered_at', todayStart.toISOString())
      .order('delivered_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ brief: existing })
    }

    // Get profile + role
    const { data: profile } = await admin
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()

    const role: 'owner' | 'barber' = profile?.role === 'barber' ? 'barber' : 'owner'

    const today = new Date()
    const yesterday = subtractDays(today, 1)
    const yesterdayStr = dateStr(yesterday)
    const thisMonday = getMondayOfWeek(today)
    const lastMonday = subtractDays(thisMonday, 7)
    const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0)

    // maxRetries uses the SDK's own retry/backoff (also respects Retry-After
    // on 429s) -- safe here since messages.create has no side effects of
    // its own, the brief row is only inserted once after a response comes back.
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY!, maxRetries: 3 })

    let parsed: any = null
    let shopId: string | null = null
    let recipientType: 'owner' | 'barber' = role

    if (role === 'owner') {
      const { data: shop } = await admin
        .from('shops')
        .select('id, name')
        .eq('owner_id', user.id)
        .maybeSingle()

      if (!shop) return NextResponse.json({ error: 'No shop found' }, { status: 404 })
      shopId = shop.id
      const { staffLabel, staffLabelPlural } = await getStaffLabels(admin, shopId)

      // Yesterday
      const { data: yesterdayAppts } = await admin
        .from('appointments')
        .select('id, price, status, barber_id, time')
        .eq('shop_id', shopId)
        .eq('date', yesterdayStr)

      const completed = (yesterdayAppts ?? []).filter(a => a.status === 'done' || a.status === 'completed')
      const cancelled = (yesterdayAppts ?? []).filter(a => a.status === 'cancelled')
      const noShows = (yesterdayAppts ?? []).filter(a => a.status === 'no_show')
      const yesterdayRevenue = completed.reduce((s: number, a: any) => s + (a.price ?? 0), 0)

      const { data: yesterdayTips } = await admin
        .from('tips')
        .select('amount, barber_id')
        .eq('shop_id', shopId)
        .gte('created_at', `${yesterdayStr}T00:00:00`)
        .lt('created_at', `${dateStr(today)}T00:00:00`)

      const yesterdayTipsTotal = (yesterdayTips ?? []).reduce((s: number, t: any) => s + (t.amount ?? 0), 0)

      // Per-barber breakdown
      const barberRevMap: Record<string, number> = {}
      const barberTipMap: Record<string, number> = {}
      const barberNoShowMap: Record<string, number> = {}
      for (const a of completed) {
        if (a.barber_id) barberRevMap[a.barber_id] = (barberRevMap[a.barber_id] ?? 0) + (a.price ?? 0)
      }
      for (const t of yesterdayTips ?? []) {
        if ((t as any).barber_id) barberTipMap[(t as any).barber_id] = (barberTipMap[(t as any).barber_id] ?? 0) + ((t as any).amount ?? 0)
      }
      for (const a of noShows) {
        if (a.barber_id) barberNoShowMap[a.barber_id] = (barberNoShowMap[a.barber_id] ?? 0) + 1
      }

      // This week
      const { data: thisWeekAppts } = await admin
        .from('appointments')
        .select('id, price, status, barber_id, client_id, date')
        .eq('shop_id', shopId)
        .gte('date', dateStr(thisMonday))
        .lte('date', yesterdayStr)
        .in('status', ['done', 'completed'])

      const thisWeekRevenue = (thisWeekAppts ?? []).reduce((s: number, a: any) => s + (a.price ?? 0), 0)

      const periodDays = Math.max(1, Math.ceil((yesterday.getTime() - thisMonday.getTime()) / 86400000) + 1)
      const lastWeekEnd = subtractDays(new Date(lastMonday.getTime() + periodDays * 86400000), 1)
      const { data: lastWeekAppts } = await admin
        .from('appointments')
        .select('id, price, status')
        .eq('shop_id', shopId)
        .gte('date', dateStr(lastMonday))
        .lte('date', dateStr(lastWeekEnd))
        .in('status', ['done', 'completed'])

      const lastWeekRevenue = (lastWeekAppts ?? []).reduce((s: number, a: any) => s + (a.price ?? 0), 0)

      // Barber week clients + rebook
      const barberWeekClientMap: Record<string, Set<string>> = {}
      for (const a of thisWeekAppts ?? []) {
        if (a.barber_id && a.client_id) {
          if (!barberWeekClientMap[a.barber_id]) barberWeekClientMap[a.barber_id] = new Set()
          barberWeekClientMap[a.barber_id].add(a.client_id)
        }
      }
      const { data: futureAppts } = await admin
        .from('appointments')
        .select('barber_id, client_id')
        .eq('shop_id', shopId)
        .gt('date', yesterdayStr)
        .lte('date', dateStr(new Date(today.getTime() + 28 * 86400000)))
        .neq('status', 'cancelled')

      const barberFutureMap: Record<string, Set<string>> = {}
      for (const a of futureAppts ?? []) {
        if (a.barber_id && a.client_id) {
          if (!barberFutureMap[a.barber_id]) barberFutureMap[a.barber_id] = new Set()
          barberFutureMap[a.barber_id].add(a.client_id)
        }
      }

      // This month
      const { data: thisMonthAppts } = await admin
        .from('appointments')
        .select('id, price, status, client_id')
        .eq('shop_id', shopId)
        .gte('date', dateStr(thisMonthStart))
        .lte('date', yesterdayStr)
        .in('status', ['done', 'completed'])

      const thisMonthRevenue = (thisMonthAppts ?? []).reduce((s: number, a: any) => s + (a.price ?? 0), 0)
      const clientVisitCount: Record<string, number> = {}
      for (const a of thisMonthAppts ?? []) {
        if (a.client_id) clientVisitCount[a.client_id] = (clientVisitCount[a.client_id] ?? 0) + 1
      }
      const totalMonthClients = Object.keys(clientVisitCount).length
      const repeatClients = Object.values(clientVisitCount).filter(c => c > 1).length
      const retentionRate = totalMonthClients > 0 ? Math.round((repeatClients / totalMonthClients) * 100) : 0
      const avgTicket = thisMonthAppts?.length ? Math.round(thisMonthRevenue / thisMonthAppts.length) : 0

      // Barber names
      const { data: barbers } = await admin
        .from('shop_barbers')
        .select('barber_id, barber_name, alias')
        .eq('shop_id', shopId)
        .eq('active', true)

      const barberNameMap = Object.fromEntries(
        (barbers ?? []).map((b: any) => [b.barber_id, b.barber_name || b.alias || 'Unknown'])
      )

      const barkerYestApptCount: Record<string, number> = {}
      for (const a of yesterdayAppts ?? []) {
        if (a.barber_id) barkerYestApptCount[a.barber_id] = (barkerYestApptCount[a.barber_id] ?? 0) + 1
      }

      const barberRankings = (barbers ?? []).map((b: any) => {
        const id = b.barber_id
        const rev = barberRevMap[id] ?? 0
        const tips = barberTipMap[id] ?? 0
        const noShowsYest = barberNoShowMap[id] ?? 0
        const weekClients = barberWeekClientMap[id] ?? new Set()
        const rebookedCount = [...weekClients].filter(cid => barberFutureMap[id]?.has(cid)).length
        const rebookRate = weekClients.size > 0 ? Math.round((rebookedCount / weekClients.size) * 100) : null
        const yesterdayApptCount = barkerYestApptCount[id] ?? 0
        let flag: string | null = null
        if (yesterdayApptCount === 0) flag = 'no_activity'
        else if (noShowsYest >= 2) flag = 'needs_attention'
        return { name: barberNameMap[id] ?? id.slice(0, 8), revenue: rev, tips, no_shows: noShowsYest, rebook_rate_pct: rebookRate, flag }
      }).sort((a: any, b: any) => b.revenue - a.revenue)

      const weekRevChangePct = lastWeekRevenue > 0
        ? Math.round(((thisWeekRevenue - lastWeekRevenue) / lastWeekRevenue) * 100)
        : null

      const briefData = {
        shop: shop.name,
        date: yesterdayStr,
        barber_rankings: barberRankings,
        shop_totals: {
          yesterday_revenue: yesterdayRevenue,
          yesterday_tips: yesterdayTipsTotal,
          yesterday_completed: completed.length,
          yesterday_cancelled: cancelled.length,
          yesterday_no_shows: noShows.length,
          week_revenue: thisWeekRevenue,
          last_week_revenue: lastWeekRevenue,
          week_revenue_change_pct: weekRevChangePct,
          month_revenue: thisMonthRevenue,
          month_retention_rate_pct: retentionRate,
          month_avg_ticket: avgTicket,
        },
      }

      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1200,
        system: `You are ChairOS. Write a daily brief for a shop owner whose team is made up of ${staffLabelPlural.toLowerCase()}. Frame every insight around the team. Give 3 suggestions: one to help a struggling ${staffLabel.toLowerCase()}, one to reward a top performer, one operational move to drive more revenue today. Reference specific ${staffLabel.toLowerCase()} names and numbers. Under 300 words. Return JSON with keys: headline (string), one_thing (string), yesterday_summary (1-2 sentences summarizing yesterday's shop performance), week_summary (1-2 sentences on this week's revenue trend vs last week), barber_rankings (array: name, revenue, tips, no_shows, flag), shop_totals (object), suggestions (array of 3 plain strings). Respond with only valid JSON, no markdown fences.`,
        messages: [{ role: 'user', content: JSON.stringify(briefData) }],
      })

      const raw = (response.content[0] as Anthropic.TextBlock).text.trim()
      parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''))

    } else {
      // Barber brief
      const { data: myEntry } = await admin
        .from('shop_barbers')
        .select('shop_id, barber_name, alias')
        .eq('barber_id', user.id)
        .eq('active', true)
        .maybeSingle()

      shopId = myEntry?.shop_id ?? null
      const { staffLabel } = await getStaffLabels(admin, shopId)
      const barberName = myEntry?.barber_name || myEntry?.alias || profile?.full_name || staffLabel

      const thisMonday = getMondayOfWeek(today)
      const lastMonday = subtractDays(thisMonday, 7)
      const periodDays = Math.max(1, Math.ceil((yesterday.getTime() - thisMonday.getTime()) / 86400000) + 1)

      let apptBase = admin.from('appointments').select('id, price, status, client_id, time, services(name), client_name').eq('barber_id', user.id)
      if (shopId) apptBase = apptBase.eq('shop_id', shopId)

      const { data: yesterdayAppts } = await apptBase.eq('date', yesterdayStr)
      const completed = (yesterdayAppts ?? []).filter((a: any) => a.status === 'done' || a.status === 'completed')
      const noShows = (yesterdayAppts ?? []).filter((a: any) => a.status === 'no_show')
      const yesterdayRevenue = completed.reduce((s: number, a: any) => s + (a.price ?? 0), 0)

      let tipQuery = admin.from('tips').select('amount').eq('barber_id', user.id)
        .gte('created_at', `${yesterdayStr}T00:00:00`)
        .lt('created_at', `${dateStr(today)}T00:00:00`)
      const { data: yesterdayTips } = await tipQuery
      const yesterdayTipsTotal = (yesterdayTips ?? []).reduce((s: number, t: any) => s + (t.amount ?? 0), 0)

      // Week data for trend
      let weekApptQuery = admin.from('appointments').select('id, price, status').eq('barber_id', user.id)
      if (shopId) weekApptQuery = weekApptQuery.eq('shop_id', shopId)
      const [{ data: thisWeekAppts }, { data: lastWeekAppts }] = await Promise.all([
        weekApptQuery.gte('date', dateStr(thisMonday)).lte('date', yesterdayStr).in('status', ['done', 'completed']),
        admin.from('appointments').select('id, price, status').eq('barber_id', user.id)
          .gte('date', dateStr(lastMonday))
          .lte('date', dateStr(subtractDays(new Date(lastMonday.getTime() + periodDays * 86400000), 1)))
          .in('status', ['done', 'completed']),
      ])
      const thisWeekRevenue = (thisWeekAppts ?? []).reduce((s: number, a: any) => s + (a.price ?? 0), 0)
      const lastWeekRevenue = (lastWeekAppts ?? []).reduce((s: number, a: any) => s + (a.price ?? 0), 0)
      const weekRevChangePct = lastWeekRevenue > 0 ? Math.round(((thisWeekRevenue - lastWeekRevenue) / lastWeekRevenue) * 100) : null

      // Client health
      const { data: allClientAppts } = await admin
        .from('appointments')
        .select('client_id, client_name, date')
        .eq('barber_id', user.id)
        .in('status', ['done', 'completed'])
        .not('client_id', 'is', null)

      const clientLastVisit: Record<string, { name: string; date: string }> = {}
      for (const a of allClientAppts ?? []) {
        if (!clientLastVisit[a.client_id] || a.date > clientLastVisit[a.client_id].date) {
          clientLastVisit[a.client_id] = { name: a.client_name, date: a.date }
        }
      }
      const clientAlerts = Object.values(clientLastVisit)
        .map(v => ({ name: v.name, days_since: Math.floor((today.getTime() - new Date(v.date).getTime()) / 86400000) }))
        .filter(x => x.days_since >= 45)
        .sort((a, b) => b.days_since - a.days_since)
        .slice(0, 8)

      const briefData = {
        barber: barberName,
        date: yesterdayStr,
        yesterday: {
          revenue: yesterdayRevenue,
          tips: yesterdayTipsTotal,
          clients: completed.length,
          no_shows: noShows.length,
        },
        week: {
          revenue: thisWeekRevenue,
          last_week_revenue: lastWeekRevenue,
          revenue_change_pct: weekRevChangePct,
          appointments: (thisWeekAppts ?? []).length,
        },
        client_alerts: clientAlerts,
      }

      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 900,
        system: `You are ChairOS, writing a daily brief for ${/^[aeiou]/i.test(staffLabel) ? 'an' : 'a'} ${staffLabel.toLowerCase()}. Be specific to their numbers. Give 2 suggestions: one to increase revenue today, one to protect a client relationship. Under 200 words. Return JSON with keys: headline, yesterday_summary (1-2 sentences on yesterday), week_summary (1-2 sentences on this week's revenue trend vs last week), client_alerts (array of objects with name and days_since), suggestions (array of 2 strings), one_thing. Respond with only valid JSON, no markdown.`,
        messages: [{ role: 'user', content: JSON.stringify(briefData) }],
      })

      const raw = (response.content[0] as Anthropic.TextBlock).text.trim()
      parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''))
    }

    const { data: brief } = await admin.from('briefs').insert({
      shop_id: shopId,
      recipient_id: user.id,
      recipient_type: recipientType,
      brief_type: 'daily',
      content: parsed,
      summary: parsed.headline,
    }).select().maybeSingle()

    return NextResponse.json({ brief })
  } catch (err: any) {
    console.error('[briefs/generate]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
