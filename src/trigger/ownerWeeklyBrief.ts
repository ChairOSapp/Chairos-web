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

export const ownerWeeklyBrief = schedules.task({
  id: "owner-weekly-brief",
  cron: "0 12 * * 1", // 8am ET every Monday

  run: async () => {
    const supabase = getSupabase()
    const anthropic = getAnthropic()

    const today = new Date()
    // Last full week: Mon–Sun
    const thisMonday = new Date(today)
    const dow = today.getDay()
    thisMonday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1))
    const lastMonday = subtractDays(thisMonday, 7)
    const lastSunday = subtractDays(thisMonday, 1)
    const prevMonday = subtractDays(lastMonday, 7)
    const prevSunday = subtractDays(lastMonday, 1)

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

        // Last week appointments
        const { data: lastWeekAppts } = await supabase
          .from('appointments')
          .select('id, price, status, barber_id, client_id, date, services(name)')
          .eq('shop_id', shopId)
          .gte('date', dateStr(lastMonday))
          .lte('date', dateStr(lastSunday))

        const lastWeekCompleted = (lastWeekAppts ?? []).filter(a => a.status === 'done' || a.status === 'completed')
        const lastWeekCancelled = (lastWeekAppts ?? []).filter(a => a.status === 'cancelled')
        const lastWeekNoShows = (lastWeekAppts ?? []).filter(a => a.status === 'no_show')
        const lastWeekRevenue = lastWeekCompleted.reduce((s, a) => s + (a.price ?? 0), 0)

        // Previous week for comparison
        const { data: prevWeekAppts } = await supabase
          .from('appointments')
          .select('id, price, status')
          .eq('shop_id', shopId)
          .gte('date', dateStr(prevMonday))
          .lte('date', dateStr(prevSunday))
          .in('status', ['done', 'completed'])

        const prevWeekRevenue = (prevWeekAppts ?? []).reduce((s, a) => s + (a.price ?? 0), 0)

        // Per-barber revenue, no-show rate, and rebook rate
        const barberRevMap: Record<string, number> = {}
        const barberApptCount: Record<string, number> = {}
        const barberNoShowCount: Record<string, number> = {}
        const barberWeekClientMap: Record<string, Set<string>> = {}
        const serviceRevMap: Record<string, number> = {}

        for (const a of lastWeekCompleted) {
          if (a.barber_id) {
            barberRevMap[a.barber_id] = (barberRevMap[a.barber_id] ?? 0) + (a.price ?? 0)
            barberApptCount[a.barber_id] = (barberApptCount[a.barber_id] ?? 0) + 1
            if (a.client_id) {
              if (!barberWeekClientMap[a.barber_id]) barberWeekClientMap[a.barber_id] = new Set()
              barberWeekClientMap[a.barber_id].add(a.client_id)
            }
          }
          const svcName = (a.services as any)?.name
          if (svcName) serviceRevMap[svcName] = (serviceRevMap[svcName] ?? 0) + (a.price ?? 0)
        }
        for (const a of lastWeekNoShows) {
          if (a.barber_id) barberNoShowCount[a.barber_id] = (barberNoShowCount[a.barber_id] ?? 0) + 1
        }
        for (const a of lastWeekCancelled) {
          if (a.barber_id) barberApptCount[a.barber_id] = (barberApptCount[a.barber_id] ?? 0) + 1
        }

        // Rebooking: did last week's clients book again in the following 4 weeks?
        const { data: futureAppts } = await supabase
          .from('appointments')
          .select('barber_id, client_id')
          .eq('shop_id', shopId)
          .gt('date', dateStr(lastSunday))
          .lte('date', dateStr(new Date(lastSunday.getTime() + 28 * 86400000)))
          .neq('status', 'cancelled')

        const barberFutureClientMap: Record<string, Set<string>> = {}
        for (const a of futureAppts ?? []) {
          if (a.barber_id && a.client_id) {
            if (!barberFutureClientMap[a.barber_id]) barberFutureClientMap[a.barber_id] = new Set()
            barberFutureClientMap[a.barber_id].add(a.client_id)
          }
        }

        // Last week tips
        const { data: lastWeekTips } = await supabase
          .from('tips')
          .select('amount')
          .eq('shop_id', shopId)
          .gte('created_at', `${dateStr(lastMonday)}T00:00:00`)
          .lte('created_at', `${dateStr(lastSunday)}T23:59:59`)

        const lastWeekTipsTotal = (lastWeekTips ?? []).reduce((s, t) => s + (t.amount ?? 0), 0)

        // Client lapse: 45–60 days out
        const fortyFiveDaysAgo = subtractDays(today, 45)
        const sixtyDaysAgo = subtractDays(today, 60)

        const { data: lapseAppts } = await supabase
          .from('appointments')
          .select('client_id, client_name, date')
          .eq('shop_id', shopId)
          .gte('date', dateStr(sixtyDaysAgo))
          .lte('date', dateStr(fortyFiveDaysAgo))
          .in('status', ['done', 'completed'])

        // Clients whose most recent visit is in 45–60 day window
        const clientLastVisit: Record<string, { name: string; date: string }> = {}
        for (const a of lapseAppts ?? []) {
          if (!a.client_id) continue
          if (!clientLastVisit[a.client_id] || a.date > clientLastVisit[a.client_id].date) {
            clientLastVisit[a.client_id] = { name: a.client_name, date: a.date }
          }
        }
        // Filter out clients who visited after the window
        const { data: recentAppts } = await supabase
          .from('appointments')
          .select('client_id')
          .eq('shop_id', shopId)
          .gt('date', dateStr(fortyFiveDaysAgo))
          .in('status', ['done', 'completed'])
        const recentClientIds = new Set((recentAppts ?? []).map(a => a.client_id).filter(Boolean))

        const approachingLapse = Object.entries(clientLastVisit)
          .filter(([id]) => !recentClientIds.has(id))
          .map(([, v]) => ({ name: v.name, days_since: Math.floor((today.getTime() - new Date(v.date).getTime()) / 86400000) }))
          .sort((a, b) => b.days_since - a.days_since)
          .slice(0, 10)

        // Fetch barber names
        const { data: barbers } = await supabase
          .from('shop_barbers')
          .select('barber_id, barber_name, alias')
          .eq('shop_id', shopId)
          .eq('active', true)

        const barberNameMap = Object.fromEntries(
          (barbers ?? []).map(b => [b.barber_id, b.barber_name || b.alias || 'Unknown'])
        )

        const barberRankings = Object.entries(barberRevMap)
          .sort((a, b) => b[1] - a[1])
          .map(([id, rev]) => {
            const total = barberApptCount[id] ?? 0
            const noShows = barberNoShowCount[id] ?? 0
            const noShowRate = total > 0 ? Math.round((noShows / total) * 100) : 0
            const weekClients = barberWeekClientMap[id] ?? new Set<string>()
            const rebookedCount = [...weekClients].filter(cid => barberFutureClientMap[id]?.has(cid)).length
            const rebookRate = weekClients.size > 0 ? Math.round((rebookedCount / weekClients.size) * 100) : null
            return {
              name: barberNameMap[id] ?? id.slice(0, 8),
              revenue: rev,
              no_show_rate_pct: noShowRate,
              rebook_rate_pct: rebookRate,
              flag: noShowRate > 15 ? 'high_no_shows' : null,
            }
          })

        const slowBarbers = barberRankings
          .filter((_, i) => i === barberRankings.length - 1 && barberRankings.length > 1)
          .map(b => b.name)

        const highNoShowBarbers = barberRankings.filter(b => b.no_show_rate_pct > 15).map(b => b.name)

        const topService = Object.entries(serviceRevMap).sort((a, b) => b[1] - a[1])[0]

        const briefData = {
          shop: shop.name,
          week: `${dateStr(lastMonday)} to ${dateStr(lastSunday)}`,
          revenue: lastWeekRevenue,
          tips: lastWeekTipsTotal,
          prev_week_revenue: prevWeekRevenue,
          revenue_change_pct: prevWeekRevenue > 0 ? Math.round(((lastWeekRevenue - prevWeekRevenue) / prevWeekRevenue) * 100) : null,
          completed: lastWeekCompleted.length,
          cancelled: lastWeekCancelled.length,
          no_shows: lastWeekNoShows.length,
          barber_rankings: barberRankings,
          slow_barbers: slowBarbers,
          high_no_show_barbers: highNoShowBarbers,
          top_service: topService ? { name: topService[0], revenue: topService[1] } : null,
          approaching_lapse_clients: approachingLapse,
        }

        let parsed: any = null
        try {
          const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 1000,
            system: `You are ChairOS, a barbershop management assistant. You are writing a weekly business brief for a shop owner. Be direct, data-driven, and specific. Always lead with the most important number. Give exactly 3 actionable suggestions tailored to the data — not generic advice. Each suggestion must reference a specific number from the data. This is a weekly brief. Include a 'watch list' section: barbers who had a slow week and may need encouragement, and clients approaching lapse who should be contacted before ChairOS automation reaches them first. Include a 'retention_pulse' section: which barbers had their best week, which had their worst, and one specific thing the owner can do this week to strengthen the weakest relationship on their floor. Keep the total response under 400 words. Format as JSON with keys: headline, week_recap, barber_rankings (array of objects with name, revenue, rebook_rate_pct), watch_list (object with keys barbers and clients, each an array of strings), retention_pulse (object with keys best_week, worst_week, owner_action — each a string), suggestions (array of 3 strings), one_thing (single most important action for the week). Respond with only valid JSON, no markdown.`,
            messages: [{ role: 'user', content: JSON.stringify(briefData) }],
          })

          const raw = (response.content[0] as Anthropic.TextBlock).text.trim()
          parsed = JSON.parse(raw)
        } catch (err: any) {
          await supabase.from('automation_logs').insert({
            type: 'owner_weekly_brief_parse_error',
            payload: { shop_id: shopId },
            result: err.message,
          })
          continue
        }

        const { data: brief } = await supabase.from('briefs').insert({
          shop_id: shopId,
          recipient_id: ownerId,
          recipient_type: 'owner',
          brief_type: 'weekly',
          content: parsed,
          summary: parsed.headline,
        }).select().maybeSingle()

        await supabase.from('notifications').insert({
          user_id: ownerId,
          shop_id: shopId,
          type: 'daily_brief',
          title: 'Your weekly brief is ready',
          body: parsed.headline,
          read: false,
          metadata: { brief_id: brief?.id },
        })

        briefsCreated++
      } catch (err: any) {
        await supabase.from('automation_logs').insert({
          type: 'owner_weekly_brief_error',
          payload: { shop_id: shop.id },
          result: err.message,
        })
      }
    }

    console.log(`[owner-weekly-brief] briefs created: ${briefsCreated}`)
    return { briefsCreated }
  },
})
