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
  // Shop-ownership check, not a role check -- a Solo Chair
  // (profiles.role='barber') owns their own shop the same way an owner does.
  const { data: shop } = await admin.from('shops').select('id').eq('owner_id', user.id).maybeSingle()
  if (!shop) return NextResponse.json({ error: 'No shop found' }, { status: 404 })

  const { audienceType, audienceFilters } = await req.json()
  const shopId = shop.id

  const clientSelect = 'id, full_name, phone, email, sms_consent, email_consent'
  let clients: any[] = []

  if (audienceType === 'all_clients') {
    const { data: memberships } = await admin
      .from('client_shop_memberships')
      .select('client_id')
      .eq('shop_id', shopId)
    const memberIds = [...new Set((memberships ?? []).map((m: any) => m.client_id))]
    if (memberIds.length === 0) return NextResponse.json({ clients: [], count: 0 })

    const { data } = await admin.from('clients').select(clientSelect).in('id', memberIds)
    clients = data ?? []

  } else if (audienceType === 'lapsed_clients') {
    const days = audienceFilters?.days ?? 60
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    const cutoffStr = cutoff.toISOString().split('T')[0]

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
    const lapsedIds = Object.entries(lastVisit).filter(([, d]) => d < cutoffStr).map(([id]) => id)
    if (lapsedIds.length === 0) return NextResponse.json({ clients: [], count: 0 })

    const { data } = await admin.from('clients').select(clientSelect).in('id', lapsedIds)
    clients = data ?? []

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

    const { data } = await admin.from('clients').select(clientSelect).in('id', clientIds)
    clients = data ?? []

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

    const { data } = await admin.from('clients').select(clientSelect).in('id', matchingClientIds)
    clients = data ?? []

  } else if (audienceType === 'no_booking_since') {
    const sinceDateStr = audienceFilters?.date ?? new Date().toISOString().split('T')[0]

    const { data: recentAppts } = await admin
      .from('appointments')
      .select('client_id')
      .eq('shop_id', shopId)
      .gte('date', sinceDateStr)
      .in('status', ['done', 'completed'])
      .not('client_id', 'is', null)

    const recentIds = new Set((recentAppts ?? []).map((a: any) => a.client_id))

    const { data: allAppts } = await admin
      .from('appointments')
      .select('client_id')
      .eq('shop_id', shopId)
      .in('status', ['done', 'completed'])
      .not('client_id', 'is', null)

    const allIds = [...new Set((allAppts ?? []).map((a: any) => a.client_id))].filter(id => !recentIds.has(id))
    if (allIds.length === 0) return NextResponse.json({ clients: [], count: 0 })

    const { data } = await admin.from('clients').select(clientSelect).in('id', allIds)
    clients = data ?? []

  } else if (audienceType === 'has_tag') {
    const tag = (audienceFilters?.tag ?? '').trim().toLowerCase()
    if (!tag) return NextResponse.json({ clients: [], count: 0 })

    const { data: tagged } = await admin
      .from('client_tags')
      .select('client_id')
      .eq('shop_id', shopId)
      .eq('tag', tag)

    const taggedIds = [...new Set((tagged ?? []).map((t: any) => t.client_id))]
    if (taggedIds.length === 0) return NextResponse.json({ clients: [], count: 0 })

    const { data } = await admin.from('clients').select(clientSelect).in('id', taggedIds)
    clients = data ?? []

  } else if (audienceType === 'manual_list') {
    const clientIds: string[] = audienceFilters?.clientIds ?? []
    if (clientIds.length === 0) return NextResponse.json({ clients: [], count: 0 })

    // clientIds come from the request body, so scope to clients that are
    // actually members of this shop before returning their PII — otherwise
    // an owner could submit another shop's client IDs and read their data.
    const { data: memberships } = await admin
      .from('client_shop_memberships')
      .select('client_id')
      .eq('shop_id', shopId)
      .in('client_id', clientIds)
    const scopedIds = [...new Set((memberships ?? []).map((m: any) => m.client_id))]
    if (scopedIds.length === 0) return NextResponse.json({ clients: [], count: 0 })

    const { data } = await admin.from('clients').select(clientSelect).in('id', scopedIds)
    clients = data ?? []
  }

  return NextResponse.json({ clients, count: clients.length })
}
