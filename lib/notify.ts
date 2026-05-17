import { createClient } from '@/lib/supabase'

export async function sendNotification({
  userId,
  shopId,
  type,
  title,
  body,
}: {
  userId: string
  shopId?: string
  type: string
  title: string
  body: string
}) {
  const supabase = createClient()
  await supabase.from('notifications').insert({
    user_id: userId,
    shop_id: shopId || null,
    type,
    title,
    body,
    read: false,
  })
}
