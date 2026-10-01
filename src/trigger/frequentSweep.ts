import { schedules } from "@trigger.dev/sdk"
import { logger } from "@/lib/logger"
import { runAbandonedBookingSweep } from "./abandonedBookingSweep"
import { runDepositHoldExpiration } from "./depositHoldExpiration"
import { runWaitlistClaimSweep } from "./waitlistClaimSweep"

// Combined 5-minute sweep: merges abandoned-booking-sweep,
// deposit-hold-expiration, and waitlist-claim-sweep into a single
// scheduled task to stay within Trigger.dev's schedule limits.
// Each sub-sweep is isolated in its own try/catch so one failing
// doesn't block the others.
export const frequentSweep = schedules.task({
  id: "frequent-sweep",
  cron: "*/5 * * * *",
  run: async () => {
    const results: Record<string, any> = {}

    try {
      results.abandonedBooking = await runAbandonedBookingSweep()
    } catch (err: any) {
      logger.error('frequent_sweep_abandoned_failed', { message: err.message })
      results.abandonedBooking = { error: err.message }
    }

    try {
      results.depositHold = await runDepositHoldExpiration()
    } catch (err: any) {
      logger.error('frequent_sweep_deposit_failed', { message: err.message })
      results.depositHold = { error: err.message }
    }

    try {
      results.waitlistClaim = await runWaitlistClaimSweep()
    } catch (err: any) {
      logger.error('frequent_sweep_waitlist_failed', { message: err.message })
      results.waitlistClaim = { error: err.message }
    }

    return results
  },
})
