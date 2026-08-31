import { createClient } from "@supabase/supabase-js"
import twilio from "twilio"
import { logger } from "@/lib/logger"

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function rewardText(rewardType: string, rewardValue: number): string {
  return rewardType === 'percent_off' ? `${rewardValue}% off` : `$${rewardValue} off`
}

// Drains the referral_events outbox that update_client_lock() writes to
// on every completed appointment -- the DB trigger does the data-level
// work (marking rewards earned) synchronously in the same transaction as
// the appointment update, but leaves the actual SMS send to this job,
// same split already used for lapse_alerts -> rebooking-sms.
//
// Not its own schedules.task: the Trigger.dev project is already at its
// 10/10 schedule limit (confirmed via a failed deploy), so this is
// exported as a plain function and called from the end of
// depositHoldExpiration's run() instead, which already runs every 5
// minutes -- close enough to "immediately after their first completed
// appointment" (the referral spec's own wording) without registering an
// 11th schedule. Kept in its own module/function (not merged logic) and
// wrapped in try/catch at the call site so a failure here can't affect
// deposit-hold processing or vice versa.
export async function runReferralNotifications() {
  const supabase = getSupabase()

  const { data: events, error: eventsErr } = await supabase
    .from('referral_events')
    .select('id, client_id, shop_id, event_type, reward_id')
    .is('processed_at', null)
    .order('created_at', { ascending: true })
    .limit(200)

  if (eventsErr) throw new Error(`referral_events query failed: ${eventsErr.message}`)
  if (!events || events.length === 0) return { processed: 0, sent: 0 }

  const clientIds = [...new Set(events.map(e => e.client_id))]
  const shopIds = [...new Set(events.map(e => e.shop_id))]
  const rewardIds = [...new Set(events.map(e => e.reward_id).filter(Boolean))] as string[]

  const [{ data: clients }, { data: shops }, { data: rewards }] = await Promise.all([
    supabase.from('clients').select('id, full_name, phone, sms_consent, referral_code').in('id', clientIds),
    supabase.from('shops').select('id, name, shop_code, referral_reward_type, referral_reward_value').in('id', shopIds),
    rewardIds.length > 0
      ? supabase.from('referral_rewards').select('id, reward_type, reward_value').in('id', rewardIds)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const clientMap = new Map((clients ?? []).map(c => [c.id, c]))
  const shopMap = new Map((shops ?? []).map(s => [s.id, s]))
  const rewardMap = new Map((rewards ?? []).map(r => [r.id, r]))

  const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://chairos.cc'

  let sent = 0
  const processedIds: string[] = []
  const logs: object[] = []

  for (const event of events) {
    const client = clientMap.get(event.client_id)
    const shop = shopMap.get(event.shop_id)
    processedIds.push(event.id)

    if (!client?.phone || !client.sms_consent || !shop) {
      logs.push({ type: 'referral_sms', payload: event, result: 'skipped:no_consent_or_missing_data' })
      continue
    }

    let body: string
    if (event.event_type === 'first_visit') {
      const link = `${siteUrl}/book/${shop.shop_code}?ref=${client.referral_code}`
      body = `Thanks for visiting ${shop.name}! Share your link, you'll both get ${rewardText(shop.referral_reward_type, shop.referral_reward_value)} when your friend books their first visit: ${link}`
    } else {
      const reward = event.reward_id ? rewardMap.get(event.reward_id) : null
      if (!reward) {
        logs.push({ type: 'referral_sms', payload: event, result: 'skipped:reward_not_found' })
        continue
      }
      body = `Great news -- your friend just completed their first visit at ${shop.name}! You've earned ${rewardText(reward.reward_type, reward.reward_value)}, applied automatically on your next booking there.`
    }

    try {
      const msg = await twilioClient.messages.create({
        body,
        from: process.env.TWILIO_PHONE_NUMBER!,
        to: client.phone,
      })
      sent++
      logs.push({ type: 'referral_sms', payload: event, result: `sent:${msg.sid}` })
    } catch (err: any) {
      logs.push({ type: 'referral_sms', payload: event, result: `twilio_error:${err.message}` })
    }
  }

  if (logs.length > 0) {
    const { error: logErr } = await supabase.from('automation_logs').insert(logs)
    if (logErr) logger.error('referral_notifications_log_insert_failed', { message: logErr.message })
  }

  if (processedIds.length > 0) {
    const { error: markErr } = await supabase
      .from('referral_events')
      .update({ processed_at: new Date().toISOString() })
      .in('id', processedIds)
    if (markErr) logger.error('referral_events_mark_processed_failed', { message: markErr.message })
  }

  logger.info('referral_notifications_run_complete', { processed: processedIds.length, sent })
  return { processed: processedIds.length, sent }
}
