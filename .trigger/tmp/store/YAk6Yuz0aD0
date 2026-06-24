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

// src/trigger/ownerDailyBrief.ts
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
var ownerDailyBrief = schedules_exports.task({
  id: "owner-daily-brief",
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
    const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
    const { data: shops, error: shopsError } = await supabase.from("shops").select("id, name, owner_id");
    if (shopsError) {
      console.error("[owner-daily-brief] shops query error:", shopsError);
      return { briefsCreated: 0 };
    }
    console.log("[owner-daily-brief] shops found:", shops?.length ?? 0);
    const ownerIds = (shops ?? []).map((s) => s.owner_id);
    const { data: ownerProfiles } = await supabase.from("profiles").select("id, full_name, subscription_status, plan_type").in("id", ownerIds);
    const profileMap = Object.fromEntries(
      (ownerProfiles ?? []).map((p) => [p.id, p])
    );
    const activeShops = (shops ?? []).filter((s) => {
      const profile = profileMap[s.owner_id];
      const status = profile?.subscription_status;
      console.log(`[owner-daily-brief] shop ${s.name} status: ${status}`);
      return status === "active" || status === "trialing" || status == null;
    });
    console.log("[owner-daily-brief] active shops:", activeShops.length);
    let briefsCreated = 0;
    for (const shop of activeShops) {
      try {
        const shopId = shop.id;
        const ownerId = shop.owner_id;
        const ownerProfile = profileMap[ownerId];
        const { data: yesterdayAppts } = await supabase.from("appointments").select("id, price, status, barber_id, time").eq("shop_id", shopId).eq("date", yesterdayStr);
        const completed = (yesterdayAppts ?? []).filter((a) => a.status === "done" || a.status === "completed");
        const cancelled = (yesterdayAppts ?? []).filter((a) => a.status === "cancelled");
        const noShows = (yesterdayAppts ?? []).filter((a) => a.status === "no_show");
        const yesterdayRevenue = completed.reduce((s, a) => s + (a.price ?? 0), 0);
        const { data: yesterdayTips } = await supabase.from("tips").select("amount, barber_id").eq("shop_id", shopId).gte("created_at", `${yesterdayStr}T00:00:00`).lt("created_at", `${dateStr(today)}T00:00:00`);
        const yesterdayTipsTotal = (yesterdayTips ?? []).reduce((s, t) => s + (t.amount ?? 0), 0);
        const barberRevMap = {};
        const barberTipMap = {};
        const barberNoShowYestMap = {};
        for (const a of completed) {
          if (a.barber_id) barberRevMap[a.barber_id] = (barberRevMap[a.barber_id] ?? 0) + (a.price ?? 0);
        }
        for (const t of yesterdayTips ?? []) {
          if (t.barber_id) barberTipMap[t.barber_id] = (barberTipMap[t.barber_id] ?? 0) + (t.amount ?? 0);
        }
        for (const a of noShows) {
          if (a.barber_id) barberNoShowYestMap[a.barber_id] = (barberNoShowYestMap[a.barber_id] ?? 0) + 1;
        }
        const hourCounts = {};
        for (const a of completed) {
          if (a.time) {
            const hour = parseInt(a.time.split(":")[0], 10);
            if (!isNaN(hour)) hourCounts[hour] = (hourCounts[hour] ?? 0) + 1;
          }
        }
        const busiestHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
        const { data: thisWeekAppts } = await supabase.from("appointments").select("id, price, status, barber_id, client_id, date").eq("shop_id", shopId).gte("date", dateStr(thisMonday)).lte("date", yesterdayStr).in("status", ["done", "completed"]);
        const thisWeekRevenue = (thisWeekAppts ?? []).reduce((s, a) => s + (a.price ?? 0), 0);
        const periodDays = Math.max(1, Math.ceil((yesterday.getTime() - thisMonday.getTime()) / 864e5) + 1);
        const lastWeekStart = lastMonday;
        const lastWeekEnd = subtractDays(new Date(lastMonday.getTime() + periodDays * 864e5), 1);
        const { data: lastWeekAppts } = await supabase.from("appointments").select("id, price, status, barber_id, client_id, date").eq("shop_id", shopId).gte("date", dateStr(lastWeekStart)).lte("date", dateStr(lastWeekEnd)).in("status", ["done", "completed"]);
        const lastWeekRevenue = (lastWeekAppts ?? []).reduce((s, a) => s + (a.price ?? 0), 0);
        const weekBarberRev = {};
        const barberWeekClientMap = {};
        for (const a of thisWeekAppts ?? []) {
          if (a.barber_id) {
            weekBarberRev[a.barber_id] = (weekBarberRev[a.barber_id] ?? 0) + (a.price ?? 0);
            if (a.client_id) {
              if (!barberWeekClientMap[a.barber_id]) barberWeekClientMap[a.barber_id] = /* @__PURE__ */ new Set();
              barberWeekClientMap[a.barber_id].add(a.client_id);
            }
          }
        }
        const topBarberId = Object.entries(weekBarberRev).sort((a, b) => b[1] - a[1])[0]?.[0];
        const { data: futureAppts } = await supabase.from("appointments").select("barber_id, client_id").eq("shop_id", shopId).gt("date", yesterdayStr).lte("date", dateStr(new Date(today.getTime() + 28 * 864e5))).neq("status", "cancelled");
        const barberFutureClientMap = {};
        for (const a of futureAppts ?? []) {
          if (a.barber_id && a.client_id) {
            if (!barberFutureClientMap[a.barber_id]) barberFutureClientMap[a.barber_id] = /* @__PURE__ */ new Set();
            barberFutureClientMap[a.barber_id].add(a.client_id);
          }
        }
        const allPriorClientIds = /* @__PURE__ */ new Set();
        const { data: priorAppts } = await supabase.from("appointments").select("client_id").eq("shop_id", shopId).lt("date", dateStr(thisMonday)).in("status", ["done", "completed"]).not("client_id", "is", null);
        for (const a of priorAppts ?? []) allPriorClientIds.add(a.client_id);
        const thisWeekClientIds = new Set((thisWeekAppts ?? []).map((a) => a.client_id).filter(Boolean));
        const newClients = [...thisWeekClientIds].filter((id) => !allPriorClientIds.has(id)).length;
        const returningClients = thisWeekClientIds.size - newClients;
        const dayRevMap = {};
        for (const a of thisWeekAppts ?? []) {
          dayRevMap[a.date] = (dayRevMap[a.date] ?? 0) + (a.price ?? 0);
        }
        const slowestDay = Object.entries(dayRevMap).sort((a, b) => a[1] - b[1])[0]?.[0];
        const { data: thisMonthAppts } = await supabase.from("appointments").select("id, price, status, client_id").eq("shop_id", shopId).gte("date", dateStr(thisMonthStart)).lte("date", yesterdayStr).in("status", ["done", "completed"]);
        const thisMonthRevenue = (thisMonthAppts ?? []).reduce((s, a) => s + (a.price ?? 0), 0);
        const dayOfMonth = today.getDate() - 1;
        const lastMonthSameEnd = new Date(lastMonthStart);
        lastMonthSameEnd.setDate(Math.min(dayOfMonth, lastMonthEnd.getDate()));
        const { data: lastMonthAppts } = await supabase.from("appointments").select("id, price, status, client_id").eq("shop_id", shopId).gte("date", dateStr(lastMonthStart)).lte("date", dateStr(lastMonthSameEnd)).in("status", ["done", "completed"]);
        const lastMonthRevenue = (lastMonthAppts ?? []).reduce((s, a) => s + (a.price ?? 0), 0);
        const clientVisitCount = {};
        for (const a of thisMonthAppts ?? []) {
          if (a.client_id) clientVisitCount[a.client_id] = (clientVisitCount[a.client_id] ?? 0) + 1;
        }
        const totalMonthClients = Object.keys(clientVisitCount).length;
        const repeatClients = Object.values(clientVisitCount).filter((c) => c > 1).length;
        const retentionRate = totalMonthClients > 0 ? Math.round(repeatClients / totalMonthClients * 100) : 0;
        const avgTicket = thisMonthAppts?.length ? Math.round(thisMonthRevenue / thisMonthAppts.length) : 0;
        const { data: barbers } = await supabase.from("shop_barbers").select("barber_id, barber_name, alias").eq("shop_id", shopId).eq("active", true);
        const barberNameMap = Object.fromEntries(
          (barbers ?? []).map((b) => [b.barber_id, b.barber_name || b.alias || "Unknown"])
        );
        const barberRankings = (barbers ?? []).map((b) => {
          const id = b.barber_id;
          const rev = barberRevMap[id] ?? 0;
          const tips = barberTipMap[id] ?? 0;
          const noShowsYest = barberNoShowYestMap[id] ?? 0;
          const weekClients = barberWeekClientMap[id] ?? /* @__PURE__ */ new Set();
          const rebookedCount = [...weekClients].filter((cid) => barberFutureClientMap[id]?.has(cid)).length;
          const rebookRate = weekClients.size > 0 ? Math.round(rebookedCount / weekClients.size * 100) : null;
          const yesterdayApptCount = (yesterdayAppts ?? []).filter((a) => a.barber_id === id).length;
          let flag = null;
          if (yesterdayApptCount === 0) flag = "no_activity";
          else if (noShowsYest >= 2) flag = "needs_attention";
          return {
            name: barberNameMap[id] ?? id.slice(0, 8),
            revenue: rev,
            tips,
            no_shows: noShowsYest,
            rebook_rate_pct: rebookRate,
            flag
          };
        }).sort((a, b) => b.revenue - a.revenue);
        const topEarner = barberRankings[0] ?? null;
        const weekRevChangePct = lastWeekRevenue > 0 ? Math.round((thisWeekRevenue - lastWeekRevenue) / lastWeekRevenue * 100) : null;
        const briefData = {
          shop: shop.name,
          date: yesterdayStr,
          barber_rankings: barberRankings,
          top_earner: topEarner?.name ?? null,
          shop_totals: {
            yesterday_revenue: yesterdayRevenue,
            yesterday_tips: yesterdayTipsTotal,
            yesterday_completed: completed.length,
            yesterday_cancelled: cancelled.length,
            yesterday_no_shows: noShows.length,
            yesterday_busiest_hour: busiestHour ? `${busiestHour}:00` : null,
            week_revenue: thisWeekRevenue,
            last_week_revenue: lastWeekRevenue,
            week_revenue_change_pct: weekRevChangePct,
            week_new_clients: newClients,
            week_returning_clients: returningClients,
            month_revenue: thisMonthRevenue,
            month_retention_rate_pct: retentionRate,
            month_avg_ticket: avgTicket
          }
        };
        let parsed = null;
        try {
          const response = await anthropic.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 1e3,
            system: `You are ChairOS. Write a daily brief for a barbershop owner. The owner's primary job is managing and retaining their barbers. Frame every insight around the team. Highlight what the owner did that enabled barber performance — chair availability, scheduling decisions, client flow. This brief should make the owner feel like a leader whose decisions directly impact their barbers' income. Give 3 suggestions: one to help a struggling barber, one to reward or recognize a top performer, one operational move to drive more revenue to the floor today. Reference specific barber names and numbers. Under 300 words. Return JSON with these exact keys: headline (string), one_thing (string), barber_rankings (array of objects: name, revenue, tips, no_shows, flag), shop_totals (object), suggestions (array of 3 plain strings — each string is the full action sentence, no nested objects). Respond with only valid JSON, no markdown fences.`,
            messages: [{ role: "user", content: JSON.stringify(briefData) }]
          });
          const raw = response.content[0].text.trim();
          const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
          parsed = JSON.parse(cleaned);
        } catch (err) {
          await supabase.from("automation_logs").insert({
            type: "owner_daily_brief_parse_error",
            payload: { shop_id: shopId },
            result: err.message
          });
          continue;
        }
        const { data: brief } = await supabase.from("briefs").insert({
          shop_id: shopId,
          recipient_id: ownerId,
          recipient_type: "owner",
          brief_type: "daily",
          content: parsed,
          summary: parsed.headline
        }).select().maybeSingle();
        await supabase.from("notifications").insert({
          user_id: ownerId,
          shop_id: shopId,
          type: "daily_brief",
          title: "Your daily brief is ready",
          body: parsed.headline,
          read: false,
          metadata: { brief_id: brief?.id }
        });
        briefsCreated++;
      } catch (err) {
        await supabase.from("automation_logs").insert({
          type: "owner_daily_brief_error",
          payload: { shop_id: shop.id },
          result: err.message
        });
      }
    }
    console.log(`[owner-daily-brief] briefs created: ${briefsCreated}`);
    return { briefsCreated };
  }, "run")
});
export {
  ownerDailyBrief
};
//# sourceMappingURL=ownerDailyBrief.mjs.map
