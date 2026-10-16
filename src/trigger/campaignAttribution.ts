import { createClient } from "@supabase/supabase-js"
import { attributeRecentBookings } from "@/lib/campaignAttribution"

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Not its own schedules.task: the Trigger.dev project is at its 10/10
// schedule limit, so this is exported as a plain function and called
// from the end of clientLapseDetection's run() instead — it always ran
// 30 minutes after lapse detection anyway (was cron "30 6 * * *").
// Same pattern as referralNotifications inside depositHoldExpiration.
// Kept in its own module/function (not merged logic); the call site
// wraps it in try/catch, and per-shop errors are logged to
// automation_logs below exactly as before.
export async function runCampaignAttribution() {
  const supabase = getSupabase()

  const { data: shops } = await supabase.from('shops').select('id')

  let totalAttributed = 0
  for (const shop of shops ?? []) {
    try {
      totalAttributed += await attributeRecentBookings(supabase, shop.id)
    } catch (err: any) {
      await supabase.from('automation_logs').insert({
        type: 'campaign_attribution_error',
        payload: { shop_id: shop.id },
        result: err.message,
      })
    }
  }

  console.log(`[campaign-attribution] appointments attributed: ${totalAttributed}`)
  return { totalAttributed }
}
