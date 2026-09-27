// Per-shop Square widget config. The Web Payments SDK's payments(appId,
// locationId) must tokenize against the SAME merchant the server will
// charge — previously the widget always used the platform's global
// location while charges routed per-shop (or silently fell back to the
// platform's own Square account). This endpoint applies the exact routing
// rule the charge paths use and fails closed: no connected Square account
// -> 400 square_not_connected, never platform credentials.
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { resolveShopSquareAccount, squareNotConnectedMessage } from '@/lib/square'
import { readPortalSession } from '@/lib/portalSession'
import { resolvePortalClient } from '@/lib/portalData'

const admin = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getUser() {
  const cookieStore = await cookies()
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cs) { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
      },
    }
  )
  const { data: { user } } = await supabaseAuth.auth.getUser()
  return user
}

function notConnected(who: 'shop owner' | 'barber') {
  return NextResponse.json(
    { code: 'square_not_connected', error: squareNotConnectedMessage(who) },
    { status: 400 }
  )
}

export async function GET(req: NextRequest) {
  const appId = process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID
  if (!appId) {
    return NextResponse.json({ error: 'Square is not configured on this server' }, { status: 500 })
  }

  const params = req.nextUrl.searchParams
  const appointmentId = params.get('appointmentId')
  const shopCode = params.get('shopCode')?.toUpperCase()
  const barberIdParam = params.get('barberId')
  const rent = params.get('rent') === '1'
  const portalShopId = params.get('portalShopId')

  // Resolve the shop + the barber in play, depending on caller.
  let shop: { id: string; owner_id: string | null; barbers_collect_own_payments?: boolean | null } | null = null
  let barberId: string | null = null

  if (appointmentId) {
    // POS checkout (owner logged in) or booking deposit step (public, shop code).
    const { data: appt } = await admin
      .from('appointments')
      .select('id, shop_id, barber_id, shops!inner(id, owner_id, barbers_collect_own_payments, shop_code)')
      .eq('id', appointmentId)
      .maybeSingle()
    if (!appt) return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
    const s: any = (appt as any).shops
    shop = { id: s.id, owner_id: s.owner_id, barbers_collect_own_payments: s.barbers_collect_own_payments }
    barberId = (appt as any).barber_id ?? null

    const user = await getUser()
    if (user) {
      const isOwner = s.owner_id === user.id
      const isBarber = (appt as any).barber_id === user.id
      if (!isOwner && !isBarber) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    } else {
      // Public booking flow: the shop code proves the caller is the booking party.
      if (!shopCode || s.shop_code !== shopCode) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }
  } else if (rent) {
    // Booth-rent card form: the logged-in barber pays rent TO the shop
    // owner, so the widget tokenizes against the owner's location.
    const user = await getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: sb } = await admin
      .from('shop_barbers')
      .select('shop_id, shops!inner(id, owner_id, barbers_collect_own_payments)')
      .eq('barber_id', user.id)
      .eq('active', true)
      .maybeSingle()
    if (!sb) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const s: any = (sb as any).shops
    shop = { id: s.id, owner_id: s.owner_id, barbers_collect_own_payments: false }
    barberId = null // rent always routes to the owner, never the barber
  } else if (shopCode) {
    // Public booking page before an appointment exists.
    const { data: s } = await admin
      .from('shops')
      .select('id, owner_id, barbers_collect_own_payments')
      .eq('shop_code', shopCode)
      .maybeSingle()
    if (!s) return NextResponse.json({ error: 'Shop not found' }, { status: 404 })
    shop = { id: s.id, owner_id: s.owner_id, barbers_collect_own_payments: s.barbers_collect_own_payments }
    barberId = barberIdParam
  } else if (portalShopId) {
    // Customer portal ("my" page): the OTP-verified portal session
    // authorizes, and the shop must be one of the client's own shops —
    // same authorization as /api/portal/save-card.
    //
    // Routing must match booking exactly: per-barber shops tokenize
    // against the barber's Square merchant (the portal passes barberId,
    // chosen in the payment tab), otherwise the owner's. A card tokenized
    // against the wrong merchant can't be saved or charged there, which
    // is why the portal used to fail for shops whose owner never
    // connected Square while their barbers had.
    const session = readPortalSession(req)
    if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
    const portalClient = await resolvePortalClient(admin, session.phone)
    if (!portalClient) return NextResponse.json({ error: 'No client record found' }, { status: 404 })
    if (!portalClient.shops.some((s: any) => s.shopId === portalShopId)) {
      return NextResponse.json({ error: 'You are not a client of this shop' }, { status: 403 })
    }
    const { data: s } = await admin
      .from('shops')
      .select('id, owner_id, barbers_collect_own_payments')
      .eq('id', portalShopId)
      .maybeSingle()
    if (!s) return NextResponse.json({ error: 'Shop not found' }, { status: 404 })
    const collectsOwn = (s as any).barbers_collect_own_payments === true
    let portalBarberId: string | null = null
    const portalBarberParam = params.get('barberId')
    if (portalBarberParam) {
      // The barber must actually work at this shop -- otherwise a client
      // could tokenize a card against an arbitrary barber's merchant.
      const { data: sb } = await admin
        .from('shop_barbers')
        .select('barber_id')
        .eq('shop_id', portalShopId)
        .eq('barber_id', portalBarberParam)
        .eq('active', true)
        .maybeSingle()
      if (!sb) return NextResponse.json({ error: 'Barber not found at this shop' }, { status: 403 })
      portalBarberId = portalBarberParam
    }
    shop = { id: s.id, owner_id: s.owner_id, barbers_collect_own_payments: collectsOwn }
    barberId = portalBarberId
  } else {
    return NextResponse.json({ error: 'appointmentId, shopCode, rent=1, or portalShopId is required' }, { status: 400 })
  }

  const route = await resolveShopSquareAccount(admin, shop!, barberId)
  if (!route) {
    const collectsOwn = Boolean(shop!.barbers_collect_own_payments && barberId)
    return notConnected(collectsOwn ? 'barber' : 'shop owner')
  }

  return NextResponse.json({ appId, locationId: route.locationId })
}
