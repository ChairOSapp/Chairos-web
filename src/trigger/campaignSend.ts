import { task } from "@trigger.dev/sdk"
import { createClient } from "@supabase/supabase-js"
import twilio from "twilio"
import { getResend } from "@/lib/resend"
import { buildEmailTemplate } from "@/lib/emailTemplates"
import { generateUnsubscribeToken, generateManualUnsubscribeToken } from "@/lib/unsubscribeToken"

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
  // Long messages would silently drop the opt-out notice (TCPA risk), so
  // truncate the body to keep the STOP suffix instead.
  return message.slice(0, 160 - suffix.length).trimEnd() + suffix
}

type CampaignRecipient = {
  id: string
  client_id: string | null
  phone: string | null
  email: string | null
  sms_status: string | null
  email_status: string | null
}

export const campaignSend = task({
  id: "campaign-send",

  run: async ({ campaignId, triggerType }: { campaignId: string; triggerType?: string }) => {    const supabase = getSupabase()

    const { data: campaign } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .maybeSingle()

    if (!campaign) throw new Error(`Campaign ${campaignId} not found`)

    // An owner can cancel while a send is queued or running: a cancelled
    // campaign must never send. The worker pool also re-checks this flag
    // as it goes, and the final write below never overwrites 'cancelled'.
    if (campaign.status === 'cancelled') {
      console.log(`[campaign-send] campaign ${campaignId} is cancelled; not sending`)
      return { sent: 0, failed: 0 }
    }

    // Reclaim safety: if this campaign's claim is stale (>30 min, the
    // send route's own staleness bound), a previous run may have died
    // mid-blast leaving recipients claimed in 'sending'. Release those
    // claims so they can be picked up below. Per-recipient claims are
    // atomic, so even if the old run is somehow still alive, a row can
    // only ever be sent by the one run that holds its claim.
    const claimStale = Date.now() - new Date(campaign.updated_at ?? 0).getTime() > 30 * 60 * 1000
    if (claimStale) {
      await supabase.from('campaign_recipients')
        .update({ sms_status: 'pending' })
        .eq('campaign_id', campaignId)
        .eq('sms_status', 'sending')
      await supabase.from('campaign_recipients')
        .update({ email_status: 'pending' })
        .eq('campaign_id', campaignId)
        .eq('email_status', 'sending')
    }

    const { data: recipients } = await supabase
      .from('campaign_recipients')
      .select('*')
      .eq('campaign_id', campaignId)
      .or('sms_status.eq.pending,email_status.eq.pending')

    if (!recipients || recipients.length === 0) {
      // Still record the run: the scheduler's recurrence math is driven
      // by campaign_runs, and skipping the row here left recurring
      // campaigns due forever, re-triggering (and re-generating AI copy)
      // every hour. Never overwrite a cancellation.
      await supabase.from('campaign_runs').insert({
        campaign_id: campaignId,
        recipients_count: 0,
        sent_count: 0,
        failed_count: 0,
        trigger_type: triggerType ?? 'manual',
      })
      await supabase.from('campaigns')
        .update({ status: 'sent', updated_at: new Date().toISOString() })
        .eq('id', campaignId)
        .neq('status', 'cancelled')
      return { sent: 0, failed: 0 }
    }

    // CAN-SPAM: honor opt-outs recorded by earlier campaigns for this shop.
    // Unsubscribes are stored as campaign_recipients rows with
    // email_status='unsubscribed'; skip those addresses on every future send.
    // (The old inline API sender did this; the task must too.)
    // Case-insensitive on both sides: an unsubscribe recorded as
    // "User@X.com" must suppress "user@x.com" (an exact-match Set missed
    // it, and the DB-side .in() filter was case-sensitive too, so fetch
    // the shop's unsubscribed addresses and compare lowercased).
    const suppressedEmails = new Set<string>()
    if (campaign.channel === 'email' || campaign.channel === 'both') {
      const { data: unsubs } = await supabase
        .from('campaign_recipients')
        .select('email, campaigns!inner(shop_id)')
        .eq('campaigns.shop_id', campaign.shop_id)
        .eq('email_status', 'unsubscribed')
        .limit(10000)
      for (const r of (unsubs ?? []) as unknown as { email: string | null }[]) {
        if (r.email) suppressedEmails.add(r.email.toLowerCase())
      }
    }


    const twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_AUTH_TOKEN!
    )

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://chairos.cc'
    let totalSent = 0
    let totalFailed = 0

    // Bounded concurrency: a small worker pool instead of one recipient at
    // a time. Each worker pulls the next recipient until the queue is empty.
    // (The old code did 50-recipient batches with a 1s pause; 8 concurrent
    // senders move faster without hammering Twilio/Resend.)
    const CONCURRENCY = 8

    const queue: CampaignRecipient[] = [...recipients]

    // Mid-run cancellation: workers stop pulling new recipients once the
    // owner cancels. The flag is refreshed from the campaign row every
    // 25 processed recipients (cheap, and a blast is long enough that
    // this bounds the overshoot to a few dozen messages at most).
    let processedCount = 0
    let cancelObserved = false
    async function refreshCancelFlag() {
      const { data: fresh } = await supabase.from('campaigns').select('status').eq('id', campaignId).maybeSingle()
      if (fresh?.status === 'cancelled') cancelObserved = true
    }

    async function sendToRecipient(recipient: CampaignRecipient): Promise<void> {

        // SMS send
        if (campaign.channel === 'sms' || campaign.channel === 'both') {
          if (recipient.sms_status === 'pending' && recipient.phone) {
            // Verify consent. All audiences (including manual list) now
            // resolve to client rows in the audience builder, so a recipient
            // with no client row is only a legacy/safety case — treat it as
            // OK rather than failing closed on old data.
            let consentOk = true
            if (recipient.client_id) {
              const { data: client } = await supabase
                .from('clients')
                .select('sms_consent')
                .eq('id', recipient.client_id)
                .maybeSingle()
              consentOk = !!client?.sms_consent
            }

            if (!consentOk) {
              await supabase.from('campaign_recipients').update({ sms_status: 'skipped' }).eq('id', recipient.id)
              // No return here: a client who declined SMS but consented
              // to email must still get the email below. This used to
              // abort the whole recipient.
            } else {
              // Atomic per-recipient claim: flip pending -> sending and
              // only proceed if THIS run won the row. A second concurrent
              // run (stale-claim reclaim, scheduler racing a manual send)
              // sees zero rows and skips — no duplicate texts.
              const { data: claimedRows } = await supabase
                .from('campaign_recipients')
                .update({ sms_status: 'sending' })
                .eq('id', recipient.id)
                .eq('sms_status', 'pending')
                .select('id')
              if (claimedRows && claimedRows.length > 0) {
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
          }
        }

        // Email send
        if (campaign.channel === 'email' || campaign.channel === 'both') {
          if (recipient.email_status === 'pending' && recipient.email) {
            // CAN-SPAM: never send to an address that unsubscribed from an
            // earlier campaign for this shop. Mark skipped so a retry of
            // this task does not reconsider it.
            if (suppressedEmails.has(recipient.email.toLowerCase())) {
              await supabase.from('campaign_recipients').update({ email_status: 'skipped' }).eq('id', recipient.id)
              return
            }
            // Same manual-list carve-out as the SMS branch above.
            if (recipient.client_id) {
              const { data: client } = await supabase
                .from('clients')
                .select('email_consent')
                .eq('id', recipient.client_id)
                .maybeSingle()

              if (!client?.email_consent) {
                await supabase.from('campaign_recipients').update({ email_status: 'skipped' }).eq('id', recipient.id)
                return
              }
            }

            // Atomic claim, same as the SMS branch.
            const { data: claimedRows } = await supabase
              .from('campaign_recipients')
              .update({ email_status: 'sending' })
              .eq('id', recipient.id)
              .eq('email_status', 'pending')
              .select('id')
            if (!claimedRows || claimedRows.length === 0) return

            // Manual-list recipients have no client row: key their
            // unsubscribe token to the campaign_recipients row id so the
            // opt-out link resolves (never mint { sub: null }).
            const unsubToken = recipient.client_id
              ? generateUnsubscribeToken(recipient.client_id)
              : generateManualUnsubscribeToken(recipient.id)
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

    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (true) {
        if (cancelObserved) break
        const recipient = queue.shift()
        if (!recipient) break
        try {
          await sendToRecipient(recipient)
        } catch (err: unknown) {
          // sendToRecipient handles per-channel errors itself; this is a
          // safety net so one bad recipient cannot kill the pool.
          console.error(`[campaign-send] recipient ${recipient.id} error:`, err instanceof Error ? err.message : String(err))
          totalFailed++
        }
        processedCount++
        if (processedCount % 25 === 0) await refreshCancelFlag()
      }
    })
    await Promise.all(workers)

    // Final write: totals ACCUMULATE across runs (a recurring campaign's
    // counts used to be overwritten by each run, erasing prior totals),
    // status 'sent' is never written over an owner's cancellation, and a
    // failed write throws so the run is visibly failed instead of the
    // campaign silently wedging in 'sending'.
    const { data: freshCampaign } = await supabase
      .from('campaigns')
      .select('status, sent_count, failed_count')
      .eq('id', campaignId)
      .maybeSingle()
    const wasCancelled = freshCampaign?.status === 'cancelled' || cancelObserved
    const { error: finalErr } = await supabase.from('campaigns').update({
      sent_count: (freshCampaign?.sent_count ?? 0) + totalSent,
      failed_count: (freshCampaign?.failed_count ?? 0) + totalFailed,
      ...(wasCancelled ? {} : { status: 'sent' }),
      updated_at: new Date().toISOString(),
    }).eq('id', campaignId)
    if (finalErr) throw new Error(`campaign final update failed: ${finalErr.message}`)

    // Insert campaign_runs row (the scheduler no longer inserts its own;
    // one row per run, with the real counts, labeled by trigger source).
    await supabase.from('campaign_runs').insert({
      campaign_id: campaignId,
      recipients_count: recipients.length,
      sent_count: totalSent,
      failed_count: totalFailed,
      trigger_type: triggerType ?? 'manual',
    })

    console.log(`[campaign-send] campaign ${campaignId}: sent=${totalSent}, failed=${totalFailed}`)
    return { sent: totalSent, failed: totalFailed }
  },
})
