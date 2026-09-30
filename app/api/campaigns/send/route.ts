import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { Resend } from 'resend'
import twilio from 'twilio'
import { buildEmailTemplate } from '@/lib/emailTemplates'
import { generateUnsubscribeToken, generateManualUnsubscribeToken } from '@/lib/unsubscribeToken'
import { requireActiveBilling } from '@/lib/billing'
import { withRetry } from '@/lib/retry'
import { checkRateLimit } from '@/lib/rate-limit'

function appendStop(message: string): string {
  const suffix = ' Reply STOP to unsubscribe.'
  if (message.toLowerCase().includes('reply stop')) return message
  if ((message + suffix).length <= 160) return message + suffix
  // Long messages would silently drop the opt-out notice (TCPA risk), so
  // truncate the body to keep the STOP suffix instead.
  return message.slice(0, 160 - suffix.length).trimEnd() + suffix
}

// Last-10-digits normalization so a typed "+1 (202) 555-0100" matches a
// stored "2025550100". Used to resolve manual-list entries to client rows.
function normalizePhone(p: string | null | undefined): string {
  const digits = String(p ?? '').replace(/\D/g, '')
  return digits.length >= 10 ? digits.slice(-10) : digits
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

  } else if (campaign.audience_type === 'specific_clients') {
    // Client IDs handed over by an insight/opportunity button. Resolve
    // server-side and verify every ID belongs to this shop — never trust
    // the stored list blindly — then consent-filter per channel: anyone
    // opted out or never consented is excluded.
    const ids: string[] = Array.isArray(filters.client_ids)
      ? filters.client_ids.filter((id: any) => typeof id === 'string' && id.length > 0)
      : []
    if (ids.length > 0) {
      const { data } = await admin.from('clients').select('id, full_name, phone, email, sms_consent, email_consent').eq('shop_id', campaign.shop_id).in('id', ids)
      clients = (data ?? []).filter(c => (!needsSms || c.sms_consent) && (!needsEmail || (c.email_consent && c.email)))
    }

  } else if (campaign.audience_type === 'manual_list') {
    // Typed-in contacts are resolved against the shop's client list and
    // consent-filtered per channel. Anything not on the client list (no
    // consent record) or opted out is dropped — a typed-in address is not
    // consent.
    const emails: string[] = (filters.emails ?? []).filter(Boolean).map((e: any) => String(e).trim().toLowerCase())
    const phones: string[] = (filters.phones ?? []).filter(Boolean).map((p: any) => normalizePhone(p)).filter(Boolean)
    if (emails.length > 0 || phones.length > 0) {
      const { data } = await admin.from('clients').select('id, full_name, phone, email, sms_consent, email_consent').eq('shop_id', campaign.shop_id)
      const rows = data ?? []
      const matched = new Map<string, any>()
      for (const e of emails) {
        const hit = rows.find(c => (c.email ?? '').trim().toLowerCase() === e)
        if (hit) matched.set(hit.id, hit)
      }
      for (const p of phones) {
        const hit = rows.find(c => normalizePhone(c.phone) === p)
        if (hit) matched.set(hit.id, hit)
      }
      clients = [...matched.values()].filter(c => (!needsSms || c.sms_consent) && (!needsEmail || (c.email_consent && c.email)))
    }
  } else if (campaign.audience_type === 'has_tag') {
    // Tag audiences are previewable via /api/campaigns/audience but were
    // previously unsendable here (silently reached nobody).
    const tag = (filters.tag ?? '').trim().toLowerCase()
    if (tag) {
      const { data: tagged } = await admin.from('client_tags').select('client_id').eq('shop_id', campaign.shop_id).eq('tag', tag)
      const taggedIds = [...new Set((tagged ?? []).map((t: any) => t.client_id))]
      if (taggedIds.length > 0) {
        const { data } = await admin.from('clients').select('id, full_name, phone, email, sms_consent, email_consent').in('id', taggedIds)
        clients = (data ?? []).filter(c => (!needsSms || c.sms_consent) && (!needsEmail || (c.email_consent && c.email)))
      }
    }
  }

  if (clients.length === 0) {
    // Claimed above; release before the early return so the campaign does
    // not wedge in 'sending'.
    await releaseSendClaim()
    return NextResponse.json({ recipientCount: 0, triggered: false, message: 'No eligible recipients' })
  }

  // Bound the blast: a miscoded audience selector must not silently
  // address an unbounded audience in a single request.
  const MAX_RECIPIENTS = 5000
  if (clients.length > MAX_RECIPIENTS) {
    await releaseSendClaim()
    return NextResponse.json(
      { error: `Audience too large (${clients.length}; max ${MAX_RECIPIENTS}). Narrow the audience and retry.` },
      { status: 400 }
    )
  }

  // Insert recipients (dedupe: a reclaimed retry after a partial send must
  // not create a second row per recipient).
  const { data: existingRecipients } = await admin
    .from('campaign_recipients')
    .select('client_id, email, phone')
    .eq('campaign_id', campaignId)
  const seenRecipients = new Set(
    (existingRecipients ?? []).map(r => `${r.client_id ?? ''}|${r.email ?? ''}|${r.phone ?? ''}`)
  )
  const recipientRows = clients
    .filter((c: any) => !seenRecipients.has(`${c.id ?? ''}|${c.email ?? ''}|${c.phone ?? ''}`))
    .map((c: any) => ({
      campaign_id: campaignId,
      client_id: c.id ?? null,
      phone: c.phone ?? null,
      email: c.email ?? null,
      sms_status: needsSms ? 'pending' : 'skipped',
      email_status: needsEmail ? 'pending' : 'skipped',
    }))
  if (recipientRows.length > 0) await admin.from('campaign_recipients').insert(recipientRows)

  // Status was already claimed as 'sending' atomically above.

  // Send inline
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://chairos.cc'
  const resend = new Resend(process.env.RESEND_API_KEY)
  const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
    ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    : null

  let totalSent = 0
  let totalFailed = 0

  // Fetch recipient rows (including any left by a reclaimed partial send)
  // so we have their generated IDs and per-channel statuses.
  const { data: insertedRows } = await admin
    .from('campaign_recipients')
    .select('id, client_id, email, phone, sms_status, email_status')
    .eq('campaign_id', campaignId)

  // CAN-SPAM: honor opt-outs recorded by earlier campaigns for this shop.
  // Unsubscribes are stored as campaign_recipients rows with
  // email_status='unsubscribed' (see /api/email/unsubscribe); skip those
  // addresses on every future send.
  const suppressedEmails = new Set<string>()
  if (needsEmail) {
    const emails = [...new Set(clients.map(c => c.email).filter(Boolean))]
    if (emails.length > 0) {
      const { data: unsubs } = await admin
        .from('campaign_recipients')
        .select('email, campaigns!inner(shop_id)')
        .eq('campaigns.shop_id', campaign.shop_id)
        .eq('email_status', 'unsubscribed')
        .in('email', emails)
      for (const r of (unsubs ?? []) as unknown as { email: string | null }[]) {
        if (r.email) suppressedEmails.add(r.email)
      }
    }
  }

  for (const client of clients) {
    // Match by client_id (existing clients) or email/phone (manual entries)
    const row = insertedRows?.find(r =>
      (client.id && r.client_id === client.id) ||
      (!client.id && client.email && r.email === client.email) ||
      (!client.id && !client.email && client.phone && r.phone === client.phone)
    )
    const rowId = row?.id
    // Retry-safety: a reclaimed send after a partial blast must not resend
    // channels that already went out.
    const smsAlreadySent = row?.sms_status === 'sent'
    const emailAlreadySent = row?.email_status === 'sent'

    if (!smsAlreadySent && needsSms && client.phone && client.sms_consent && twilioClient) {
      try {
        await withRetry('campaign_sms', () => twilioClient.messages.create({
          body: appendStop(campaign.sms_message ?? ''),
          from: process.env.TWILIO_PHONE_NUMBER!,
          to: client.phone,
        }))
        if (rowId) await admin.from('campaign_recipients').update({ sms_status: 'sent', sent_at: new Date().toISOString() }).eq('id', rowId)
        totalSent++
      } catch (err: any) {
        if (rowId) await admin.from('campaign_recipients').update({ sms_status: 'failed', error: err.message }).eq('id', rowId)
        totalFailed++
      }
    }

    if (!emailAlreadySent && needsEmail && client.email && client.email_consent && !suppressedEmails.has(client.email)) {
      try {
        // Manual-list entries have no client row: key their unsubscribe
        // token to the campaign_recipients row id so the opt-out link
        // actually resolves (see /api/email/unsubscribe).
        const unsubToken = client.id
          ? generateUnsubscribeToken(client.id)
          : rowId
            ? generateManualUnsubscribeToken(rowId)
            : generateUnsubscribeToken(client.email)
        const html = buildEmailTemplate(campaign.email_body ?? '', `${siteUrl}/api/email/unsubscribe?token=${unsubToken}`)
        const { data: sendData, error } = await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL!,
          to: client.email,
          subject: campaign.email_subject ?? '(no subject)',
          html,
        })
        if (error) throw new Error(error.message)
        // Store the Resend message id so the /api/webhooks/resend handler can
        // match open/click events back to this recipient row.
        if (rowId) await admin.from('campaign_recipients').update({ email_status: 'sent', sent_at: new Date().toISOString(), resend_email_id: sendData?.id ?? null }).eq('id', rowId)
        totalSent++
      } catch (err: any) {
        if (rowId) await admin.from('campaign_recipients').update({ email_status: 'failed', error: err.message }).eq('id', rowId)
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
