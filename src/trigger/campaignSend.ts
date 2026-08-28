import { task, wait } from "@trigger.dev/sdk"
import { createClient } from "@supabase/supabase-js"
import twilio from "twilio"
import { getResend } from "@/lib/resend"
import { buildEmailTemplate } from "@/lib/emailTemplates"
import { generateUnsubscribeToken } from "@/lib/unsubscribeToken"

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function appendStop(message: string): string {
  const suffix = ' Reply STOP to unsubscribe.'
  if (message.toLowerCase().includes('reply stop')) return message
  if ((message + suffix).length <= 160) return message + suffix
  return message
}

export const campaignSend = task({
  id: "campaign-send",

  run: async ({ campaignId }: { campaignId: string }) => {
    const supabase = getSupabase()

    const { data: campaign } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .maybeSingle()

    if (!campaign) throw new Error(`Campaign ${campaignId} not found`)

    const { data: recipients } = await supabase
      .from('campaign_recipients')
      .select('*')
      .eq('campaign_id', campaignId)
      .or('sms_status.eq.pending,email_status.eq.pending')

    if (!recipients || recipients.length === 0) {
      await supabase.from('campaigns').update({ status: 'sent', updated_at: new Date().toISOString() }).eq('id', campaignId)
      return { sent: 0, failed: 0 }
    }

    const twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_AUTH_TOKEN!
    )

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://chairos.cc'
    const BATCH = 50
    let totalSent = 0
    let totalFailed = 0

    for (let i = 0; i < recipients.length; i += BATCH) {
      const batch = recipients.slice(i, i + BATCH)

      for (const recipient of batch) {
        // SMS send
        if (campaign.channel === 'sms' || campaign.channel === 'both') {
          if (recipient.sms_status === 'pending' && recipient.phone) {
            // Verify consent
            const { data: client } = await supabase
              .from('clients')
              .select('sms_consent')
              .eq('id', recipient.client_id)
              .maybeSingle()

            if (!client?.sms_consent) {
              await supabase.from('campaign_recipients').update({ sms_status: 'skipped' }).eq('id', recipient.id)
              continue
            }

            const smsBody = appendStop(campaign.sms_message ?? '')
            let smsStatus = 'failed'
            let errMsg: string | null = null

            try {
              await twilioClient.messages.create({
                body: smsBody,
                from: process.env.TWILIO_PHONE_NUMBER!,
                to: recipient.phone,
              })
              smsStatus = 'sent'
              totalSent++
            } catch (err: any) {
              errMsg = err.message
              totalFailed++
            }

            await supabase.from('campaign_recipients').update({
              sms_status: smsStatus,
              sent_at: smsStatus === 'sent' ? new Date().toISOString() : null,
              error: errMsg,
            }).eq('id', recipient.id)
          }
        }

        // Email send
        if (campaign.channel === 'email' || campaign.channel === 'both') {
          if (recipient.email_status === 'pending' && recipient.email) {
            const { data: client } = await supabase
              .from('clients')
              .select('email_consent')
              .eq('id', recipient.client_id)
              .maybeSingle()

            if (!client?.email_consent) {
              await supabase.from('campaign_recipients').update({ email_status: 'skipped' }).eq('id', recipient.id)
              continue
            }

            const unsubToken = generateUnsubscribeToken(recipient.client_id)
            const unsubUrl = `${siteUrl}/api/email/unsubscribe?token=${unsubToken}`
            const html = buildEmailTemplate(campaign.email_body ?? '', unsubUrl)

            let emailStatus = 'failed'
            let errMsg: string | null = null
            let resendEmailId: string | null = null

            try {
              const { data, error } = await getResend().emails.send({
                from: process.env.RESEND_FROM_EMAIL!,
                to: recipient.email,
                subject: campaign.email_subject ?? '',
                html,
              })
              if (error) throw new Error(error.message)
              emailStatus = 'sent'
              resendEmailId = data?.id ?? null
              totalSent++
            } catch (err: any) {
              errMsg = err.message
              totalFailed++
            }

            await supabase.from('campaign_recipients').update({
              email_status: emailStatus,
              sent_at: emailStatus === 'sent' ? new Date().toISOString() : null,
              error: errMsg,
              resend_email_id: resendEmailId,
            }).eq('id', recipient.id)
          }
        }
      }

      // 100ms delay between batches
      if (i + BATCH < recipients.length) {
        await wait.for({ seconds: 1 })
      }
    }

    // Update campaign totals
    await supabase.from('campaigns').update({
      sent_count: totalSent,
      failed_count: totalFailed,
      status: 'sent',
      updated_at: new Date().toISOString(),
    }).eq('id', campaignId)

    // Insert campaign_runs row
    await supabase.from('campaign_runs').insert({
      campaign_id: campaignId,
      recipients_count: recipients.length,
      sent_count: totalSent,
      failed_count: totalFailed,
      trigger_type: 'manual',
    })

    console.log(`[campaign-send] campaign ${campaignId}: sent=${totalSent}, failed=${totalFailed}`)
    return { sent: totalSent, failed: totalFailed }
  },
})
