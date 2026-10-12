import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { requireActiveBilling } from '@/lib/billing'
import { checkRateLimit } from '@/lib/rate-limit'
import { buildCampaignRecipients, MAX_CAMPAIGN_RECIPIENTS } from '@/lib/campaignAudience'
import { campaignSend } from '@/src/trigger/campaignSend'

export async function POST(req: NextRequest) {
  try {
    return await handleSend(req)
  } catch (err) {
    // The pre-flight steps below (auth, billing gate, rate limit, claim)
    // run outside the send try/catch, so a throw there used to surface as
    // a bare HTML 500 and the UI could only show a generic "server had a
    // problem" message. Return the real error as JSON so failures are
    // diagnosable from the UI and the logs alike.
    console.error('[campaigns/send] unhandled error', err)
    return NextResponse.json(
      { error: `Campaign send hit a server error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    )
  }
}

async function handleSend(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { campaignId } = await req.json()
  if (!campaignId) return NextResponse.json({ error: 'campaignId required' }, { status: 400 })

  const { data: campaign } = await admin
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .maybeSingle()

  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  const { data: shop } = await admin.from('shops').select('id').eq('owner_id', user.id).eq('id', campaign.shop_id).maybeSingle()
  if (!shop) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Billing gate: campaigns burn Twilio/Resend spend, so expired trials and
  // cancelled accounts get a 402 (UI turns it into an upsell) before any
  // recipient rows are written or any message is sent.
  const billingBlock = await requireActiveBilling(admin, user.id)
  if (billingBlock) return billingBlock

  // Authenticated spend rate limit: bulk sends burn Twilio/Resend budget,
  // so the blast endpoint is user-scoped and fail-closed.
  const sendLimit = await checkRateLimit('campaignSend', `user:${user.id}`)
  if (!sendLimit.ok) {
    return NextResponse.json(
      { error: 'Too many campaign sends. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(sendLimit.retryAfterSeconds) } }
    )
  }

  // Status gate + idempotency: only draft or scheduled campaigns may be
  // sent, and the transition to 'sending' is claimed atomically so a
  // double-click, retry, or replayed request can't blast the audience twice.
  // A 'sending' claim older than 30 minutes means the sender died mid-blast
  // (no heartbeat writer exists); allow this request to reclaim it rather
  // than wedging the campaign in 'sending' forever.
  const priorStatus = campaign.status as string
  const staleCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  const { data: claimed } = await admin
    .from('campaigns')
    .update({ status: 'sending', updated_at: new Date().toISOString() })
    .eq('id', campaignId)
    .or(`status.in.(draft,scheduled),and(status.eq.sending,updated_at.lt.${staleCutoff})`)
    .select('id')
    .maybeSingle()
  if (!claimed) {
    return NextResponse.json(
      { error: 'This campaign has already been sent or is currently sending.' },
      { status: 409 }
    )
  }

  // Release the 'sending' claim if anything fails before the final status
  // update: a crash between claim and completion must not wedge the
  // campaign in 'sending' with no retry path.
  const releaseSendClaim = () =>
    admin.from('campaigns')
      .update({ status: priorStatus, updated_at: new Date().toISOString() })
      .eq('id', campaignId)

  try {

  // Build the audience and insert recipient rows via the shared builder
  // (lib/campaignAudience) — the scheduler uses the same code path for
  // once/recurring campaigns, so all three send types resolve the
  // audience identically to the preview.
  const { audienceSize, tooLarge } = await buildCampaignRecipients(admin, campaign)

  if (tooLarge) {
    await releaseSendClaim()
    return NextResponse.json(
      { error: `Audience too large (${audienceSize}; max ${MAX_CAMPAIGN_RECIPIENTS}). Narrow the audience and retry.` },
      { status: 400 }
    )
  }

  if (audienceSize === 0) {
    // Claimed above; release before the early return so the campaign does
    // not wedge in 'sending'.
    await releaseSendClaim()
    return NextResponse.json({ recipientCount: 0, triggered: false, message: 'No eligible recipients' })
  }

  // Status was already claimed as 'sending' atomically above.

  // Hand off to the Trigger.dev background task. The send loop used to run
  // inline here, but a large audience blows past the API route's execution
  // timeout. The task processes recipients with bounded concurrency and
  // updates per-recipient statuses as it goes; the campaign row stays
  // 'sending' until the task marks it 'sent'.
  await campaignSend.trigger({ campaignId })

  console.log(`[campaigns/send] triggered background send for campaign ${campaignId}: ${audienceSize} recipients`)
  return NextResponse.json({ recipientCount: audienceSize, triggered: true })
  } catch (err: any) {
    // Anything thrown after the claim (audience queries, recipient
    // insert, sender init) releases the claim so the campaign can be
    // retried instead of wedging in 'sending'.
    await releaseSendClaim()
    return NextResponse.json(
      { error: 'Campaign send failed before completion. The campaign was returned to its previous state and can be retried.' },
      { status: 500 }
    )
  }
}
