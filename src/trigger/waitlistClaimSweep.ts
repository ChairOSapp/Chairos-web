import { schedules } from "@trigger.dev/sdk"
import { logger } from "@/lib/logger"
import { getAdminClient, notifyNextWaitlistCandidate } from "@/lib/waitlistNotify"

// Cascades a waitlist notification when the claimed person doesn't reply
// in time. Finds every 'notified' entry whose claim window has passed,
// expires it, then offers the same exact slot to the next person in line
// -- which itself re-checks whether enough runway is left before the
// appointment's start time, so a slow cascade naturally stops and leaves
// the slot open for normal booking instead of texting someone with no
// real chance of making it in. Same "periodic scan finds its own work"
// shape as abandonedBookingSweep.
export const waitlistClaimSweep = schedules.task({
  id: "waitlist-claim-sweep",
  cron: "*/5 * * * *",
  run: async () => {
    const supabase = getAdminClient()
    const now = new Date().toISOString()

    const { data: expired, error } = await supabase
      .from('appointment_waitlist')
      .select('id, shop_id, service_id, desired_date, desired_time, notify_barber_id')
      .eq('status', 'notified')
      .lt('notify_expires_at', now)

    if (error) throw error
    if (!expired || expired.length === 0) return { expired: 0, cascaded: 0 }

    let expiredCount = 0
    let cascadedCount = 0

    for (const entry of expired) {
      // Optimistic claim -- guards a race with the entry actually being
      // claimed by reply between the select above and this update.
      const { data: claimed } = await supabase
        .from('appointment_waitlist')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq('id', entry.id)
        .eq('status', 'notified')
        .select('id')
        .maybeSingle()
      if (!claimed) continue
      expiredCount++

      await supabase.from('automation_logs').insert({
        type: 'appointment_waitlist_expired',
        payload: { waitlistId: entry.id, shopId: entry.shop_id },
        result: 'expired_unclaimed',
      })

      const outcome = await notifyNextWaitlistCandidate(supabase, {
        shopId: entry.shop_id,
        serviceId: entry.service_id,
        date: entry.desired_date,
        time: entry.desired_time,
        barberId: entry.notify_barber_id,
      })
      if (outcome.notified) cascadedCount++
    }

    logger.info('waitlist_claim_sweep_run_complete', { expired: expiredCount, cascaded: cascadedCount })
    return { expired: expiredCount, cascaded: cascadedCount }
  },
})
