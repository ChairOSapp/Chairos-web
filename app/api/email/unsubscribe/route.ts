import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyUnsubscribeToken } from '@/lib/unsubscribeToken'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')

  if (!token) {
    return new NextResponse(confirmationHtml('Invalid unsubscribe link.'), {
      headers: { 'Content-Type': 'text/html' },
    })
  }

  let clientId: string
  try {
    clientId = verifyUnsubscribeToken(token)
  } catch {
    return new NextResponse(confirmationHtml('This unsubscribe link has expired or is invalid.'), {
      headers: { 'Content-Type': 'text/html' },
    })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  await supabase
    .from('clients')
    .update({ email_consent: false, email_consent_at: null })
    .eq('id', clientId)

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
