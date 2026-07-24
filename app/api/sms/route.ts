import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

// Last 10 digits, so numbers stored in different formats compare equal.
function phoneKey(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '').slice(-10)
}

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

    // Scope the recipient to the caller's own shop(s). The caller may own a shop
    // or be an active barber at one; the destination number must belong to a
    // client or appointment of one of those shops rather than an arbitrary number.
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const [{ data: ownedShops }, { data: barberShops }] = await Promise.all([
      admin.from('shops').select('id').eq('owner_id', user.id),
      admin.from('shop_barbers').select('shop_id').eq('barber_id', user.id).eq('active', true),
    ])
    const shopIds = [
      ...(ownedShops ?? []).map((s: any) => s.id),
      ...(barberShops ?? []).map((s: any) => s.shop_id),
    ].filter(Boolean)

    if (shopIds.length === 0) {
      return NextResponse.json({ error: 'No shop associated with this account' }, { status: 403 })
    }

    // Collect the phone numbers reachable within the caller's shop(s):
    // clients linked via membership, plus appointment contact numbers.
    const allowedPhones = new Set<string>()

    const { data: memberships } = await admin
      .from('client_shop_memberships')
      .select('client_id')
      .in('shop_id', shopIds)
    const memberClientIds = [...new Set((memberships ?? []).map((m: any) => m.client_id).filter(Boolean))]
    if (memberClientIds.length > 0) {
      const { data: memberClients } = await admin
        .from('clients')
        .select('phone')
        .in('id', memberClientIds)
      for (const c of memberClients ?? []) {
        const key = phoneKey(c.phone)
        if (key) allowedPhones.add(key)
      }
    }

    const { data: appts } = await admin
      .from('appointments')
      .select('client_phone')
      .in('shop_id', shopIds)
    for (const a of appts ?? []) {
      const key = phoneKey(a.client_phone)
      if (key) allowedPhones.add(key)
    }

    const destKey = phoneKey(to)
    if (!destKey || !allowedPhones.has(destKey)) {
      return NextResponse.json({ error: 'Recipient is not a client of your shop' }, { status: 403 })
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