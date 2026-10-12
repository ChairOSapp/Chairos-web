import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Resend signs webhooks the same way Svix does: HMAC-SHA256 over
// "{svix-id}.{svix-timestamp}.{raw body}", keyed by the base64 payload after
// the "whsec_" prefix on the signing secret. The header can carry multiple
// "v1,<sig>" entries (for secret rotation) -- any match is valid.
function isValidSignature(rawBody: string, svixId: string, svixTimestamp: string, svixSignature: string, secret: string): boolean {
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`
  const expected = crypto.createHmac('sha256', secretBytes).update(signedContent).digest('base64')

  return svixSignature.split(' ').some(part => {
    const [, sig] = part.split(',')
    if (!sig) return false
    try {
      return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
    } catch {
      return false
    }
  })
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const secret = process.env.RESEND_WEBHOOK_SECRET

  // Fail closed once a secret is configured; when unset, acknowledge
  // without processing rather than acting on unverified events (L-A4).
  if (secret) {
    const svixId = req.headers.get('svix-id') || ''
    const svixTimestamp = req.headers.get('svix-timestamp') || ''
    const svixSignature = req.headers.get('svix-signature') || ''
    if (!svixId || !svixTimestamp || !svixSignature || !isValidSignature(rawBody, svixId, svixTimestamp, svixSignature, secret)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
    // Replay protection: a captured, validly-signed webhook must not be
    // re-playable forever. Svix timestamps are seconds since epoch;
    // allow the standard 5-minute tolerance window.
    const tsSeconds = Number(svixTimestamp)
    if (!Number.isFinite(tsSeconds) || Math.abs(Date.now() / 1000 - tsSeconds) > 300) {
      return NextResponse.json({ error: 'Stale webhook' }, { status: 401 })
    }
  } else {
    console.warn('[webhooks/resend] RESEND_WEBHOOK_SECRET not configured — skipping unverified event')
    return NextResponse.json({ received: true, verified: false })
  }

  let payload: any
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const emailId: string | undefined = payload?.data?.email_id
  if (!emailId) return NextResponse.json({ received: true })

  const admin = getAdmin()

  if (payload.type === 'email.opened') {
    const { data: recipient } = await admin.from('campaign_recipients').select('id, open_count, opened_at').eq('resend_email_id', emailId).maybeSingle()
    if (recipient) {
      await admin.from('campaign_recipients').update({
        opened_at: recipient.opened_at ?? new Date().toISOString(),
        open_count: (recipient.open_count ?? 0) + 1,
      }).eq('id', recipient.id)
    }
  } else if (payload.type === 'email.clicked') {
    const { data: recipient } = await admin.from('campaign_recipients').select('id, click_count, clicked_at').eq('resend_email_id', emailId).maybeSingle()
    if (recipient) {
      await admin.from('campaign_recipients').update({
        clicked_at: recipient.clicked_at ?? new Date().toISOString(),
        click_count: (recipient.click_count ?? 0) + 1,
      }).eq('id', recipient.id)
    }
  } else if (payload.type === 'email.bounced' || payload.type === 'email.complained') {
    // Deliverability suppression. These events used to be dropped, so a
    // hard-bounced address kept receiving every future campaign.
    // A spam complaint always suppresses; a bounce suppresses only when
    // permanent (a transient bounce can recover). Suppression = turning
    // off the client's email consent, which every audience build already
    // honors. The event is logged either way.
    const bounceType: string | undefined = payload?.data?.bounce?.type
    const isComplaint = payload.type === 'email.complained'
    const suppress = isComplaint || bounceType !== 'Transient'
    const { data: recipient } = await admin
      .from('campaign_recipients')
      .select('id, client_id, email')
      .eq('resend_email_id', emailId)
      .maybeSingle()
    let suppressed = false
    if (suppress && recipient?.client_id) {
      const { error } = await admin
        .from('clients')
        .update({ email_consent: false, email_consent_at: null })
        .eq('id', recipient.client_id)
      suppressed = !error
    }
    await admin.from('automation_logs').insert({
      type: 'email_suppression',
      payload: {
        event: payload.type,
        emailId,
        recipientId: recipient?.id ?? null,
        clientId: recipient?.client_id ?? null,
        email: recipient?.email ?? payload?.data?.to ?? null,
        bounceType: bounceType ?? null,
      },
      result: suppressed ? 'suppressed' : suppress ? 'suppression_failed_or_no_client' : 'transient_bounce_logged',
    })
  }

  return NextResponse.json({ received: true })
}
