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

const BUSINESS_TYPE: Record<string, string> = { barbershop: 'barbershop', salon: 'hair salon', tattoo: 'tattoo studio' }
const STAFF_TERM: Record<string, string> = { barbershop: 'barber', salon: 'stylist', tattoo: 'artist' }

export const barberDailyBrief = schedules.task({
  id: "barber-daily-brief",
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

    // Fetch active barbers — subscribed solo or shop barbers
    const { data: shopBarbers } = await supabase
      .from('shop_barbers')
      .select('barber_id, shop_id, barber_name, alias, shops(name, owner_id, vertical)')
      .eq('active', true)
      .not('barber_id', 'is', null)

    // Also include solo barbers (plan_type='solo' with active subscription)
    const { data: soloProfiles } = await supabase
      .from('profiles')
      .select('id, full_name, subscription_status')
      .eq('plan_type', 'solo')
      .in('subscription_status', ['active', 'trialing'])

    // Build set of barber_ids already covered by shop_barbers
    const shopBarberIds = new Set((shopBarbers ?? []).map(b => b.barber_id))

    // Combined list: shop barbers + solo barbers not in shop_barbers
    type BarberTarget = { barber_id: string; shop_id: string | null; name: string; shop_name: string | null; vertical: string }
    const targets: BarberTarget[] = [
      ...(shopBarbers ?? []).map(b => ({
        barber_id: b.barber_id,
        shop_id: b.shop_id,
        name: b.barber_name || b.alias || 'Team member',
        shop_name: (b.shops as any)?.name ?? null,
        vertical: (b.shops as any)?.vertical || 'barbershop',
      })),
      ...(soloProfiles ?? [])
        .filter(p => !shopBarberIds.has(p.id))
        .map(p => ({
          barber_id: p.id,
          shop_id: null,
          name: p.full_name || 'Team member',
          shop_name: null,
          vertical: 'barbershop',
        })),
    ]

    let briefsCreated = 0

    for (const target of targets) {
      const { barber_id, shop_id } = target
      const businessType = BUSINESS_TYPE[target.vertical] || 'barbershop'
      const staffTerm = STAFF_TERM[target.vertical] || 'barber'

      try {
        // Build query filters — scoped to this barber
        const apptQuery = supabase
          .from('appointments')
          .select('id, price, status, client_id, time, services(name)')
          .eq('barber_id', barber_id)

        if (shop_id) apptQuery.eq('shop_id', shop_id)

        // --- YESTERDAY ---
        const { data: yesterdayAppts } = await apptQuery
          .eq('date', yesterdayStr)

        const completed = (yesterdayAppts ?? []).filter(a => a.status === 'done' || a.status === 'completed')
        const noShows = (yesterdayAppts ?? []).filter(a => a.status === 'no_show')
        const yesterdayRevenue = completed.reduce((s, a) => s + (a.price ?? 0), 0)

        const tipQuery = supabase
          .from('tips')
          .select('amount')
          .eq('barber_id', barber_id)
          .gte('created_at', `${yesterdayStr}T00:00:00`)
          .lt('created_at', `${dateStr(today)}T00:00:00`)

        const { data: yesterdayTips } = await tipQuery
        const yesterdayTipsTotal = (yesterdayTips ?? []).reduce((s, t) => s + (t.amount ?? 0), 0)

        const yesterdayClientIds = new Set(completed.map(a => a.client_id).filter(Boolean))

        // Prior clients for new vs returning
        const { data: priorAppts } = await supabase
          .from('appointments')
          .select('client_id')
          .eq('barber_id', barber_id)
          .lt('date', yesterdayStr)
          .in('status', ['done', 'completed'])
          .not('client_id', 'is', null)

        const priorClientIds = new Set((priorAppts ?? []).map(a => a.client_id))
        const newClientsYest = [...yesterdayClientIds].filter(id => !priorClientIds.has(id)).length
        const returningYest = yesterdayClientIds.size - newClientsYest

        const avgTicketYest = completed.length > 0 ? Math.round(yesterdayRevenue / completed.length) : 0

        // --- THIS WEEK ---
        const { data: thisWeekAppts } = await supabase
          .from('appointments')
          .select('id, price, status, client_id, date, services(name)')
          .eq('barber_id', barber_id)
          .gte('date', dateStr(thisMonday))
          .lte('date', yesterdayStr)
          .in('status', ['done', 'completed'])

        const thisWeekRevenue = (thisWeekAppts ?? []).reduce((s, a) => s + (a.price ?? 0), 0)

        // Same period last week
        const periodDays = Math.max(1, Math.ceil((yesterday.getTime() - thisMonday.getTime()) / 86400000) + 1)
        const { data: lastWeekAppts } = await supabase
          .from('appointments')
          .select('id, price, status, client_id')
          .eq('barber_id', barber_id)
          .gte('date', dateStr(lastMonday))
          .lte('date', dateStr(subtractDays(new Date(lastMonday.getTime() + periodDays * 86400000), 1)))
          .in('status', ['done', 'completed'])

        const lastWeekRevenue = (lastWeekAppts ?? []).reduce((s, a) => s + (a.price ?? 0), 0)

        // Rebooking rate: clients seen this week who booked again within 4 weeks
        const thisWeekClientIds = [...new Set((thisWeekAppts ?? []).map(a => a.client_id).filter(Boolean))]
        let rebookedCount = 0
        if (thisWeekClientIds.length > 0) {
          const { data: rebookAppts } = await supabase
            .from('appointments')
            .select('client_id')
            .eq('barber_id', barber_id)
            .gt('date', yesterdayStr)
            .lte('date', dateStr(new Date(today.getTime() + 28 * 86400000)))
            .in('client_id', thisWeekClientIds)
          rebookedCount = new Set((rebookAppts ?? []).map(a => a.client_id)).size
        }
        const rebookingRate = thisWeekClientIds.length > 0
          ? Math.round((rebookedCount / thisWeekClientIds.length) * 100)
          : 0

        // Top service this week
        const serviceRevMap: Record<string, number> = {}
        for (const a of thisWeekAppts ?? []) {
          const svc = (a.services as any)?.name
          if (svc) serviceRevMap[svc] = (serviceRevMap[svc] ?? 0) + (a.price ?? 0)
        }
        const topService = Object.entries(serviceRevMap).sort((a, b) => b[1] - a[1])[0]

        // --- CLIENT HEALTH ---
        // Clients at 45-day mark (pre-lapse)
        const fortyFiveDaysAgo = subtractDays(today, 45)
        const sixtyDaysAgo = subtractDays(today, 60)

        const { data: allClientAppts } = await supabase
          .from('appointments')
          .select('client_id, client_name, date')
          .eq('barber_id', barber_id)
          .in('status', ['done', 'completed'])
          .not('client_id', 'is', null)

        // Build last-visit map per client
        const clientLastVisit: Record<string, { name: string; date: string }> = {}
        for (const a of allClientAppts ?? []) {
          if (!clientLastVisit[a.client_id] || a.date > clientLastVisit[a.client_id].date) {
            clientLastVisit[a.client_id] = { name: a.client_name, date: a.date }
          }
        }

        const preLapseAlerts: { name: string; days_since: number; severity: string }[] = []
        for (const [, v] of Object.entries(clientLastVisit)) {
          const days = Math.floor((today.getTime() - new Date(v.date).getTime()) / 86400000)
          if (days >= 45 && days < 60) {
            preLapseAlerts.push({ name: v.name, days_since: days, severity: 'warning' })
          } else if (days >= 60) {
            preLapseAlerts.push({ name: v.name, days_since: days, severity: 'lapse' })
          }
        }
        preLapseAlerts.sort((a, b) => b.days_since - a.days_since)
        const clientAlerts = preLapseAlerts.slice(0, 8)

        const briefData = {
          barber: target.name,
          shop: target.shop_name,
          date: yesterdayStr,
          yesterday: {
            revenue: yesterdayRevenue,
            tips: yesterdayTipsTotal,
            clients: completed.length,
            no_shows: noShows.length,
            new_clients: newClientsYest,
            returning_clients: returningYest,
            avg_ticket: avgTicketYest,
          },
          week: {
            revenue: thisWeekRevenue,
            last_week_revenue: lastWeekRevenue,
            revenue_change_pct: lastWeekRevenue > 0 ? Math.round(((thisWeekRevenue - lastWeekRevenue) / lastWeekRevenue) * 100) : null,
            rebooking_rate_pct: rebookingRate,
            top_service: topService ? { name: topService[0], revenue: topService[1] } : null,
          },
          client_alerts: clientAlerts,
        }

        let parsed: any = null
        try {
          const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 1000,
            system: `You are ChairOS, writing a daily brief for a ${businessType} ${staffTerm}. This ${staffTerm} is a business owner of their chair. Write like you're their business partner, not a tool. Be specific to their numbers. Give 2 suggestions: one to increase revenue today, one to protect a client relationship. Keep it under 200 words. Format as JSON with keys: headline, yesterday_summary, week_summary, client_alerts (array of objects with name and days_since), suggestions (array of 2 strings), one_thing. Respond with only valid JSON, no markdown.`,
            messages: [{ role: 'user', content: JSON.stringify(briefData) }],
          })

          const raw = (response.content[0] as Anthropic.TextBlock).text.trim()
          const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
          parsed = JSON.parse(cleaned)
        } catch (err: any) {
          await supabase.from('automation_logs').insert({
            type: 'barber_daily_brief_parse_error',
            payload: { barber_id, shop_id },
            result: err.message,
          })
          continue
        }

        const { data: brief } = await supabase.from('briefs').insert({
          shop_id: shop_id,
          recipient_id: barber_id,
          recipient_type: 'barber',
          brief_type: 'daily',
          content: parsed,
          summary: parsed.headline,
        }).select().maybeSingle()

        await supabase.from('notifications').insert({
          user_id: barber_id,
          shop_id: shop_id,
          type: 'daily_brief',
          title: 'Your daily brief is ready',
          body: parsed.headline,
          read: false,
          metadata: { brief_id: brief?.id },
        })

        briefsCreated++
      } catch (err: any) {
        await supabase.from('automation_logs').insert({
          type: 'barber_daily_brief_error',
          payload: { barber_id, shop_id },
          result: err.message,
        })
      }
    }

    console.log(`[barber-daily-brief] briefs created: ${briefsCreated}`)
    return { briefsCreated }
  },
})
