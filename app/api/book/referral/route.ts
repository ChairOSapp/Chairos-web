import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Called (non-fatal, fire-and-forget) from the public booking page right
// after a brand-new client is created via ?ref=CODE. No auth session by
// design -- same shape as /api/book/membership -- so every id is verified
// server-side before any write, and the reward's type/value are snapshotted
// from the shop's settings at referral time rather than read live later,
// so a later settings change can't retroactively change what was promised.
export async function POST(req: NextRequest) {
  const { clientId, shopId, refCode } = await req.json()
  if (!clientId || !shopId || !refCode) {
    return NextResponse.json({ error: 'clientId, shopId, and refCode are required' }, { status: 400 })
  }

  const admin = getAdmin()

  const { data: shop } = await admin
    .from('shops')
    .select('id, referral_program_enabled, referral_reward_type, referral_reward_value')
    .eq('id', shopId)
    .maybeSingle()
  if (!shop) return NextResponse.json({ error: 'Shop not found' }, { status: 404 })
  if (!shop.referral_program_enabled) {
    return NextResponse.json({ ok: false, reason: 'program_disabled' })
  }

  const { data: referredClient } = await admin
    .from('clients')
    .select('id, referred_by_client_id')
    .eq('id', clientId)
    .maybeSingle()
  if (!referredClient) return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  if (referredClient.referred_by_client_id) {
    // Already attributed (e.g. a duplicate call) -- don't double-write.
    return NextResponse.json({ ok: false, reason: 'already_attributed' })
  }

  const { data: referringClient } = await admin
    .from('clients')
    .select('id')
    .eq('referral_code', refCode.toUpperCase())
    .maybeSingle()
  if (!referringClient) return NextResponse.json({ ok: false, reason: 'invalid_code' })
  if (referringClient.id === clientId) {
    return NextResponse.json({ ok: false, reason: 'self_referral' })
  }

  const { error: updateErr } = await admin
    .from('clients')
    .update({ referred_by_client_id: referringClient.id, source: 'referral' })
    .eq('id', clientId)
  if (updateErr) {
    logger.error('referral_client_update_failed', { clientId, message: updateErr.message })
    return NextResponse.json({ error: 'Could not record referral' }, { status: 500 })
  }

  const { error: rewardErr } = await admin.from('referral_rewards').insert({
    shop_id: shopId,
    referring_client_id: referringClient.id,
    referred_client_id: clientId,
    status: 'pending',
    reward_type: shop.referral_reward_type,
    reward_value: shop.referral_reward_value,
  })
  if (rewardErr) {
    logger.error('referral_reward_insert_failed', { shopId, message: rewardErr.message })
    return NextResponse.json({ error: 'Could not record referral' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
