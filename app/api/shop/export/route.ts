import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function getUserId() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

function toCSV(rows: Record<string, any>[]): string {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const escape = (v: any) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [headers.map(escape).join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\n')
}

// GET /api/shop/export?type=clients|appointments
// Shop owner only. Returns CSV download of their shop's data.
export async function GET(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type')
  if (!['clients', 'appointments'].includes(type || '')) {
    return NextResponse.json({ error: 'type must be clients or appointments' }, { status: 400 })
  }

  const admin = getAdmin()

  // Find shops owned by this user
  const { data: shops } = await admin
    .from('shops')
    .select('id, name')
    .eq('owner_id', userId)
  if (!shops?.length) return NextResponse.json({ error: 'No shops found' }, { status: 404 })

  const shopIds = shops.map(s => s.id)
  const shopNames = Object.fromEntries(shops.map(s => [s.id, s.name]))

  let csv: string
  let filename: string

  if (type === 'clients') {
    const { data: clients } = await admin
      .from('clients')
      .select('id, first_name, last_name, phone, email, notes, created_at')
      .in('shop_id', shopIds)
      .order('created_at', { ascending: false })

    csv = toCSV((clients || []).map(c => ({
      shop: shopNames[(c as any).shop_id] || '',
      first_name: c.first_name,
      last_name: c.last_name,
      phone: c.phone,
      email: c.email,
      notes: c.notes,
      created_at: c.created_at,
    })))
    filename = `chairos-clients-${new Date().toISOString().slice(0, 10)}.csv`
  } else {
    const { data: appointments } = await admin
      .from('appointments')
      .select('id, shop_id, date, start_time, end_time, status, client_name, service_name, price, barber_name, created_at')
      .in('shop_id', shopIds)
      .order('date', { ascending: false })
      .limit(10000)

    csv = toCSV((appointments || []).map(a => ({
      shop: shopNames[a.shop_id] || '',
      date: a.date,
      start_time: a.start_time,
      end_time: a.end_time,
      status: a.status,
      client_name: a.client_name,
      service: (a as any).service_name,
      price: a.price,
      barber: (a as any).barber_name,
      created_at: a.created_at,
    })))
    filename = `chairos-appointments-${new Date().toISOString().slice(0, 10)}.csv`
  }

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
