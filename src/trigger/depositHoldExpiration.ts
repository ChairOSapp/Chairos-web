import { schedules } from "@trigger.dev/sdk"
import { createClient } from "@supabase/supabase-js"
import { logger } from "@/lib/logger"
import { runReferralNotifications } from "./referralNotifications"

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

    let cancelled = 0
    if (expired && expired.length > 0) {
      logger.info('deposit_hold_expiration_run_start', { expiredCount: expired.length })

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
          logger.info('deposit_expired_appointment_cancelled', { depositId: deposit.id, appointmentId: deposit.appointment_id })
        } else {
          logger.info('deposit_expired_no_cancel_needed', { depositId: deposit.id, appointmentId: deposit.appointment_id, appointmentStatus: appointment?.status ?? 'not_found' })
        }
      }

      logger.info('deposit_hold_expiration_run_complete', { expired: expired.length, cancelled })
    }

    // Unrelated concern piggybacking on this same 5-minute cadence (see
    // referralNotifications.ts for why it isn't its own schedule) --
    // isolated in its own try/catch, and outside the expired-deposits
    // early-exit above, so it still runs on every tick even when there's
    // nothing to expire (the common case).
    try {
      await runReferralNotifications()
    } catch (err: any) {
      logger.error('referral_notifications_failed', { message: err.message })
    }

    return { expired: expired?.length ?? 0, cancelled }
  },
})
