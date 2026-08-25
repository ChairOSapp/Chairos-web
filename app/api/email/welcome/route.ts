import { NextRequest, NextResponse } from 'next/server'
import { getResend } from '@/lib/resend'
import { logger } from '@/lib/logger'

export async function POST(req: NextRequest) {
  const { email, name, role } = await req.json()
  if (!email) return NextResponse.json({ error: 'email is required' }, { status: 400 })

  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    logger.warn('welcome_email_not_configured')
    return NextResponse.json({ ok: true })
  }

  const firstName = (name || '').split(' ')[0] || 'there'
  const nextStep = role === 'owner'
    ? "Next, sign in and we'll walk you through setting up your shop."
    : "Next, sign in and you'll be taken straight to choose your plan."

  try {
    await getResend().emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to: email,
      subject: 'Welcome to ChairOS',
      html: `
        <p>Hi ${firstName},</p>
        <p>Welcome to ChairOS! Your account is set up and your 30-day free trial has started.</p>
        <p>${nextStep}</p>
        <p>Questions? Just reply to this email.</p>
        <p>— The ChairOS team</p>
      `,
    })
    logger.info('welcome_email_sent', { role })
  } catch (err: any) {
    logger.error('welcome_email_failed', { message: err.message })
  }

  return NextResponse.json({ ok: true })
}
