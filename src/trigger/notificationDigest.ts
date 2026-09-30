import { schedules } from "@trigger.dev/sdk"
import { createClient } from "@supabase/supabase-js"
import { Resend } from "resend"
import { render } from "@react-email/render"
import { logger } from "@/lib/logger"
import NotificationDigest from "@/emails/NotificationDigest"

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Daily notification digest (Task 3): one evening email summarizing the
// day's unread alerts for owners who turned on "Daily digest email" in
// Settings > Notifications. Plain summary, no AI — the daily brief jobs
// already do the smart version. Skipped entirely when Resend isn't
// configured.
export const notificationDigest = schedules.task({
  id: "notification-digest",
  cron: "0 23 * * *", // 23:00 UTC = 7pm ET

  run: async () => {
    if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
      logger.warn('notification_digest_not_configured')
      return { sent: 0 }
    }

    const supabase = getSupabase()
    const resend = new Resend(process.env.RESEND_API_KEY)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://chairos.cc'

    const { data: prefs, error: prefsError } = await supabase
      .from('notification_preferences')
      .select('user_id')
      .eq('digest_email', true)
    if (prefsError) throw new Error(`notification_preferences query failed: ${prefsError.message}`)

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    let sent = 0

    for (const pref of prefs ?? []) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('email, full_name')
        .eq('id', pref.user_id)
        .maybeSingle()
      if (!profile?.email) continue

      const { data: unread } = await supabase
        .from('notifications')
        .select('title, body, type, created_at')
        .eq('user_id', pref.user_id)
        .eq('read', false)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(20)
      if (!unread || unread.length === 0) continue

      const firstName = (profile.full_name || '').split(' ')[0] || 'there'
      const html = await render(
        NotificationDigest({
          firstName,
          items: (unread as { title: string; body: string; created_at: string }[]).map(n => ({
            title: n.title,
            body: n.body,
            created_at: n.created_at,
          })),
          more: unread.length === 20,
          inboxUrl: `${appUrl}/dashboard/notifications`,
        })
      )

      try {
        await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL!,
          to: profile.email,
          subject: `Your ChairOS digest — ${unread.length} unread alert${unread.length === 1 ? '' : 's'}`,
          html,
        })
        sent++
        logger.info('notification_digest_sent', { userId: pref.user_id, count: unread.length })
      } catch (err: any) {
        logger.error('notification_digest_failed', { userId: pref.user_id, message: err.message })
      }
    }

    logger.info('notification_digest_run_complete', { recipients: prefs?.length ?? 0, sent })
    return { sent }
  },
})
