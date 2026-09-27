import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { sendPushToUser } from '@/lib/push'
import { logger } from '@/lib/logger'

const supabase = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function sendNotification({
  userId,
  shopId,
  type,
  title,
  body,
  push = true,
}: {
  userId: string
  shopId?: string
  type: string
  title: string
  body: string
  // Push fan-out is best-effort and never throws: if the user has the iOS
  // app installed the notification also lands as a push; otherwise it's
  // just the in-app row. Pass push:false for notification types that
  // should stay in-app only.
  push?: boolean
}) {
  await supabase.from('notifications').insert({
    user_id: userId,
    shop_id: shopId || null,
    type,
    title,
    body,
    read: false,
  })

  if (push) {
    try {
      await sendPushToUser(userId, {
        title,
        body,
        data: { type, ...(shopId ? { shopId } : {}) },
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
