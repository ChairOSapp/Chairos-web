import { createClient } from "@supabase/supabase-js"
import { logger } from "@/lib/logger"
import { triggerWaitlistOutreach } from "@/lib/waitlistNotify"
import { runReferralNotifications } from "./referralNotifications"

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function runDepositHoldExpiration() {
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
          .select('id, shop_id, barber_id, service_id, date, time, status')
          .eq('id', deposit.appointment_id)
          .maybeSingle()

        await supabase.from('deposits').update({ status: 'expired' }).eq('id', deposit.id)

        if (appointment?.status === 'pending') {
          // Conditional cancel: the status guard rides on the UPDATE
          // itself, closing the check-then-act window where a payment
          // completing between the select above and this write could
          // still have been cancelled by the sweep.
          const { data: cancelledRows } = await supabase
            .from('appointments')
            .update({ status: 'cancelled', cancellation_reason: 'Deposit hold expired' })
            .eq('id', deposit.appointment_id)
            .eq('status', 'pending')
            .select('id')
          if (cancelledRows && cancelledRows.length > 0) {
            cancelled++
            logger.info('deposit_expired_appointment_cancelled', { depositId: deposit.id, appointmentId: deposit.appointment_id })

            // The freed slot goes to the waitlist like any other cancel —
            // expiry cancellations used to free slots silently. No
            // timezone is available server-side, so the outreach timing
            // guard uses its legacy fallback.
            try {
              const { data: shop } = await supabase
                .from('shops')
                .select('waitlist_min_notice_hours')
                .eq('id', appointment.shop_id)
                .maybeSingle()
              await triggerWaitlistOutreach(supabase, appointment, shop?.waitlist_min_notice_hours ?? 4)
            } catch (err) {
              logger.error('deposit_expired_waitlist_outreach_failed', {
                appointmentId: deposit.appointment_id,
                message: err instanceof Error ? err.message : String(err),
              })
            }
          }
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
}
