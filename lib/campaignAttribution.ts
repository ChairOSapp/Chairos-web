import { SupabaseClient } from '@supabase/supabase-js'

// How many days after a campaign send a booking still counts as plausibly
// campaign-driven. No existing signal in this codebase suggested a
// different default was needed, so this uses the 14 days named in the spec.
export const ATTRIBUTION_WINDOW_DAYS = 14

// For one shop: finds campaign sends in the last attribution window that
// haven't yet been matched to a booking, and checks whether that client
// booked a (non-cancelled) appointment within the window after the send. If
// so, tags the appointment with campaign_attributed_id and marks its source
// as 'campaign' -- this is positive evidence of the channel, overriding
// whatever channel guess was made at booking time. Returns the number of
// appointments newly attributed.
export async function attributeRecentBookings(admin: SupabaseClient, shopId: string): Promise<number> {
  const windowMs = ATTRIBUTION_WINDOW_DAYS * 86400000
  const lookbackStart = new Date(Date.now() - windowMs).toISOString()

  const { data: recipients } = await admin
    .from('campaign_recipients')
    .select('id, client_id, campaign_id, sent_at, campaigns!inner(shop_id)')
    .eq('campaigns.shop_id', shopId)
    .not('client_id', 'is', null)
    .not('sent_at', 'is', null)
    .gte('sent_at', lookbackStart)

  if (!recipients || recipients.length === 0) return 0

  let attributed = 0
  for (const r of recipients) {
    const windowEnd = new Date(new Date(r.sent_at).getTime() + windowMs).toISOString()

    const { data: appts } = await admin
      .from('appointments')
      .select('id')
      .eq('client_id', r.client_id)
      .eq('shop_id', shopId)
      .is('campaign_attributed_id', null)
      .neq('status', 'cancelled')
      .gte('created_at', r.sent_at)
      .lte('created_at', windowEnd)
      .order('created_at', { ascending: true })
      .limit(1)

    if (appts && appts.length > 0) {
      await admin.from('appointments').update({
        campaign_attributed_id: r.campaign_id,
        source: 'campaign',
      }).eq('id', appts[0].id)
      attributed++
    }
  }

  return attributed
}
