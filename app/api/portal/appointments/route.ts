import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { readPortalSession } from '@/lib/portalSession'
import { resolvePortalClient } from '@/lib/portalData'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(req: NextRequest) {
  const session = readPortalSession(req)
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const admin = getAdmin()
  const portalClient = await resolvePortalClient(admin, session.phone)
  if (!portalClient) return NextResponse.json({ upcoming: [], past: [] })

  const { data: appts } = await admin
    .from('appointments')
    .select('id, shop_id, barber_id, service_id, date, time, price, status, notes, shops(name, shop_code), services(name, duration_minutes)')
    .eq('client_id', portalClient.clientId)
    .order('date', { ascending: false })
    .order('time', { ascending: false })

  const barberIds = [...new Set((appts || []).map(a => a.barber_id).filter(Boolean))]
  const { data: barbers } = barberIds.length > 0
    ? await admin.from('shop_barbers').select('barber_id, shop_id, barber_name, alias').in('barber_id', barberIds)
    : { data: [] as any[] }
  const barberName = (barberId: string | null, shopId: string) => {
    const b = (barbers || []).find(x => x.barber_id === barberId && x.shop_id === shopId)
    return b?.barber_name || b?.alias || null
  }

  const today = new Date().toISOString().split('T')[0]
  const NON_TERMINAL = ['pending', 'confirmed']

  const shaped = (appts || []).map((a: any) => ({
    id: a.id,
    shopId: a.shop_id,
    shopName: a.shops?.name || '',
    shopCode: a.shops?.shop_code || '',
    barberId: a.barber_id,
    barberName: barberName(a.barber_id, a.shop_id),
    serviceId: a.service_id,
    serviceName: a.services?.name || 'Service',
    durationMinutes: a.services?.duration_minutes ?? null,
    date: a.date,
    time: a.time,
    price: a.price,
    status: a.status,
    notes: a.notes,
  }))

  const upcoming = shaped.filter(a => a.date >= today && NON_TERMINAL.includes(a.status))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
  const past = shaped.filter(a => !(a.date >= today && NON_TERMINAL.includes(a.status)))

  return NextResponse.json({ upcoming, past, shops: portalClient.shops })
}
