import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Called (non-fatal, fire-and-forget) right after the public booking page
// creates an appointment for a client with an active earned reward. No
// auth session by design, so the reward is re-validated server-side
// (belongs to this client, this shop, still 'earned') before flipping it
// to 'redeemed' -- the discount itself was already applied client-side to
// the price sent with the appointment insert, same trust model the rest
// of this booking flow already uses for price/deposit amounts; this just
// keeps the rewards ledger's status accurate for the owner-facing view.
export async function POST(req: NextRequest) {
  const { clientId, shopId, rewardId } = await req.json()
  if (!clientId || !shopId || !rewardId) {
    return NextResponse.json({ error: 'clientId, shopId, and rewardId are required' }, { status: 400 })
  }

  const admin = getAdmin()

  const { data: reward } = await admin
    .from('referral_rewards')
    .select('id, status')
    .eq('id', rewardId)
    .eq('shop_id', shopId)
    .eq('referring_client_id', clientId)
    .maybeSingle()

  if (!reward) return NextResponse.json({ error: 'Reward not found' }, { status: 404 })
  if (reward.status !== 'earned') {
    return NextResponse.json({ ok: false, reason: 'not_earned' })
  }

  const { error } = await admin
    .from('referral_rewards')
    .update({ status: 'redeemed', redeemed_at: new Date().toISOString() })
    .eq('id', rewardId)
    .eq('status', 'earned')

  if (error) {
    logger.error('referral_reward_redeem_failed', { rewardId, message: error.message })
    return NextResponse.json({ error: 'Could not redeem reward' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
