import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
)

export async function POST(req: NextRequest) {
  try {
    const { to, message } = await req.json()

    if (!to || !message) {
      return NextResponse.json({ error: 'Missing to or message' }, { status: 400 })
    }

    // Clean phone number — strip everything except digits and leading +
    const cleaned = to.replace(/[^\d+]/g, '')
    const phone = cleaned.startsWith('+') ? cleaned : `+1${cleaned}`

    const result = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER!,
      to: phone
    })

    return NextResponse.json({ success: true, sid: result.sid })
  } catch (err: any) {
    console.error('SMS error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}