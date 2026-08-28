import { schedules } from "@trigger.dev/sdk"
import { createClient } from "@supabase/supabase-js"
import { computeRecommendations } from "@/lib/recommendationsEngine"

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export const ownerRecommendations = schedules.task({
  id: "owner-recommendations",
  cron: "0 13 * * 1", // 9am ET every Monday

  run: async () => {
    const supabase = getSupabase()

    const { data: shops, error: shopsError } = await supabase
      .from('shops')
      .select('id, owner_id')

    if (shopsError) {
      console.error('[owner-recommendations] shops query error:', shopsError)
      return { shopsProcessed: 0, recommendationsCreated: 0 }
    }

    const ownerIds = (shops ?? []).map(s => s.owner_id)
    const { data: ownerProfiles } = await supabase
      .from('profiles')
      .select('id, subscription_status')
      .in('id', ownerIds)
    const profileMap = Object.fromEntries((ownerProfiles ?? []).map(p => [p.id, p]))

    const activeShops = (shops ?? []).filter(s => {
      const status = profileMap[s.owner_id]?.subscription_status
      return status === 'active' || status === 'trialing' || status == null
    })

    let recommendationsCreated = 0

    for (const shop of activeShops) {
      try {
        const recs = await computeRecommendations(supabase, shop.id)

        // Regenerated fresh each run against current data — clears out last
        // period's cards (including any the owner dismissed) rather than
        // accumulating stale duplicates.
        await supabase.from('recommendations').delete().eq('shop_id', shop.id)

        if (recs.length > 0) {
          await supabase.from('recommendations').insert(recs.map(r => ({ ...r, status: 'active' })))
          recommendationsCreated += recs.length
        }
      } catch (err: any) {
        await supabase.from('automation_logs').insert({
          type: 'owner_recommendations_error',
          payload: { shop_id: shop.id },
          result: err.message,
        })
      }
    }

    console.log(`[owner-recommendations] shops processed: ${activeShops.length}, recommendations created: ${recommendationsCreated}`)
    return { shopsProcessed: activeShops.length, recommendationsCreated }
  },
})
