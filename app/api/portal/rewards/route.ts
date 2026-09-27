import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { readPortalSession } from '@/lib/portalSession'
import { resolvePortalClient } from '@/lib/portalData'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Earned-but-unredeemed referral rewards for the signed-in portal client,
// per shop. Lets clients see "you've earned X off" instead of discovering
// it only mid-booking.
export async function GET(req: NextRequest) {
  const session = readPortalSession(req)
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const admin = getAdmin()
  const portalClient = await resolvePortalClient(admin, session.phone)
  if (!portalClient) return NextResponse.json({ error: 'No client record found' }, { status: 404 })

  const rewards: { shopId: string; shopName: string; rewardText: string }[] = []
  for (const s of portalClient.shops) {
    const { data } = await admin.rpc('get_active_referral_reward', {
      p_client_id: portalClient.clientId,
      p_shop_id: s.shopId,
    })
    const row = Array.isArray(data) ? data[0] : data
    if (row) {
      const text = row.reward_type === 'percent_off' ? `${row.reward_value}% off` : `$${row.reward_value} off`
      rewards.push({ shopId: s.shopId, shopName: s.shopName, rewardText: text })
    }
  }
  return NextResponse.json({ rewards })
}
