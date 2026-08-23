import { schedules } from "@trigger.dev/sdk"
import { createClient } from "@supabase/supabase-js"

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export const depositHoldExpiration = schedules.task({
  id: "deposit-hold-expiration",
  cron: "*/5 * * * *",
  run: async () => {
    const supabase = getSupabase()

    const { data: expired, error } = await supabase
      .from('deposits')
      .select('id, appointment_id')
      .eq('status', 'pending')
      .lt('expires_at', new Date().toISOString())

    if (error) throw error
    if (!expired || expired.length === 0) return { expired: 0, cancelled: 0 }

    let cancelled = 0
    for (const deposit of expired) {
      // Re-check the appointment is still 'pending' before cancelling. A
      // retried booking attempt may have created a second deposit that
      // already succeeded and confirmed the appointment — this stale hold
      // expiring afterward must not cancel a since-confirmed appointment.
      const { data: appointment } = await supabase
        .from('appointments')
        .select('id, status')
        .eq('id', deposit.appointment_id)
        .maybeSingle()

      await supabase.from('deposits').update({ status: 'expired' }).eq('id', deposit.id)

      if (appointment?.status === 'pending') {
        await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', deposit.appointment_id)
        cancelled++
      }
    }

    return { expired: expired.length, cancelled }
  },
})
