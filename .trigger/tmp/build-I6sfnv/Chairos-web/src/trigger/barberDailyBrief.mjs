import {
  Anthropic
} from "../../../chunk-FFOXCDS5.mjs";
import "../../../chunk-PJKBXNLM.mjs";
import {
  createClient,
  dist_exports
} from "../../../chunk-7QJFYOPV.mjs";
import {
  schedules_exports
} from "../../../chunk-LFG4CZDZ.mjs";
import "../../../chunk-LRCAKVPT.mjs";
import {
  __name,
  init_esm
} from "../../../chunk-XR26Y4P7.mjs";

// src/trigger/barberDailyBrief.ts
init_esm();
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}
__name(getSupabase, "getSupabase");
function getAnthropic() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}
__name(getAnthropic, "getAnthropic");
function dateStr(d) {
  return d.toISOString().split("T")[0];
}
__name(dateStr, "dateStr");
function subtractDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() - n);
  return r;
}
__name(subtractDays, "subtractDays");
function getMondayOfWeek(d) {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  return monday;
}
__name(getMondayOfWeek, "getMondayOfWeek");
var barberDailyBrief = schedules_exports.task({
  id: "barber-daily-brief",
  cron: "0 11 * * *",
  // 7am ET
  run: /* @__PURE__ */ __name(async () => {
    const supabase = getSupabase();
    const anthropic = getAnthropic();
    const today = /* @__PURE__ */ new Date();
    const yesterday = subtractDays(today, 1);
    const yesterdayStr = dateStr(yesterday);
    const thisMonday = getMondayOfWeek(today);
    const lastMonday = subtractDays(thisMonday, 7);
    const lastSunday = subtractDays(thisMonday, 1);
    const { data: shopBarbers } = await supabase.from("shop_barbers").select("barber_id, shop_id, barber_name, alias, shops(name, owner_id)").eq("active", true).not("barber_id", "is", null);
    const { data: soloProfiles } = await supabase.from("profiles").select("id, full_name, subscription_status").eq("plan_type", "solo").in("subscription_status", ["active", "trialing"]);
    const shopBarberIds = new Set((shopBarbers ?? []).map((b) => b.barber_id));
    const targets = [
      ...(shopBarbers ?? []).map((b) => ({
        barber_id: b.barber_id,
        shop_id: b.shop_id,
        name: b.barber_name || b.alias || "Barber",
        shop_name: b.shops?.name ?? null
      })),
      ...(soloProfiles ?? []).filter((p) => !shopBarberIds.has(p.id)).map((p) => ({
        barber_id: p.id,
        shop_id: null,
        name: p.full_name || "Barber",
        shop_name: null
      }))
    ];
    let briefsCreated = 0;
    for (const target of targets) {
      const { barber_id, shop_id } = target;
      try {
        const apptQuery = supabase.from("appointments").select("id, price, status, client_id, time, services(name)").eq("barber_id", barber_id);
        if (shop_id) apptQuery.eq("shop_id", shop_id);
        const { data: yesterdayAppts } = await apptQuery.eq("date", yesterdayStr);
        const completed = (yesterdayAppts ?? []).filter((a) => a.status === "done" || a.status === "completed");
        const noShows = (yesterdayAppts ?? []).filter((a) => a.status === "no_show");
        const yesterdayRevenue = completed.reduce((s, a) => s + (a.price ?? 0), 0);
        const tipQuery = supabase.from("tips").select("amount").eq("barber_id", barber_id).gte("created_at", `${yesterdayStr}T00:00:00`).lt("created_at", `${dateStr(today)}T00:00:00`);
        const { data: yesterdayTips } = await tipQuery;
        const yesterdayTipsTotal = (yesterdayTips ?? []).reduce((s, t) => s + (t.amount ?? 0), 0);
        const yesterdayClientIds = new Set(completed.map((a) => a.client_id).filter(Boolean));
        const { data: priorAppts } = await supabase.from("appointments").select("client_id").eq("barber_id", barber_id).lt("date", yesterdayStr).in("status", ["done", "completed"]).not("client_id", "is", null);
        const priorClientIds = new Set((priorAppts ?? []).map((a) => a.client_id));
        const newClientsYest = [...yesterdayClientIds].filter((id) => !priorClientIds.has(id)).length;
        const returningYest = yesterdayClientIds.size - newClientsYest;
        const avgTicketYest = completed.length > 0 ? Math.round(yesterdayRevenue / completed.length) : 0;
        const { data: thisWeekAppts } = await supabase.from("appointments").select("id, price, status, client_id, date, services(name)").eq("barber_id", barber_id).gte("date", dateStr(thisMonday)).lte("date", yesterdayStr).in("status", ["done", "completed"]);
        const thisWeekRevenue = (thisWeekAppts ?? []).reduce((s, a) => s + (a.price ?? 0), 0);
        const periodDays = Math.max(1, Math.ceil((yesterday.getTime() - thisMonday.getTime()) / 864e5) + 1);
        const { data: lastWeekAppts } = await supabase.from("appointments").select("id, price, status, client_id").eq("barber_id", barber_id).gte("date", dateStr(lastMonday)).lte("date", dateStr(subtractDays(new Date(lastMonday.getTime() + periodDays * 864e5), 1))).in("status", ["done", "completed"]);
        const lastWeekRevenue = (lastWeekAppts ?? []).reduce((s, a) => s + (a.price ?? 0), 0);
        const thisWeekClientIds = [...new Set((thisWeekAppts ?? []).map((a) => a.client_id).filter(Boolean))];
        let rebookedCount = 0;
        if (thisWeekClientIds.length > 0) {
          const { data: rebookAppts } = await supabase.from("appointments").select("client_id").eq("barber_id", barber_id).gt("date", yesterdayStr).lte("date", dateStr(new Date(today.getTime() + 28 * 864e5))).in("client_id", thisWeekClientIds);
          rebookedCount = new Set((rebookAppts ?? []).map((a) => a.client_id)).size;
        }
        const rebookingRate = thisWeekClientIds.length > 0 ? Math.round(rebookedCount / thisWeekClientIds.length * 100) : 0;
        const serviceRevMap = {};
        for (const a of thisWeekAppts ?? []) {
          const svc = a.services?.name;
          if (svc) serviceRevMap[svc] = (serviceRevMap[svc] ?? 0) + (a.price ?? 0);
        }
        const topService = Object.entries(serviceRevMap).sort((a, b) => b[1] - a[1])[0];
        const fortyFiveDaysAgo = subtractDays(today, 45);
        const sixtyDaysAgo = subtractDays(today, 60);
        const { data: allClientAppts } = await supabase.from("appointments").select("client_id, client_name, date").eq("barber_id", barber_id).in("status", ["done", "completed"]).not("client_id", "is", null);
        const clientLastVisit = {};
        for (const a of allClientAppts ?? []) {
          if (!clientLastVisit[a.client_id] || a.date > clientLastVisit[a.client_id].date) {
            clientLastVisit[a.client_id] = { name: a.client_name, date: a.date };
          }
        }
        const preLapseAlerts = [];
        for (const [, v] of Object.entries(clientLastVisit)) {
          const days = Math.floor((today.getTime() - new Date(v.date).getTime()) / 864e5);
          if (days >= 45 && days < 60) {
            preLapseAlerts.push({ name: v.name, days_since: days, severity: "warning" });
          } else if (days >= 60) {
            preLapseAlerts.push({ name: v.name, days_since: days, severity: "lapse" });
          }
        }
        preLapseAlerts.sort((a, b) => b.days_since - a.days_since);
        const clientAlerts = preLapseAlerts.slice(0, 8);
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
            avg_ticket: avgTicketYest
          },
          week: {
            revenue: thisWeekRevenue,
            last_week_revenue: lastWeekRevenue,
            revenue_change_pct: lastWeekRevenue > 0 ? Math.round((thisWeekRevenue - lastWeekRevenue) / lastWeekRevenue * 100) : null,
            rebooking_rate_pct: rebookingRate,
            top_service: topService ? { name: topService[0], revenue: topService[1] } : null
          },
          client_alerts: clientAlerts
        };
        let parsed = null;
        try {
          const response = await anthropic.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 1e3,
            system: `You are ChairOS, writing a daily brief for a barber. This barber is a business owner of their chair. Write like you're their business partner, not a tool. Be specific to their numbers. Give 2 suggestions: one to increase revenue today, one to protect a client relationship. Keep it under 200 words. Format as JSON with keys: headline, yesterday_summary, week_summary, client_alerts (array of objects with name and days_since), suggestions (array of 2 strings), one_thing. Respond with only valid JSON, no markdown.`,
            messages: [{ role: "user", content: JSON.stringify(briefData) }]
          });
          const raw = response.content[0].text.trim();
          parsed = JSON.parse(raw);
        } catch (err) {
          await supabase.from("automation_logs").insert({
            type: "barber_daily_brief_parse_error",
            payload: { barber_id, shop_id },
            result: err.message
          });
          continue;
        }
        const { data: brief } = await supabase.from("briefs").insert({
          shop_id,
          recipient_id: barber_id,
          recipient_type: "barber",
          brief_type: "daily",
          content: parsed,
          summary: parsed.headline
        }).select().maybeSingle();
        await supabase.from("notifications").insert({
          user_id: barber_id,
          shop_id,
          type: "daily_brief",
          title: "Your daily brief is ready",
          body: parsed.headline,
          read: false,
          metadata: { brief_id: brief?.id }
        });
        briefsCreated++;
      } catch (err) {
        await supabase.from("automation_logs").insert({
          type: "barber_daily_brief_error",
          payload: { barber_id, shop_id },
          result: err.message
        });
      }
    }
    console.log(`[barber-daily-brief] briefs created: ${briefsCreated}`);
    return { briefsCreated };
  }, "run")
});
export {
  barberDailyBrief
};
//# sourceMappingURL=barberDailyBrief.mjs.map
