import { schedules, tasks } from "@trigger.dev/sdk"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import Anthropic from "@anthropic-ai/sdk"
import { getBillingStatus } from "@/lib/billing"
import { buildCampaignRecipients, type CampaignLike } from "@/lib/campaignAudience"

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// The scheduler spends the platform's Twilio/Resend/Anthropic budget
// exactly like the manual send route, so it gets the same billing gate:
// campaigns for lapsed/cancelled accounts are skipped (left scheduled;
// they fire if billing comes back).
async function shopBillingActive(supabase: SupabaseClient, shopId: string): Promise<boolean> {
  const { data: shop } = await supabase.from('shops').select('owner_id').eq('id', shopId).maybeSingle()
  if (!shop?.owner_id) return false
  const { data: profile } = await supabase
    .from('profiles')
    .select('subscription_status, subscription_end_date, stripe_customer_id, stripe_subscription_id, trial_end')
    .eq('id', shop.owner_id)
    .maybeSingle()
  const status = getBillingStatus(profile)
  return status === 'active' || status === 'trial' || status === 'grace'
}

// Build this run's recipients, then claim 'sending' BEFORE triggering
// the send task (triggering first let a fast task's 'sent' write be
// overwritten back to 'sending', wedging the campaign). Returns false
// when the run should not fire (billing blocked or audience too large).
async function prepareAndTrigger(
  supabase: SupabaseClient,
  campaign: CampaignLike,
  triggerType: 'once' | 'recurring',
  now: Date,
): Promise<boolean> {
  if (!(await shopBillingActive(supabase, campaign.shop_id))) {
    console.log(`[campaign-scheduler] skipping campaign ${campaign.id}: shop billing not active`)
    return false
  }

  // Clear last run's never-sent recipient rows so the audience rebuilds
  // fresh. A row is only cleared when NOTHING on it was ever sent —
  // the old pair of single-channel deletes could erase a row whose SMS
  // had sent but email was still pending, destroying the send record
  // that attribution and stats rely on.
  await supabase.from('campaign_recipients')
    .delete()
    .eq('campaign_id', campaign.id)
    .in('sms_status', ['pending', 'skipped'])
    .in('email_status', ['pending', 'skipped'])
    .is('sent_at', null)

  const { audienceSize, tooLarge } = await buildCampaignRecipients(supabase, campaign)
  if (tooLarge) {
    console.log(`[campaign-scheduler] skipping campaign ${campaign.id}: audience ${audienceSize} too large`)
    return false
  }

  await supabase.from('campaigns').update({ status: 'sending', updated_at: now.toISOString() }).eq('id', campaign.id)
  // Trigger even when audienceSize is 0: the send task records the
  // campaign_runs row, which is what advances the recurrence clock.
  await tasks.trigger('campaign-send', { campaignId: campaign.id, triggerType })
  return true
}

function nextRecurrenceDate(rule: string, from: Date): Date {
  const d = new Date(from)
  if (rule === 'weekly') d.setDate(d.getDate() + 7)
  else if (rule === 'biweekly') d.setDate(d.getDate() + 14)
  else if (rule === 'monthly') d.setMonth(d.getMonth() + 1)
  return d
}

const BUSINESS_TYPE: Record<string, string> = { barbershop: 'barbershop', salon: 'hair salon', tattoo: 'tattoo studio' }

export const campaignScheduler = schedules.task({
  id: "campaign-scheduler",
  cron: "0 * * * *", // every hour

  run: async () => {
    const supabase = getSupabase()
    const now = new Date()
    let triggered = 0

    // Once campaigns due now
    const { data: onceDue } = await supabase
      .from('campaigns')
      .select('*')
      .eq('status', 'scheduled')
      .eq('schedule_type', 'once')
      .lte('scheduled_at', now.toISOString())

    for (const campaign of onceDue ?? []) {
      // Scheduled campaigns never went through the send route, so no
      // recipients existed — the task found an empty table and marked
      // the campaign sent with zero messages delivered. The audience is
      // built here, at due time, through the shared builder.
      if (await prepareAndTrigger(supabase, campaign, 'once', now)) triggered++
    }

    // Recurring campaigns
    const { data: recurring } = await supabase
      .from('campaigns')
      .select('*, campaign_runs(run_at)')
      .in('status', ['scheduled', 'sent'])
      .eq('schedule_type', 'recurring')
      .lte('scheduled_at', now.toISOString())

    for (const campaign of recurring ?? []) {
      // Check end conditions
      if (campaign.recurrence_end_at && new Date(campaign.recurrence_end_at) < now) continue

      const runs = (campaign.campaign_runs ?? []) as Array<{ run_at: string }>
      if (campaign.recurrence_count != null && runs.length >= campaign.recurrence_count) continue

      // Check if last run was recent enough to skip
      const lastRun = runs.sort((a: any, b: any) => b.run_at.localeCompare(a.run_at))[0]
      if (lastRun) {
        const nextDue = nextRecurrenceDate(campaign.recurrence_rule ?? 'weekly', new Date(lastRun.run_at))
        if (nextDue > now) continue
      }

      // Optionally regenerate message for AI-curated campaigns
      if (campaign.ai_generated && campaign.audience_filters?.custom_curate) {
        try {
          const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
          const { data: shop } = await supabase.from('shops').select('name, vertical').eq('id', campaign.shop_id).maybeSingle()
          const businessType = BUSINESS_TYPE[(shop as any)?.vertical || 'barbershop'] || 'barbershop'
          const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 600,
            system: `You are a marketing copywriter for a ${businessType}. Write campaign messages that feel personal, not corporate. Never use generic phrases like 'valued customer'. For SMS: under 160 characters, clear action. For email: subject under 50 chars, body under 150 words. Return only JSON with keys: sms_message, email_subject, email_body. No preamble.`,
            messages: [{
              role: 'user',
              content: `Shop: ${shop?.name}. Campaign intent: ${campaign.intent}. Audience: ${campaign.audience_type}. Write a fresh version of this recurring campaign message.`,
            }],
          })
          const raw = (response.content[0] as Anthropic.TextBlock).text.trim()
          const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
          const parsed = JSON.parse(cleaned)
          await supabase.from('campaigns').update({
            sms_message: parsed.sms_message,
            email_subject: parsed.email_subject,
            email_body: parsed.email_body,
            updated_at: now.toISOString(),
          }).eq('id', campaign.id)
        } catch {
          // Use existing message if AI regeneration fails
        }
      }

      // Build this run's audience fresh and fire (billing gate, stale
      // pending cleanup, claim-before-trigger inside). The old branch
      // deleted pending recipients and triggered the task without ever
      // inserting new ones, so recurring campaigns sent to nobody.
      if (await prepareAndTrigger(supabase, campaign, 'recurring', now)) triggered++
    }

    console.log(`[campaign-scheduler] triggered: ${triggered}`)
    return { triggered }
  },
})
