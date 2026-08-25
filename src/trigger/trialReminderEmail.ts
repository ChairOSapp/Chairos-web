import { schedules } from "@trigger.dev/sdk"
import { createClient } from "@supabase/supabase-js"
import { Resend } from "resend"
import { logger } from "@/lib/logger"

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Day 25 of a 30-day trial = 5 days left. Checked once daily, so the
// window is 4-5 days out (not exactly 5) to reliably catch the crossing
// regardless of when in the day this cron runs.
export const trialReminderEmail = schedules.task({
  id: "trial-reminder-email",
  cron: "0 15 * * *", // 15:00 UTC = 11am ET
  run: async () => {
    if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
      logger.warn('trial_reminder_email_not_configured')
      return { sent: 0 }
    }

    const supabase = getSupabase()
    const resend = new Resend(process.env.RESEND_API_KEY)

    const { data: candidates, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, trial_end')
      .eq('role', 'owner')
      .eq('subscription_status', 'trialing')
      .is('trial_reminder_sent_at', null)
      .not('trial_end', 'is', null)

    if (error) throw new Error(`profiles query failed: ${error.message}`)

    const now = Date.now()
    const fourDays = 4 * 24 * 60 * 60 * 1000
    const fiveDays = 5 * 24 * 60 * 60 * 1000

    const due = (candidates ?? []).filter(p => {
      const msLeft = new Date(p.trial_end).getTime() - now
      return msLeft > fourDays && msLeft <= fiveDays
    })

    let sent = 0
    for (const profile of due) {
      if (!profile.email) continue
      const firstName = (profile.full_name || '').split(' ')[0] || 'there'
      try {
        await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL!,
          to: profile.email,
          subject: 'Your ChairOS trial ends in 5 days',
          html: `
            <p>Hi ${firstName},</p>
            <p>Your 30-day ChairOS trial ends in 5 days. To keep your shop, bookings, and staff running without interruption, add a payment method any time before then.</p>
            <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/subscribe">Choose your plan</a></p>
            <p>— The ChairOS team</p>
          `,
        })
        await supabase.from('profiles').update({ trial_reminder_sent_at: new Date().toISOString() }).eq('id', profile.id)
        sent++
        logger.info('trial_reminder_email_sent', { profileId: profile.id })
      } catch (err: any) {
        logger.error('trial_reminder_email_failed', { profileId: profile.id, message: err.message })
      }
    }

    logger.info('trial_reminder_email_run_complete', { candidates: candidates?.length ?? 0, sent })
    return { sent }
  },
})
