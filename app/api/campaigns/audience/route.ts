import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'owner') return NextResponse.json({ error: 'Owner only' }, { status: 403 })

  const { data: shop } = await admin.from('shops').select('id').eq('owner_id', user.id).maybeSingle()
  if (!shop) return NextResponse.json({ error: 'No shop found' }, { status: 404 })

  const { audienceType, audienceFilters, channel } = await req.json()
  const shopId = shop.id
  const needsSms = channel === 'sms' || channel === 'both'
  const needsEmail = channel === 'email' || channel === 'both'

  let clients: any[] = []

  if (audienceType === 'all_clients') {
    let q = admin.from('clients').select('id, full_name, phone, email, sms_consent, email_consent').eq('shop_id', shopId)
    const { data } = await q
    clients = (data ?? []).filter(c =>
      (!needsSms || c.sms_consent) &&
      (!needsEmail || (c.email_consent && c.email))
    )

  } else if (audienceType === 'lapsed_clients') {
    const days = audienceFilters?.days ?? 60
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    const cutoffStr = cutoff.toISOString().split('T')[0]

    // Get last appointment date per client for this shop
    const { data: appts } = await admin
      .from('appointments')
      .select('client_id, date')
      .eq('shop_id', shopId)
      .in('status', ['done', 'completed'])
      .not('client_id', 'is', null)

    const lastVisit: Record<string, string> = {}
    for (const a of appts ?? []) {
      if (!lastVisit[a.client_id] || a.date > lastVisit[a.client_id]) {
        lastVisit[a.client_id] = a.date
      }
    }
    const lapsedIds = Object.entries(lastVisit)
      .filter(([, d]) => d < cutoffStr)
      .map(([id]) => id)

    if (lapsedIds.length === 0) return NextResponse.json({ clients: [], count: 0 })

    const { data } = await admin
      .from('clients')
      .select('id, full_name, phone, email, sms_consent, email_consent')
      .in('id', lapsedIds)

    clients = (data ?? []).filter(c =>
      (!needsSms || c.sms_consent) &&
      (!needsEmail || (c.email_consent && c.email))
    )

  } else if (audienceType === 'specific_barber') {
    const { data: appts } = await admin
      .from('appointments')
      .select('client_id')
      .eq('shop_id', shopId)
      .eq('barber_id', audienceFilters?.barber_id)
      .in('status', ['done', 'completed'])
      .not('client_id', 'is', null)

    const clientIds = [...new Set((appts ?? []).map((a: any) => a.client_id))]
    if (clientIds.length === 0) return NextResponse.json({ clients: [], count: 0 })

    const { data } = await admin
      .from('clients')
      .select('id, full_name, phone, email, sms_consent, email_consent')
      .in('id', clientIds)

    clients = (data ?? []).filter(c =>
      (!needsSms || c.sms_consent) &&
      (!needsEmail || (c.email_consent && c.email))
    )

  } else if (audienceType === 'specific_service') {
    const { data: appts } = await admin
      .from('appointments')
      .select('client_id, services(name)')
      .eq('shop_id', shopId)
      .in('status', ['done', 'completed'])
      .not('client_id', 'is', null)

    const matchingClientIds = [...new Set(
      (appts ?? [])
        .filter((a: any) => (a.services as any)?.name?.toLowerCase().includes((audienceFilters?.service ?? '').toLowerCase()))
        .map((a: any) => a.client_id)
    )]

    if (matchingClientIds.length === 0) return NextResponse.json({ clients: [], count: 0 })

    const { data } = await admin
      .from('clients')
      .select('id, full_name, phone, email, sms_consent, email_consent')
      .in('id', matchingClientIds)

    clients = (data ?? []).filter(c =>
      (!needsSms || c.sms_consent) &&
      (!needsEmail || (c.email_consent && c.email))
    )

  } else if (audienceType === 'no_booking_since') {
    const sinceDateStr = audienceFilters?.date ?? new Date().toISOString().split('T')[0]

    const { data: appts } = await admin
      .from('appointments')
      .select('client_id')
      .eq('shop_id', shopId)
      .gte('date', sinceDateStr)
      .in('status', ['done', 'completed'])
      .not('client_id', 'is', null)

    const recentIds = new Set((appts ?? []).map((a: any) => a.client_id))

    const { data: allAppts } = await admin
      .from('appointments')
      .select('client_id')
      .eq('shop_id', shopId)
      .in('status', ['done', 'completed'])
      .not('client_id', 'is', null)

    const allIds = [...new Set((allAppts ?? []).map((a: any) => a.client_id))].filter(id => !recentIds.has(id))
    if (allIds.length === 0) return NextResponse.json({ clients: [], count: 0 })

    const { data } = await admin
      .from('clients')
      .select('id, full_name, phone, email, sms_consent, email_consent')
      .in('id', allIds)

    clients = (data ?? []).filter(c =>
      (!needsSms || c.sms_consent) &&
      (!needsEmail || (c.email_consent && c.email))
    )

  } else if (audienceType === 'manual_list') {
    const clientIds: string[] = audienceFilters?.clientIds ?? []
    if (clientIds.length === 0) return NextResponse.json({ clients: [], count: 0 })

    const { data } = await admin
      .from('clients')
      .select('id, full_name, phone, email, sms_consent, email_consent')
      .in('id', clientIds)

    clients = (data ?? []).filter(c =>
      (!needsSms || c.sms_consent) &&
      (!needsEmail || (c.email_consent && c.email))
    )
  }

  return NextResponse.json({ clients, count: clients.length })
}
