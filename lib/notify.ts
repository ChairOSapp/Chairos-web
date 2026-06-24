import { createClient as createSupabaseClient } from '@supabase/supabase-js'

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
}: {
  userId: string
  shopId?: string
  type: string
  title: string
  body: string
}) {
  await supabase.from('notifications').insert({
    user_id: userId,
    shop_id: shopId || null,
    type,
    title,
    body,
    read: false,
  })
}
