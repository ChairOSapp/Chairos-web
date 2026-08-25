import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getResend } from '@/lib/resend'
import { notifySlack } from '@/lib/slack'
import { logger } from '@/lib/logger'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  const { email } = await req.json()
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
  }

  const admin = getAdmin()
  const { error } = await admin.from('waitlist').insert({ email })

  // 23505 = duplicate email (unique constraint) -- treat as success, not
  // an error, same as the previous client-side insert did.
  if (error && error.code !== '23505') {
    logger.error('waitlist_insert_failed', { message: error.message })
    return NextResponse.json({ error: 'Could not join the waitlist right now' }, { status: 500 })
  }
  const isNew = !error

  if (isNew) {
    if (process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL) {
      getResend().emails.send({
        from: process.env.RESEND_FROM_EMAIL,
        to: 'support@chairos.cc',
        subject: 'New waitlist signup',
        html: `<p>New waitlist signup: <strong>${email}</strong></p>`,
      }).catch(err => logger.error('waitlist_email_failed', { message: err?.message }))
    }
    notifySlack(`📋 New waitlist signup: ${email}`, 'waitlist').catch(() => {})
    logger.info('waitlist_signup', { email })
  }

  return NextResponse.json({ ok: true })
}
