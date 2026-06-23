import { schedules } from "@trigger.dev/sdk"
import { createClient } from "@supabase/supabase-js"
import Anthropic from "@anthropic-ai/sdk"

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function getAnthropic() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
}

function dateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

function subtractDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() - n)
  return r
}

function getMondayOfWeek(d: Date): Date {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(d)
  monday.setDate(d.getDate() + diff)
  return monday
}

export const ownerDailyBrief = schedules.task({
  id: "owner-daily-brief",
  cron: "0 11 * * *", // 7am ET

  run: async () => {
    const supabase = getSupabase()
    const anthropic = getAnthropic()

    const today = new Date()
    const yesterday = subtractDays(today, 1)
    const yesterdayStr = dateStr(yesterday)
    const thisMonday = getMondayOfWeek(today)
    const lastMonday = subtractDays(thisMonday, 7)
    const lastSunday = subtractDays(thisMonday, 1)
    const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0)

    // Fetch active shops
    const { data: shops } = await supabase
      .from('shops')
      .select('id, name, owner_id, profiles!shops_owner_id_fkey(full_name, subscription_status)')

    const activeShops = (shops ?? []).filter(s => {
      const status = (s.profiles as any)?.subscription_status
      return status === 'active' || status === 'trialing' || status == null
    })

    let briefsCreated = 0

    for (const shop of activeShops) {
      try {
        const shopId = shop.id
        const ownerId = shop.owner_id

        // --- YESTERDAY ---
        const { data: yesterdayAppts } = await supabase
          .from('appointments')
          .select('id, price, status, barber_id, time')
          .eq('shop_id', shopId)
          .eq('date', yesterdayStr)

        const completed = (yesterdayAppts ?? []).filter(a => a.status === 'done' || a.status === 'completed')
        const cancelled = (yesterdayAppts ?? []).filter(a => a.status === 'cancelled')
        const noShows = (yesterdayAppts ?? []).filter(a => a.status === 'no_show')
        const yesterdayRevenue = completed.reduce((s, a) => s + (a.price ?? 0), 0)

        const { data: yesterdayTips } = await supabase
          .from('tips')
          .select('amount, barber_id')
          .eq('shop_id', shopId)
          .gte('created_at', `${yesterdayStr}T00:00:00`)
          .lt('created_at', `${dateStr(today)}T00:00:00`)

        const yesterdayTipsTotal = (yesterdayTips ?? []).reduce((s, t) => s + (t.amount ?? 0), 0)

        // Per-barber breakdown yesterday
        const barberRevMap: Record<string, number> = {}
        const barberTipMap: Record<string, number> = {}
        for (const a of completed) {
          if (a.barber_id) barberRevMap[a.barber_id] = (barberRevMap[a.barber_id] ?? 0) + (a.price ?? 0)
        }
        for (const t of yesterdayTips ?? []) {
          if (t.barber_id) barberTipMap[t.barber_id] = (barberTipMap[t.barber_id] ?? 0) + (t.amount ?? 0)
        }

        // Busiest hour yesterday
        const hourCounts: Record<number, number> = {}
        for (const a of completed) {
          if (a.time) {
            const hour = parseInt(a.time.split(':')[0], 10)
            if (!isNaN(hour)) hourCounts[hour] = (hourCounts[hour] ?? 0) + 1
          }
        }
        const busiestHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0]?.[0]

        // --- THIS WEEK (Monday to yesterday) ---
        const { data: thisWeekAppts } = await supabase
          .from('appointments')
          .select('id, price, status, barber_id, client_id, date')
          .eq('shop_id', shopId)
          .gte('date', dateStr(thisMonday))
          .lte('date', yesterdayStr)
          .in('status', ['done', 'completed'])

        const thisWeekRevenue = (thisWeekAppts ?? []).reduce((s, a) => s + (a.price ?? 0), 0)

        // Same period last week
        const periodDays = Math.max(1, Math.ceil((yesterday.getTime() - thisMonday.getTime()) / 86400000) + 1)
        const lastWeekStart = lastMonday
        const lastWeekEnd = subtractDays(new Date(lastMonday.getTime() + periodDays * 86400000), 1)

        const { data: lastWeekAppts } = await supabase
          .from('appointments')
          .select('id, price, status, barber_id, client_id, date')
          .eq('shop_id', shopId)
          .gte('date', dateStr(lastWeekStart))
          .lte('date', dateStr(lastWeekEnd))
          .in('status', ['done', 'completed'])

        const lastWeekRevenue = (lastWeekAppts ?? []).reduce((s, a) => s + (a.price ?? 0), 0)

        // Top barber this week
        const weekBarberRev: Record<string, number> = {}
        for (const a of thisWeekAppts ?? []) {
          if (a.barber_id) weekBarberRev[a.barber_id] = (weekBarberRev[a.barber_id] ?? 0) + (a.price ?? 0)
        }
        const topBarberId = Object.entries(weekBarberRev).sort((a, b) => b[1] - a[1])[0]?.[0]

        // New vs returning clients this week
        const allPriorClientIds = new Set<string>()
        const { data: priorAppts } = await supabase
          .from('appointments')
          .select('client_id')
          .eq('shop_id', shopId)
          .lt('date', dateStr(thisMonday))
          .in('status', ['done', 'completed'])
          .not('client_id', 'is', null)
        for (const a of priorAppts ?? []) allPriorClientIds.add(a.client_id)

        const thisWeekClientIds = new Set((thisWeekAppts ?? []).map(a => a.client_id).filter(Boolean))
        const newClients = [...thisWeekClientIds].filter(id => !allPriorClientIds.has(id)).length
        const returningClients = thisWeekClientIds.size - newClients

        // Slowest day this week
        const dayRevMap: Record<string, number> = {}
        for (const a of thisWeekAppts ?? []) {
          dayRevMap[a.date] = (dayRevMap[a.date] ?? 0) + (a.price ?? 0)
        }
        const slowestDay = Object.entries(dayRevMap).sort((a, b) => a[1] - b[1])[0]?.[0]

        // --- THIS MONTH ---
        const { data: thisMonthAppts } = await supabase
          .from('appointments')
          .select('id, price, status, client_id')
          .eq('shop_id', shopId)
          .gte('date', dateStr(thisMonthStart))
          .lte('date', yesterdayStr)
          .in('status', ['done', 'completed'])

        const thisMonthRevenue = (thisMonthAppts ?? []).reduce((s, a) => s + (a.price ?? 0), 0)

        // Last month same period
        const dayOfMonth = today.getDate() - 1
        const lastMonthSameEnd = new Date(lastMonthStart)
        lastMonthSameEnd.setDate(Math.min(dayOfMonth, lastMonthEnd.getDate()))

        const { data: lastMonthAppts } = await supabase
          .from('appointments')
          .select('id, price, status, client_id')
          .eq('shop_id', shopId)
          .gte('date', dateStr(lastMonthStart))
          .lte('date', dateStr(lastMonthSameEnd))
          .in('status', ['done', 'completed'])

        const lastMonthRevenue = (lastMonthAppts ?? []).reduce((s, a) => s + (a.price ?? 0), 0)

        // Client retention rate (clients who visited more than once this month)
        const clientVisitCount: Record<string, number> = {}
        for (const a of thisMonthAppts ?? []) {
          if (a.client_id) clientVisitCount[a.client_id] = (clientVisitCount[a.client_id] ?? 0) + 1
        }
        const totalMonthClients = Object.keys(clientVisitCount).length
        const repeatClients = Object.values(clientVisitCount).filter(c => c > 1).length
        const retentionRate = totalMonthClients > 0 ? Math.round((repeatClients / totalMonthClients) * 100) : 0

        // Average ticket
        const avgTicket = thisMonthAppts?.length
          ? Math.round(thisMonthRevenue / thisMonthAppts.length)
          : 0

        // Fetch barber names for display
        const { data: barbers } = await supabase
          .from('shop_barbers')
          .select('barber_id, barber_name, alias')
          .eq('shop_id', shopId)
          .eq('active', true)

        const barberNameMap = Object.fromEntries(
          (barbers ?? []).map(b => [b.barber_id, b.barber_name || b.alias || 'Unknown'])
        )

        const barberBreakdown = Object.entries(barberRevMap).map(([id, rev]) => ({
          name: barberNameMap[id] ?? id.slice(0, 8),
          revenue: rev,
          tips: barberTipMap[id] ?? 0,
        }))

        const briefData = {
          shop: shop.name,
          date: yesterdayStr,
          yesterday: {
            revenue: yesterdayRevenue,
            tips: yesterdayTipsTotal,
            completed: completed.length,
            cancelled: cancelled.length,
            no_shows: noShows.length,
            busiest_hour: busiestHour ? `${busiestHour}:00` : null,
            barbers: barberBreakdown,
          },
          week: {
            revenue: thisWeekRevenue,
            last_week_revenue: lastWeekRevenue,
            revenue_change_pct: lastWeekRevenue > 0 ? Math.round(((thisWeekRevenue - lastWeekRevenue) / lastWeekRevenue) * 100) : null,
            top_barber: topBarberId ? barberNameMap[topBarberId] : null,
            top_barber_revenue: topBarberId ? weekBarberRev[topBarberId] : null,
            slowest_day: slowestDay,
            new_clients: newClients,
            returning_clients: returningClients,
          },
          month: {
            revenue: thisMonthRevenue,
            last_month_same_period_revenue: lastMonthRevenue,
            retention_rate_pct: retentionRate,
            avg_ticket: avgTicket,
          },
        }

        // Call Claude
        let parsed: any = null
        try {
          const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 1000,
            system: `You are ChairOS, a barbershop management assistant. You are writing a daily business brief for a shop owner. Be direct, data-driven, and specific. Always lead with the most important number. Give exactly 3 actionable suggestions tailored to the data — not generic advice. Each suggestion must reference a specific number from the data. Keep the total response under 300 words. Format as JSON with keys: headline, yesterday_summary, week_summary, month_summary, suggestions (array of 3 strings), one_thing (single most important action for today). Respond with only valid JSON, no markdown.`,
            messages: [{ role: 'user', content: JSON.stringify(briefData) }],
          })

          const raw = (response.content[0] as Anthropic.TextBlock).text.trim()
          parsed = JSON.parse(raw)
        } catch (err: any) {
          await supabase.from('automation_logs').insert({
            type: 'owner_daily_brief_parse_error',
            payload: { shop_id: shopId },
            result: err.message,
          })
          continue
        }

        const { data: brief } = await supabase.from('briefs').insert({
          shop_id: shopId,
          recipient_id: ownerId,
          recipient_type: 'owner',
          brief_type: 'daily',
          content: parsed,
          summary: parsed.headline,
        }).select().maybeSingle()

        await supabase.from('notifications').insert({
          user_id: ownerId,
          shop_id: shopId,
          type: 'daily_brief',
          title: 'Your daily brief is ready',
          body: parsed.headline,
          read: false,
          metadata: { brief_id: brief?.id },
        })

        briefsCreated++
      } catch (err: any) {
        await supabase.from('automation_logs').insert({
          type: 'owner_daily_brief_error',
          payload: { shop_id: shop.id },
          result: err.message,
        })
      }
    }

    console.log(`[owner-daily-brief] briefs created: ${briefsCreated}`)
    return { briefsCreated }
  },
})
