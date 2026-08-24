import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { createServerClient } from '@supabase/ssr'
import { createClient as createAdmin } from '@supabase/supabase-js'
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

    const admin = createAdmin(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Resolve which shop(s) this caller may send SMS on behalf of, so this
    // can't be used as an open relay to text arbitrary numbers using the
    // platform's shared Twilio sender.
    const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle()
    let shopIds: string[] = []
    if (profile?.role === 'owner') {
      const { data: shops } = await admin.from('shops').select('id').eq('owner_id', user.id)
      shopIds = (shops ?? []).map((s: any) => s.id)
    } else {
      const { data: sb } = await admin.from('shop_barbers').select('shop_id').eq('barber_id', user.id).eq('active', true)
      shopIds = (sb ?? []).map((s: any) => s.shop_id)
    }
    if (shopIds.length === 0) {
      return NextResponse.json({ error: 'No shop found for this account' }, { status: 403 })
    }

    // clients.phone is stored inconsistently (some E.164, some bare
    // 10-digit), so match against both forms.
    const digits = String(to).replace(/\D/g, '')
    const bare = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
    const e164 = `+1${bare}`

    const { data: client } = await admin
      .from('clients')
      .select('id, sms_consent')
      .in('phone', [bare, e164])
      .maybeSingle()

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }
    if (!client.sms_consent) {
      return NextResponse.json({ error: 'This client has not consented to SMS' }, { status: 403 })
    }

    const { data: membership } = await admin
      .from('client_shop_memberships')
      .select('shop_id')
      .eq('client_id', client.id)
      .in('shop_id', shopIds)
      .maybeSingle()

    if (!membership) {
      return NextResponse.json({ error: 'Client is not associated with your shop' }, { status: 403 })
    }

    const twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_AUTH_TOKEN!
    )

    const phone = e164

    const result = await twilioClient.messages.create({
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
