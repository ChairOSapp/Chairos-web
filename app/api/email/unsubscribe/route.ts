import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyUnsubscribeToken, MANUAL_UNSUB_PREFIX } from '@/lib/unsubscribeToken'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')

  if (!token) {
    return new NextResponse(confirmationHtml('Invalid unsubscribe link.'), {
      headers: { 'Content-Type': 'text/html' },
    })
  }

  let subject: string
  try {
    subject = verifyUnsubscribeToken(token)
  } catch {
    return new NextResponse(confirmationHtml('This unsubscribe link has expired or is invalid.'), {
      headers: { 'Content-Type': 'text/html' },
    })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  if (subject.startsWith(MANUAL_UNSUB_PREFIX)) {
    // Manual-list campaign recipient: no client row exists, so the opt-out
    // is keyed to the campaign_recipients row id embedded in the token.
    const recipientId = subject.slice(MANUAL_UNSUB_PREFIX.length)
    if (!UUID_RE.test(recipientId)) {
      return new NextResponse(confirmationHtml('This unsubscribe link has expired or is invalid.'), {
        headers: { 'Content-Type': 'text/html' },
      })
    }
    // Terminal state: the campaignSend job only processes pending rows,
    // and /api/campaigns/send suppresses this address on future sends.
    await supabase
      .from('campaign_recipients')
      .update({ email_status: 'unsubscribed' })
      .eq('id', recipientId)
  } else if (UUID_RE.test(subject)) {
    // Existing client token — backwards compatible with emails already sent.
    await supabase
      .from('clients')
      .update({ email_consent: false, email_consent_at: null })
      .eq('id', subject)
  } else {
    // Legacy manual token (sent before the manual: scheme): the subject is
    // the raw email address. Mark every matching campaign_recipients row
    // unsubscribed so those old links opt out correctly too.
    await supabase
      .from('campaign_recipients')
      .update({ email_status: 'unsubscribed' })
      .eq('email', subject)
  }

  return new NextResponse(confirmationHtml("You've been unsubscribed from email messages."), {
    headers: { 'Content-Type': 'text/html' },
  })
}

function confirmationHtml(message: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: sans-serif; background: #0a0a0a; color: #e5e5e5; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: #171717; border: 1px solid #262626; border-radius: 12px; padding: 40px; max-width: 400px; text-align: center; }
    h1 { color: #4B5320; font-size: 24px; margin-bottom: 16px; }
    p { color: #9ca3af; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <h1>ChairOS</h1>
    <p>${message}</p>
  </div>
</body>
</html>`
}
