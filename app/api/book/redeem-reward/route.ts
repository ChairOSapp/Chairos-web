import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { applyRewardDiscount, redeemReward, validateReward } from '@/lib/server-pricing'
import { logger } from '@/lib/logger'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Validates a claimed referral reward server-side and flips it to
// 'redeemed', returning the validated reward details (and the discount
// amount when a base price is supplied). The discount is computed here,
// from the ledger -- never from a client-supplied price. The public
// booking flow redeems through POST /api/book/create instead of calling
// this directly; this endpoint remains for explicit reward-redemption
// calls (e.g. staff applying a client's reward manually).
export async function POST(req: NextRequest) {
  const { clientId, shopId, rewardId, baseAmount } = await req.json()
  if (!clientId || !shopId || !rewardId) {
    return NextResponse.json({ error: 'clientId, shopId, and rewardId are required' }, { status: 400 })
  }

  const admin = getAdmin()

  let reward
  try {
    reward = await validateReward(admin, { rewardId, shopId, clientId })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Reward not found' }, { status: 404 })
  }

  let redeemed = false
  try {
    redeemed = await redeemReward(admin, reward.id)
  } catch (e) {
    logger.error('referral_reward_redeem_failed', { rewardId, message: e instanceof Error ? e.message : String(e) })
    return NextResponse.json({ error: 'Could not redeem reward' }, { status: 500 })
  }
  if (!redeemed) {
    return NextResponse.json({ ok: false, reason: 'not_earned' })
  }

  const discount =
    baseAmount != null && !Number.isNaN(Number(baseAmount))
      ? Math.round((Number(baseAmount) - applyRewardDiscount(Number(baseAmount), reward.type, reward.value)) * 100) / 100
      : null

  return NextResponse.json({ ok: true, reward: { id: reward.id, type: reward.type, value: reward.value }, discount })
}
