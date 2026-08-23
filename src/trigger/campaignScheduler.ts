import { schedules, tasks } from "@trigger.dev/sdk"
import { createClient } from "@supabase/supabase-js"
import Anthropic from "@anthropic-ai/sdk"

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
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
      await supabase.from('campaigns').update({ status: 'sending', updated_at: now.toISOString() }).eq('id', campaign.id)
      await tasks.trigger('campaign-send', { campaignId: campaign.id })
      triggered++
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

      // First, insert campaign_recipients for this run (clear old pending ones)
      await supabase.from('campaign_recipients').delete().eq('campaign_id', campaign.id).eq('sms_status', 'pending')
      await supabase.from('campaign_recipients').delete().eq('campaign_id', campaign.id).eq('email_status', 'pending')

      await tasks.trigger('campaign-send', { campaignId: campaign.id })
      await supabase.from('campaign_runs').insert({
        campaign_id: campaign.id,
        run_at: now.toISOString(),
        recipients_count: 0,
        sent_count: 0,
        failed_count: 0,
        trigger_type: 'recurring',
      })
      await supabase.from('campaigns').update({ status: 'sending', updated_at: now.toISOString() }).eq('id', campaign.id)
      triggered++
    }

    console.log(`[campaign-scheduler] triggered: ${triggered}`)
    return { triggered }
  },
})
