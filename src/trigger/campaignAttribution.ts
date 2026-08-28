import { schedules } from "@trigger.dev/sdk"
import { createClient } from "@supabase/supabase-js"
import { attributeRecentBookings } from "@/lib/campaignAttribution"

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export const campaignAttribution = schedules.task({
  id: "campaign-attribution",
  cron: "30 6 * * *", // daily, shortly after clientLapseDetection

  run: async () => {
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
  },
})
