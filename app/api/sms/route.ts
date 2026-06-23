import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cs) { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { to, message } = await req.json()

    if (!to || !message) {
      return NextResponse.json({ error: 'Missing to or message' }, { status: 400 })
    }

    const client = twilio(
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_AUTH_TOKEN!
    )

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