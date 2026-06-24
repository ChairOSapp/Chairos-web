import { schedules, tasks } from "@trigger.dev/sdk"
import { createClient } from "@supabase/supabase-js"

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

type ClientEntry = {
  shop_id: string
  client_id: string | null
  client_name: string
  client_phone: string | null
  last_visit_date: string
  last_barber_id: string | null
  last_service_name: string | null
  visits_per_barber: Map<string, number>
}

export const clientLapseDetection = schedules.task({
  id: "client-lapse-detection",
  // 06:00 UTC = 02:00 AM ET
  cron: "0 6 * * *",

  run: async () => {
    const supabase = getSupabase()

    // 1. Load shops so we can look up owner_ids for notifications
    const { data: shops, error: shopsErr } = await supabase
      .from('shops')
      .select('id, owner_id, name')

    if (shopsErr) throw new Error(`shops query failed: ${shopsErr.message}`)
    const shopMap = new Map((shops ?? []).map(s => [s.id, s]))

    // 2. Load all completed appointments
    const { data: appointments, error: apptErr } = await supabase
      .from('appointments')
      .select('shop_id, barber_id, client_id, client_name, client_phone, date, services(name)')
      .eq('status', 'done')

    if (apptErr) throw new Error(`appointments query failed: ${apptErr.message}`)

    // 3. Load barber names (barber_id → name, keyed by shop_id:barber_id)
    const { data: shopBarbers } = await supabase
      .from('shop_barbers')
      .select('shop_id, barber_id, barber_name, alias')
      .eq('active', true)

    const barberNameMap = new Map(
      (shopBarbers ?? []).map(b => [
        `${b.shop_id}:${b.barber_id}`,
        b.barber_name || b.alias || 'your barber',
      ])
    )

    // 4. Build per-client map: most recent visit + visit counts per barber
    const clientMap = new Map<string, ClientEntry>()

    for (const appt of appointments ?? []) {
      const key = `${appt.shop_id}:${appt.client_id ?? appt.client_phone}`
      const existing = clientMap.get(key)

      if (!existing) {
        clientMap.set(key, {
          shop_id: appt.shop_id,
          client_id: appt.client_id,
          client_name: appt.client_name,
          client_phone: appt.client_phone,
          last_visit_date: appt.date,
          last_barber_id: appt.barber_id,
          last_service_name: (appt.services as any)?.name ?? null,
          visits_per_barber: new Map(),
        })
      } else if (appt.date > existing.last_visit_date) {
        existing.last_visit_date = appt.date
        existing.last_barber_id = appt.barber_id
        existing.last_service_name = (appt.services as any)?.name ?? null
      }

      const entry = clientMap.get(key)!
      if (appt.barber_id) {
        entry.visits_per_barber.set(
          appt.barber_id,
          (entry.visits_per_barber.get(appt.barber_id) ?? 0) + 1
        )
      }
    }

    const today = new Date()
    const MS_PER_DAY = 24 * 60 * 60 * 1000
    const sixtyDaysAgo = new Date(today.getTime() - 60 * MS_PER_DAY)
    const ninetyDaysAgo = new Date(today.getTime() - 90 * MS_PER_DAY)

    let alertsCreated = 0
    let smsTriggered = 0

    for (const [, client] of clientMap) {
      const lastVisit = new Date(client.last_visit_date)
      if (lastVisit >= sixtyDaysAgo) continue

      const daysSince = Math.floor((today.getTime() - lastVisit.getTime()) / MS_PER_DAY)

      // Loyalty lapse: 90+ days AND 12+ visits with the most recent barber
      const visitsWithLastBarber = client.last_barber_id
        ? (client.visits_per_barber.get(client.last_barber_id) ?? 0)
        : 0
      const lapseType: 'standard' | 'loyalty' =
        lastVisit < ninetyDaysAgo && visitsWithLastBarber >= 12 ? 'loyalty' : 'standard'

      // Skip if an unresolved alert already exists for this client at this shop
      const { data: existingAlert } = await supabase
        .from('lapse_alerts')
        .select('id')
        .eq('shop_id', client.shop_id)
        .eq('client_phone', client.client_phone)
        .is('resolved_at', null)
        .maybeSingle()

      if (existingAlert) continue

      // Insert lapse_alerts record
      await supabase.from('lapse_alerts').insert({
        shop_id: client.shop_id,
        barber_id: client.last_barber_id,
        client_id: client.client_id,
        client_phone: client.client_phone,
        client_name: client.client_name,
        last_visit_at: new Date(client.last_visit_date).toISOString(),
        lapse_type: lapseType,
      })
      alertsCreated++

      // Notify shop owner via the notifications bell
      const shop = shopMap.get(client.shop_id)
      if (shop?.owner_id) {
        await supabase.from('notifications').insert({
          user_id: shop.owner_id,
          shop_id: client.shop_id,
          type: 'lapse_alert',
          title: `${lapseType === 'loyalty' ? 'Loyalty client' : 'Client'} lapse: ${client.client_name}`,
          body: `${client.client_name} hasn't returned in ${daysSince} days — consider reaching out.`,
          read: false,
        })
      }

      // Trigger personalized rebooking SMS for standard lapse in first outreach window (60–75 days)
      if (
        lapseType === 'standard' &&
        daysSince >= 60 && daysSince <= 75 &&
        client.client_phone
      ) {
        // Check SMS consent before triggering
        const cleanPhone = client.client_phone.replace(/\D/g, '')
        const { data: clientConsent } = await supabase
          .from('clients')
          .select('sms_consent')
          .eq('phone', cleanPhone)
          .maybeSingle()
        if (!clientConsent?.sms_consent) {
          console.log(`[client-lapse-detection] no SMS consent for ${client.client_name}, skipping SMS`)
          continue
        }
        const barberName = client.last_barber_id
          ? (barberNameMap.get(`${client.shop_id}:${client.last_barber_id}`) ?? 'your barber')
          : 'your barber'

        await tasks.trigger('rebooking-sms', {
          clientPhone: client.client_phone,
          clientName: client.client_name,
          barberName,
          shopName: shop?.name ?? 'the shop',
          daysSinceVisit: daysSince,
          lastServiceName: client.last_service_name ?? 'your last service',
        })
        smsTriggered++
      }
    }

    console.log(`[client-lapse-detection] alerts created: ${alertsCreated}, SMS triggered: ${smsTriggered}`)
    return { alertsCreated, smsTriggered }
  },
})
