import {
  createClient,
  dist_exports
} from "../../../chunk-7QJFYOPV.mjs";
import {
  schedules_exports,
  tasks
} from "../../../chunk-LFG4CZDZ.mjs";
import "../../../chunk-LRCAKVPT.mjs";
import {
  __name,
  init_esm
} from "../../../chunk-XR26Y4P7.mjs";

// src/trigger/clientLapseDetection.ts
init_esm();
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}
__name(getSupabase, "getSupabase");
var clientLapseDetection = schedules_exports.task({
  id: "client-lapse-detection",
  // 06:00 UTC = 02:00 AM ET
  cron: "0 6 * * *",
  run: /* @__PURE__ */ __name(async () => {
    const supabase = getSupabase();
    const { data: shops, error: shopsErr } = await supabase.from("shops").select("id, owner_id, name");
    if (shopsErr) throw new Error(`shops query failed: ${shopsErr.message}`);
    const shopMap = new Map((shops ?? []).map((s) => [s.id, s]));
    const { data: appointments, error: apptErr } = await supabase.from("appointments").select("shop_id, barber_id, client_id, client_name, client_phone, date, services(name)").eq("status", "done").gte("date", new Date(Date.now() - 180 * 86400 * 1e3).toISOString().slice(0, 10));
    if (apptErr) throw new Error(`appointments query failed: ${apptErr.message}`);
    const { data: shopBarbers } = await supabase.from("shop_barbers").select("shop_id, barber_id, barber_name, alias").eq("active", true);
    const barberNameMap = new Map(
      (shopBarbers ?? []).map((b) => [
        `${b.shop_id}:${b.barber_id}`,
        b.barber_name || b.alias || "your barber"
      ])
    );
    const clientMap = /* @__PURE__ */ new Map();
    for (const appt of appointments ?? []) {
      const key = `${appt.shop_id}:${appt.client_id ?? appt.client_phone}`;
      const existing = clientMap.get(key);
      if (!existing) {
        clientMap.set(key, {
          shop_id: appt.shop_id,
          client_id: appt.client_id,
          client_name: appt.client_name,
          client_phone: appt.client_phone,
          last_visit_date: appt.date,
          last_barber_id: appt.barber_id,
          last_service_name: appt.services?.name ?? null,
          visits_per_barber: /* @__PURE__ */ new Map()
        });
      } else if (appt.date > existing.last_visit_date) {
        existing.last_visit_date = appt.date;
        existing.last_barber_id = appt.barber_id;
        existing.last_service_name = appt.services?.name ?? null;
      }
      const entry = clientMap.get(key);
      if (appt.barber_id) {
        entry.visits_per_barber.set(
          appt.barber_id,
          (entry.visits_per_barber.get(appt.barber_id) ?? 0) + 1
        );
      }
    }
    const today = /* @__PURE__ */ new Date();
    const MS_PER_DAY = 24 * 60 * 60 * 1e3;
    const sixtyDaysAgo = new Date(today.getTime() - 60 * MS_PER_DAY);
    const ninetyDaysAgo = new Date(today.getTime() - 90 * MS_PER_DAY);
    const shopIds = [...shopMap.keys()];
    const { data: unresolvedAlerts } = await supabase.from("lapse_alerts").select("shop_id, client_phone").in("shop_id", shopIds).is("resolved_at", null);
    const alertedSet = new Set(
      (unresolvedAlerts ?? []).map((a) => `${a.shop_id}:${a.client_phone}`)
    );
    let alertsCreated = 0;
    let smsTriggered = 0;
    const newLapseAlerts = [];
    const newNotifications = [];
    const smsPayloads = [];
    for (const [, client] of clientMap) {
      const lastVisit = new Date(client.last_visit_date);
      if (lastVisit >= sixtyDaysAgo) continue;
      const daysSince = Math.floor((today.getTime() - lastVisit.getTime()) / MS_PER_DAY);
      const visitsWithLastBarber = client.last_barber_id ? client.visits_per_barber.get(client.last_barber_id) ?? 0 : 0;
      const lapseType = lastVisit < ninetyDaysAgo && visitsWithLastBarber >= 12 ? "loyalty" : "standard";
      const alertKey = `${client.shop_id}:${client.client_phone}`;
      if (alertedSet.has(alertKey)) continue;
      newLapseAlerts.push({
        shop_id: client.shop_id,
        barber_id: client.last_barber_id,
        client_id: client.client_id,
        client_phone: client.client_phone,
        client_name: client.client_name,
        last_visit_at: new Date(client.last_visit_date).toISOString(),
        lapse_type: lapseType
      });
      alertsCreated++;
      const shop = shopMap.get(client.shop_id);
      if (shop?.owner_id) {
        newNotifications.push({
          user_id: shop.owner_id,
          shop_id: client.shop_id,
          type: "lapse_alert",
          title: `${lapseType === "loyalty" ? "Loyalty client" : "Client"} lapse: ${client.client_name}`,
          body: `${client.client_name} hasn't returned in ${daysSince} days — consider reaching out.`,
          read: false
        });
      }
      if (lapseType === "standard" && daysSince >= 60 && daysSince <= 75 && client.client_phone) {
        const cleanPhone = client.client_phone.replace(/\D/g, "");
        const { data: clientConsent } = await supabase.from("clients").select("sms_consent").eq("phone", cleanPhone).maybeSingle();
        if (!clientConsent?.sms_consent) {
          console.log(`[client-lapse-detection] no SMS consent for ${client.client_name}, skipping SMS`);
          continue;
        }
        const barberName = client.last_barber_id ? barberNameMap.get(`${client.shop_id}:${client.last_barber_id}`) ?? "your barber" : "your barber";
        smsPayloads.push({
          clientPhone: client.client_phone,
          clientName: client.client_name,
          barberName,
          shopName: shop?.name ?? "the shop",
          daysSinceVisit: daysSince,
          lastServiceName: client.last_service_name ?? "your last service"
        });
        smsTriggered++;
      }
    }
    if (newLapseAlerts.length > 0) {
      await supabase.from("lapse_alerts").insert(newLapseAlerts);
    }
    if (newNotifications.length > 0) {
      await supabase.from("notifications").insert(newNotifications);
    }
    for (const payload of smsPayloads) {
      await tasks.trigger("rebooking-sms", payload);
    }
    console.log(`[client-lapse-detection] alerts created: ${alertsCreated}, SMS triggered: ${smsTriggered}`);
    return { alertsCreated, smsTriggered };
  }, "run")
});
export {
  clientLapseDetection
};
//# sourceMappingURL=clientLapseDetection.mjs.map
