import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { resolveShopSquareAccount, withFreshSquareClient, isSquareReconnectRequired } from '@/lib/square'

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

async function canManageShop(admin: ReturnType<typeof getAdmin>, userId: string, shopId: string) {
  const [{ data: shop }, { data: staff }] = await Promise.all([
    admin.from('shops').select('id').eq('id', shopId).eq('owner_id', userId).maybeSingle(),
    admin.from('shop_barbers').select('id').eq('shop_id', shopId).eq('barber_id', userId).maybeSingle(),
  ])
  return !!(shop || staff)
}

/**
 * POST /api/square/import-history
 * { shopId, months? } — pulls COMPLETED Square payments for the shop's
 * location over the last N months (default 12), stores them in
 * square_payment_history (idempotent), seeds clients from buyer emails,
 * and logs the run. Used so a new shop has real history from day one.
 */
export async function POST(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const shopId = body.shopId as string | undefined
  const months = Math.min(Math.max(parseInt(body.months) || 12, 1), 24)
  if (!shopId) return NextResponse.json({ error: 'shopId is required' }, { status: 400 })

  const admin = getAdmin()
  if (!(await canManageShop(admin, userId, shopId))) {
    return NextResponse.json({ error: 'Not authorized for this shop' }, { status: 403 })
  }

  const { data: shop } = await admin
    .from('shops')
    .select('id, owner_id, barbers_collect_own_payments, created_at')
    .eq('id', shopId)
    .maybeSingle()
  if (!shop) return NextResponse.json({ error: 'Shop not found' }, { status: 404 })

  const route = await resolveShopSquareAccount(admin, shop as any)
  if (!route) {
    return NextResponse.json(
      { error: 'Square is not connected for this shop. Connect Square in Settings first.' },
      { status: 400 }
    )
  }

  const endTime = new Date()
  const beginTime = new Date()
  beginTime.setMonth(beginTime.getMonth() - months)

  let paymentsSynced = 0
  let revenueCents = 0
  let clientsFound = 0
  let clientsSeeded = 0

  try {
    await withFreshSquareClient(admin, route, async (client) => {
      const page = await client.payments.list({
        locationId: route.locationId,
        beginTime: beginTime.toISOString(),
        endTime: endTime.toISOString(),
        sortOrder: 'ASCENDING',
        limit: 100,
      })

      for await (const payment of page) {
        const p = payment as any
        if (p.status !== 'COMPLETED') continue
        const amountCents = Number(p.amountMoney?.amount ?? 0)
        const paidAt = p.createdAt || null
        const buyerEmail = (p.buyerEmailAddress || '').toLowerCase() || null

        // Idempotent store of the payment itself
        const { error: upErr } = await admin.from('square_payment_history').upsert(
          {
            shop_id: shopId,
            square_payment_id: p.id,
            amount_cents: amountCents,
            currency: p.amountMoney?.currency || 'USD',
            status: p.status,
            paid_at: paidAt,
            buyer_email: buyerEmail,
            buyer_name: null,
            location_id: p.locationId || route.locationId,
          },
          { onConflict: 'shop_id,square_payment_id', ignoreDuplicates: true }
        )
        if (upErr) continue
        paymentsSynced++
        revenueCents += amountCents

        // Seed client from buyer email (best effort — Square often has no name)
        if (buyerEmail) {
          clientsFound++
          const { data: existing } = await admin
            .from('clients')
            .select('id')
            .ilike('email', buyerEmail)
            .limit(1)
            .maybeSingle()
          let clientId = (existing as any)?.id as string | null
          if (!clientId) {
            clientId = crypto.randomUUID()
            const { error: cErr } = await admin.from('clients').insert({
              id: clientId,
              full_name: null,
              phone: null,
              email: buyerEmail,
              source: 'square',
            })
            if (cErr) { clientId = null }
            else clientsSeeded++
          }
          if (clientId) {
            await admin.from('client_shop_memberships').upsert(
              { client_id: clientId, shop_id: shopId },
              { onConflict: 'client_id,shop_id', ignoreDuplicates: true }
            )
          }
        }
      }
    })
  } catch (e: any) {
    if (isSquareReconnectRequired(e)) {
      return NextResponse.json(
        { error: 'Square needs to be reconnected in Settings before history can be imported.' },
        { status: 400 }
      )
    }
    return NextResponse.json({ error: e?.message || 'Square history import failed' }, { status: 500 })
  }

  await admin.from('client_imports').insert({
    shop_id: shopId,
    user_id: userId,
    filename: null,
    source: 'square',
    total_rows: paymentsSynced,
    imported_count: paymentsSynced,
    duplicate_count: 0,
    error_count: 0,
  })

  return NextResponse.json({
    ok: true,
    paymentsSynced,
    revenueCents,
    revenueDollars: (revenueCents / 100).toFixed(2),
    clientsFound,
    clientsSeeded,
    months,
  })
}
