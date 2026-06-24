import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { tasks } from '@trigger.dev/sdk'
import { Resend } from 'resend'
import twilio from 'twilio'
import { buildEmailTemplate } from '@/lib/emailTemplates'
import { generateUnsubscribeToken } from '@/lib/unsubscribeToken'

function appendStop(message: string): string {
  const suffix = ' Reply STOP to unsubscribe.'
  if (message.toLowerCase().includes('reply stop')) return message
  if ((message + suffix).length <= 160) return message + suffix
  return message
}

export async function POST(req: NextRequest) {
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
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'owner') return NextResponse.json({ error: 'Owner only' }, { status: 403 })

  const { campaignId } = await req.json()

  const { data: campaign } = await admin
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .maybeSingle()

  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  // Verify owner owns this campaign's shop
  const { data: shop } = await admin.from('shops').select('id').eq('owner_id', user.id).eq('id', campaign.shop_id).maybeSingle()
  if (!shop) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Build audience
  const audienceRes = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/api/campaigns/audience`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieStore.getAll().map(c => `${c.name}=${c.value}`).join('; '),
    },
    body: JSON.stringify({
      audienceType: campaign.audience_type,
      audienceFilters: campaign.audience_filters,
      channel: campaign.channel,
    }),
  })
  const { clients } = await audienceRes.json()

  if (!clients || clients.length === 0) {
    return NextResponse.json({ recipientCount: 0, triggered: false, message: 'No eligible recipients' })
  }

  // Insert campaign_recipients
  const recipientRows = clients.map((c: any) => ({
    campaign_id: campaignId,
    client_id: c.id,
    phone: c.phone ?? null,
    email: c.email ?? null,
    sms_status: campaign.channel === 'email' ? 'skipped' : 'pending',
    email_status: campaign.channel === 'sms' ? 'skipped' : 'pending',
  }))

  await admin.from('campaign_recipients').insert(recipientRows)

  // Try Trigger.dev for durable background processing; fall back to inline send
  let usedTrigger = false
  try {
    await tasks.trigger('campaign-send', { campaignId })
    usedTrigger = true
  } catch (triggerErr: any) {
    console.warn('[campaigns/send] Trigger.dev unavailable, sending inline:', triggerErr.message)
  }

  await admin.from('campaigns').update({ status: 'sending', updated_at: new Date().toISOString() }).eq('id', campaignId)

  if (!usedTrigger) {
    // Inline send fallback
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://chairos.cc'
    const resend = new Resend(process.env.RESEND_API_KEY)
    const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
      ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
      : null

    let totalSent = 0
    let totalFailed = 0

    for (const recipient of recipientRows as any[]) {
      if ((campaign.channel === 'sms' || campaign.channel === 'both') && recipient.sms_status === 'pending' && recipient.phone) {
        const clientRow = clients.find((c: any) => c.id === recipient.client_id)
        if (!clientRow?.sms_consent || !twilioClient) {
          await admin.from('campaign_recipients').update({ sms_status: 'skipped' }).eq('campaign_id', campaignId).eq('client_id', recipient.client_id)
          continue
        }
        try {
          await twilioClient.messages.create({
            body: appendStop(campaign.sms_message ?? ''),
            from: process.env.TWILIO_PHONE_NUMBER!,
            to: recipient.phone,
          })
          await admin.from('campaign_recipients').update({ sms_status: 'sent', sent_at: new Date().toISOString() }).eq('campaign_id', campaignId).eq('client_id', recipient.client_id)
          totalSent++
        } catch (err: any) {
          await admin.from('campaign_recipients').update({ sms_status: 'failed', error: err.message }).eq('campaign_id', campaignId).eq('client_id', recipient.client_id)
          totalFailed++
        }
      }

      if ((campaign.channel === 'email' || campaign.channel === 'both') && recipient.email_status === 'pending' && recipient.email) {
        const clientRow = clients.find((c: any) => c.id === recipient.client_id)
        if (!clientRow?.email_consent) {
          await admin.from('campaign_recipients').update({ email_status: 'skipped' }).eq('campaign_id', campaignId).eq('client_id', recipient.client_id)
          continue
        }
        try {
          const unsubToken = generateUnsubscribeToken(recipient.client_id)
          const unsubUrl = `${siteUrl}/api/email/unsubscribe?token=${unsubToken}`
          const html = buildEmailTemplate(campaign.email_body ?? '', unsubUrl)
          const { error } = await resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL!,
            to: recipient.email,
            subject: campaign.email_subject ?? '',
            html,
          })
          if (error) throw new Error(error.message)
          await admin.from('campaign_recipients').update({ email_status: 'sent', sent_at: new Date().toISOString() }).eq('campaign_id', campaignId).eq('client_id', recipient.client_id)
          totalSent++
        } catch (err: any) {
          await admin.from('campaign_recipients').update({ email_status: 'failed', error: err.message }).eq('campaign_id', campaignId).eq('client_id', recipient.client_id)
          totalFailed++
        }
      }
    }

    await admin.from('campaigns').update({
      sent_count: totalSent,
      failed_count: totalFailed,
      status: 'sent',
      updated_at: new Date().toISOString(),
    }).eq('id', campaignId)

    await admin.from('campaign_runs').insert({
      campaign_id: campaignId,
      recipients_count: clients.length,
      sent_count: totalSent,
      failed_count: totalFailed,
      trigger_type: 'manual',
    })

    console.log(`[campaigns/send] inline send complete: sent=${totalSent}, failed=${totalFailed}`)
  }

  return NextResponse.json({ recipientCount: clients.length, triggered: true })
}
