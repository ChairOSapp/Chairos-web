import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { sendPushToUser } from '@/lib/push'
import { logger } from '@/lib/logger'
import {
  NOTIFICATION_EVENT_TYPES,
  resolveEventKey,
  defaultChannels,
  type NotificationEventKey,
} from '@/lib/notificationEvents'

export { NOTIFICATION_EVENT_TYPES, resolveEventKey, defaultChannels }
export type { NotificationEventKey }

function getSupabase() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * Which channels a notification type may use for this user.
 * Reads notification_preferences; missing row/table/type all fall back to
 * defaults, so behavior is unchanged until the owner touches Settings.
 */
export async function resolveChannels(userId: string, type: string): Promise<string[]> {
  const supabase = getSupabase()
  const key = resolveEventKey(type)
  const fallback = defaultChannels(key)
  try {
    const { data, error } = await supabase
      .from('notification_preferences')
      .select('channels')
      .eq('user_id', userId)
      .maybeSingle()
    if (error || !data) return fallback
    const arr = (data.channels as Record<string, unknown> | null)?.[key]
    if (Array.isArray(arr)) return arr.filter(c => typeof c === 'string')
    return fallback
  } catch {
    return fallback
  }
}

export async function sendNotification({
  userId,
  shopId,
  type,
  title,
  body,
  link,
  push = true,
}: {
  userId: string
  shopId?: string
  type: string
  title: string
  body: string
  /** In-app deep link, e.g. '/dashboard/calendar'. Tap-through in the inbox. */
  link?: string | null
  // Push fan-out is best-effort and never throws: if the user has the iOS
  // app installed the notification also lands as a push; otherwise it's
  // just the in-app row. Pass push:false for notification types that
  // should stay in-app only.
  push?: boolean
}) {
  const supabase = getSupabase()
  const channels = await resolveChannels(userId, type)
  const inApp = channels.includes('in_app')
  const pushOn = channels.includes('push')
  if (!inApp && !(push && pushOn)) return // owner turned this type off

  if (inApp) {
    const row: Record<string, unknown> = {
      user_id: userId,
      shop_id: shopId || null,
      type,
      title,
      body,
      read: false,
    }
    if (link) row.link = link
    let { error } = await supabase.from('notifications').insert(row)
    if (error && link && /column/i.test(error.message)) {
      // Migration not run yet (link column missing) — degrade to the old
      // shape rather than dropping the notification.
      delete row.link
      ;({ error } = await supabase.from('notifications').insert(row))
    }
    if (error) logger.warn('[notify] in-app insert failed', { error: error.message, userId, type })
  }

  if (push && pushOn) {
    try {
      await sendPushToUser(userId, {
        title,
        body,
        data: { type, ...(shopId ? { shopId } : {}), ...(link ? { link } : {}) },
      })
    } catch (err) {
      logger.warn('[notify] push fan-out failed', { error: String(err), userId, type })
    }
  }
}

// "2026-09-28" + "14:30" -> "Mon, Sep 28 at 2:30 PM". Used in notification
// bodies so pushes read naturally.
export function formatApptWhen(dateStr: string, timeStr: string): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, (m || 1) - 1, d || 1)
  const datePart = `${days[dt.getDay()]}, ${months[dt.getMonth()]} ${d}`
  const [hh, mm] = timeStr.split(':').map(Number)
  const ampm = (hh || 0) >= 12 ? 'PM' : 'AM'
  const h12 = ((hh || 0) % 12) || 12
  return `${datePart} at ${h12}:${String(mm || 0).padStart(2, '0')} ${ampm}`
}
