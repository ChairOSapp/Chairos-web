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

function toCSV(rows: Record<string, any>[], headers: string[]): string {
  const escape = (v: any) => {
    let s = v == null ? '' : String(v)
    // Formula injection: a cell starting with =, +, -, @ (or a leading
    // tab/CR) is executed as a formula when the CSV opens in Excel or
    // Sheets. Client names/notes are attacker-controllable, so defang
    // them with a leading apostrophe (the standard spreadsheet escape).
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [headers.map(escape).join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\n')
}

// PostgREST caps a response at 1,000 rows by default — an unpaginated
// export silently truncates a busy shop's data. Page through in chunks
// until a short page comes back.
async function fetchAllPages<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const PAGE = 1000
  const all: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data } = await build(from, from + PAGE - 1)
    const rows = data ?? []
    all.push(...rows)
    if (rows.length < PAGE) return all
  }
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
    // The old query selected first_name/last_name/notes — columns that
    // do not exist on clients — so PostgREST errored and owners got an
    // empty file with a 200. These are the real columns.
    const clients = await fetchAllPages((from, to) => admin
      .from('clients')
      .select('id, shop_id, full_name, phone, email, source, total_visits, last_visit_date, created_at')
      .in('shop_id', shopIds)
      .order('created_at', { ascending: false })
      .range(from, to))

    csv = toCSV((clients || []).map(c => ({
      shop: shopNames[c.shop_id] || '',
      name: c.full_name,
      phone: c.phone,
      email: c.email,
      total_visits: c.total_visits,
      last_visit: c.last_visit_date,
      source: c.source,
      created_at: c.created_at,
    })), ['shop', 'name', 'phone', 'email', 'total_visits', 'last_visit', 'source', 'created_at'])
    filename = `chairos-clients-${new Date().toISOString().slice(0, 10)}.csv`
  } else {
    // Same story here: start_time/end_time/service_name/barber_name are
    // not appointments columns (the real ones are date/time plus FK
    // joins). The old export returned an empty file for every shop.
    const appointments = await fetchAllPages((from, to) => admin
      .from('appointments')
      .select('id, shop_id, date, time, status, client_name, price, created_at, services(name)')
      .in('shop_id', shopIds)
      .order('date', { ascending: false })
      .order('id', { ascending: true })
      .range(from, to))

    csv = toCSV((appointments || []).map(a => ({
      shop: shopNames[a.shop_id] || '',
      date: a.date,
      time: a.time,
      status: a.status,
      client_name: a.client_name,
      service: (a as any).services?.name ?? '',
      price: a.price,
      created_at: a.created_at,
    })), ['shop', 'date', 'time', 'status', 'client_name', 'service', 'price', 'created_at'])
    filename = `chairos-appointments-${new Date().toISOString().slice(0, 10)}.csv`
  }

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
