import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
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
  if (!campaignId) return NextResponse.json({ error: 'campaignId required' }, { status: 400 })

  const { data: campaign } = await admin
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .maybeSingle()

  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  const { data: shop } = await admin.from('shops').select('id').eq('owner_id', user.id).eq('id', campaign.shop_id).maybeSingle()
  if (!shop) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Build audience directly (no internal self-fetch)
  const needsSms = campaign.channel === 'sms' || campaign.channel === 'both'
  const needsEmail = campaign.channel === 'email' || campaign.channel === 'both'
  const filters = campaign.audience_filters ?? {}
  let clients: any[] = []

  if (campaign.audience_type === 'all_clients') {
    const { data } = await admin.from('clients').select('id, full_name, phone, email, sms_consent, email_consent').eq('shop_id', campaign.shop_id)
    clients = (data ?? []).filter(c => (!needsSms || c.sms_consent) && (!needsEmail || (c.email_consent && c.email)))

  } else if (campaign.audience_type === 'lapsed_clients') {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - (filters.days ?? 60))
    const cutoffStr = cutoff.toISOString().split('T')[0]
    const { data: appts } = await admin.from('appointments').select('client_id, date').eq('shop_id', campaign.shop_id).in('status', ['done', 'completed']).not('client_id', 'is', null)
    const lastVisit: Record<string, string> = {}
    for (const a of appts ?? []) { if (!lastVisit[a.client_id] || a.date > lastVisit[a.client_id]) lastVisit[a.client_id] = a.date }
    const lapsedIds = Object.entries(lastVisit).filter(([, d]) => d < cutoffStr).map(([id]) => id)
    if (lapsedIds.length > 0) {
      const { data } = await admin.from('clients').select('id, full_name, phone, email, sms_consent, email_consent').in('id', lapsedIds)
      clients = (data ?? []).filter(c => (!needsSms || c.sms_consent) && (!needsEmail || (c.email_consent && c.email)))
    }

  } else if (campaign.audience_type === 'specific_barber') {
    const { data: appts } = await admin.from('appointments').select('client_id').eq('shop_id', campaign.shop_id).eq('barber_id', filters.barber_id).in('status', ['done', 'completed']).not('client_id', 'is', null)
    const ids = [...new Set((appts ?? []).map((a: any) => a.client_id))]
    if (ids.length > 0) {
      const { data } = await admin.from('clients').select('id, full_name, phone, email, sms_consent, email_consent').in('id', ids)
      clients = (data ?? []).filter(c => (!needsSms || c.sms_consent) && (!needsEmail || (c.email_consent && c.email)))
    }

  } else if (campaign.audience_type === 'specific_service') {
    const { data: appts } = await admin.from('appointments').select('client_id, services(name)').eq('shop_id', campaign.shop_id).in('status', ['done', 'completed']).not('client_id', 'is', null)
    const ids = [...new Set((appts ?? []).filter((a: any) => (a.services as any)?.name?.toLowerCase().includes((filters.service ?? '').toLowerCase())).map((a: any) => a.client_id))]
    if (ids.length > 0) {
      const { data } = await admin.from('clients').select('id, full_name, phone, email, sms_consent, email_consent').in('id', ids)
      clients = (data ?? []).filter(c => (!needsSms || c.sms_consent) && (!needsEmail || (c.email_consent && c.email)))
    }

  } else if (campaign.audience_type === 'no_booking_since') {
    const { data: recent } = await admin.from('appointments').select('client_id').eq('shop_id', campaign.shop_id).gte('date', filters.date ?? new Date().toISOString().split('T')[0]).in('status', ['done', 'completed']).not('client_id', 'is', null)
    const recentIds = new Set((recent ?? []).map((a: any) => a.client_id))
    const { data: all } = await admin.from('appointments').select('client_id').eq('shop_id', campaign.shop_id).in('status', ['done', 'completed']).not('client_id', 'is', null)
    const ids = [...new Set((all ?? []).map((a: any) => a.client_id))].filter(id => !recentIds.has(id))
    if (ids.length > 0) {
      const { data } = await admin.from('clients').select('id, full_name, phone, email, sms_consent, email_consent').in('id', ids)
      clients = (data ?? []).filter(c => (!needsSms || c.sms_consent) && (!needsEmail || (c.email_consent && c.email)))
    }

  } else if (campaign.audience_type === 'manual_list') {
    const ids: string[] = filters.clientIds ?? []
    if (ids.length > 0) {
      const { data } = await admin.from('clients').select('id, full_name, phone, email, sms_consent, email_consent').in('id', ids)
      clients = (data ?? []).filter(c => (!needsSms || c.sms_consent) && (!needsEmail || (c.email_consent && c.email)))
    }
  }

  if (clients.length === 0) {
    return NextResponse.json({ recipientCount: 0, triggered: false, message: 'No eligible recipients' })
  }

  // Insert recipients
  const recipientRows = clients.map((c: any) => ({
    campaign_id: campaignId,
    client_id: c.id,
    phone: c.phone ?? null,
    email: c.email ?? null,
    sms_status: needsSms ? 'pending' : 'skipped',
    email_status: needsEmail ? 'pending' : 'skipped',
  }))
  await admin.from('campaign_recipients').insert(recipientRows)

  await admin.from('campaigns').update({ status: 'sending', updated_at: new Date().toISOString() }).eq('id', campaignId)

  // Send inline
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://chairos.cc'
  const resend = new Resend(process.env.RESEND_API_KEY)
  const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
    ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    : null

  let totalSent = 0
  let totalFailed = 0

  for (const client of clients) {
    if (needsSms && client.phone && client.sms_consent && twilioClient) {
      try {
        await twilioClient.messages.create({
          body: appendStop(campaign.sms_message ?? ''),
          from: process.env.TWILIO_PHONE_NUMBER!,
          to: client.phone,
        })
        await admin.from('campaign_recipients').update({ sms_status: 'sent', sent_at: new Date().toISOString() }).eq('campaign_id', campaignId).eq('client_id', client.id)
        totalSent++
      } catch (err: any) {
        await admin.from('campaign_recipients').update({ sms_status: 'failed', error: err.message }).eq('campaign_id', campaignId).eq('client_id', client.id)
        totalFailed++
      }
    }

    if (needsEmail && client.email && client.email_consent) {
      try {
        const unsubToken = generateUnsubscribeToken(client.id)
        const html = buildEmailTemplate(campaign.email_body ?? '', `${siteUrl}/api/email/unsubscribe?token=${unsubToken}`)
        const { error } = await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL!,
          to: client.email,
          subject: campaign.email_subject ?? '(no subject)',
          html,
        })
        if (error) throw new Error(error.message)
        await admin.from('campaign_recipients').update({ email_status: 'sent', sent_at: new Date().toISOString() }).eq('campaign_id', campaignId).eq('client_id', client.id)
        totalSent++
      } catch (err: any) {
        await admin.from('campaign_recipients').update({ email_status: 'failed', error: err.message }).eq('campaign_id', campaignId).eq('client_id', client.id)
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

  console.log(`[campaigns/send] done: sent=${totalSent}, failed=${totalFailed}`)
  return NextResponse.json({ recipientCount: clients.length, triggered: true })
}
