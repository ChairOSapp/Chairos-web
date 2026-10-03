import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { render } from '@react-email/render'
import { isAdminEmail } from '@/lib/admin'
import { getResend } from '@/lib/resend'
import AdminOutreach from '@/emails/AdminOutreach'
import { sendSMS } from '@/lib/sms'

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function getRequestUser(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// Founder-only outreach from a Mission Control account dossier:
// send one email (Resend) or one text (Twilio) to the account holder.
// Every attempt — success or failure — is logged to admin_outreach_log.
export async function POST(req: NextRequest) {
  const user = await getRequestUser(req)
  const senderEmail = user?.email ?? null
  if (!isAdminEmail(senderEmail)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const { userId, channel, subject, body: message } = body ?? {}

  if (typeof userId !== 'string' || !userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  }
  if (channel !== 'email' && channel !== 'sms') {
    return NextResponse.json({ error: 'channel must be "email" or "sms"' }, { status: 400 })
  }
  const text = typeof message === 'string' ? message.trim() : ''
  if (!text || text.length > 4000) {
    return NextResponse.json({ error: 'Message must be 1–4000 characters' }, { status: 400 })
  }
  if (channel === 'email') {
    if (typeof subject !== 'string' || !subject.trim() || subject.trim().length > 200) {
      return NextResponse.json({ error: 'Subject is required (max 200 characters)' }, { status: 400 })
    }
  }
  if (channel === 'sms' && text.length > 1600) {
    return NextResponse.json({ error: 'Texts are capped at 1600 characters' }, { status: 400 })
  }

  const supabase = getAdminSupabase()
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, full_name, phone, sms_consent')
    .eq('id', userId)
    .maybeSingle()

  if (!profile) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  }

  let destination: string | null = null
  if (channel === 'email') {
    destination = profile.email
  } else {
    // SMS is strictly opt-in: no phone or no consent, no send.
    const p = profile as { phone?: string | null; sms_consent?: boolean }
    if (!p.phone || !p.sms_consent) {
      return NextResponse.json(
        { error: 'No SMS consent on file for this account' },
        { status: 422 }
      )
    }
    destination = p.phone
  }
  if (!destination) {
    return NextResponse.json({ error: 'No destination address on file' }, { status: 422 })
  }

  let success = false
  let providerMessageId: string | null = null
  let sendError: string | null = null

  try {
    if (channel === 'email') {
      const resend = getResend()
      const name = profile.full_name || 'there'
      // The component escapes interpolated values at render time, so the
      // hand-rolled escapeHtml helper is no longer needed.
      const { data, error } = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'ChairOS <support@chairos.cc>',
        to: destination,
        subject: subject.trim(),
        html: await render(AdminOutreach({ name, message: text })),
      })
      if (error) throw new Error(error.message)
      success = true
      providerMessageId = data?.id ?? null
    } else {
      success = await sendSMS(destination, text)
      if (!success) throw new Error('Twilio send failed')
    }
  } catch (err) {
    sendError = err instanceof Error ? err.message : 'Send failed'
  }

  // Log the attempt — best effort, never blocks the response.
  try {
    await supabase.from('admin_outreach_log').insert({
      sender_email: senderEmail!,
      user_id: userId,
      channel,
      subject: channel === 'email' ? subject.trim() : null,
      body_preview: text.slice(0, 300),
      destination,
      success,
      provider_message_id: providerMessageId,
    })
  } catch { /* log table missing or insert failed — don't fail the send */ }

  if (!success) {
    return NextResponse.json({ error: sendError || 'Send failed' }, { status: 502 })
  }
  return NextResponse.json({ ok: true, channel, providerMessageId })
}

// Recent outreach history for one account, newest first.
export async function GET(req: NextRequest) {
  const user = await getRequestUser(req)
  if (!isAdminEmail(user?.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const userId = new URL(req.url).searchParams.get('userId')
  if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 })

  const supabase = getAdminSupabase()
  const { data, error } = await supabase
    .from('admin_outreach_log')
    .select('id, created_at, channel, subject, body_preview, success')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) return NextResponse.json({ log: [] }) // table not migrated yet
  return NextResponse.json({ log: data ?? [] })
}
