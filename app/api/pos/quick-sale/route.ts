import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { isPaymentMethod, type PaymentMethod } from '@/lib/paymentMethods'
import { validateSplitEntries, primarySplitMethod, type SplitEntry } from '@/lib/checkoutExtras'

function getAdmin() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Quick sale: a register sale with no appointment — a product sold
// over the counter, a standalone charge. The amount is staff-entered
// (there is no service price to read), the note says what it was for,
// and the sale lands in quick_sales so revenue counts it alongside
// appointment income. Card sales here are RECORDED, not charged: the
// shop runs the card on its own reader/Square app first (the in-app
// card form needs an appointment), then logs it like cash.
export async function POST(req: NextRequest) {
  const admin = getAdmin()
  const cookieStore = await cookies()
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            try { cookieStore.set(name, value, options) } catch { /* read-only context */ }
          })
        },
      } }
  )
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    shopId?: string
    barberId?: string | null
    amount?: number
    tipAmount?: number
    note?: string
    paymentMethod?: string
    split?: unknown
  }
  const { shopId } = body
  if (!shopId) return NextResponse.json({ error: 'shopId required' }, { status: 400 })

  const amount = Math.round((parseFloat(String(body.amount)) || 0) * 100) / 100
  if (!(amount > 0) || amount > 100000) {
    return NextResponse.json({ error: 'Enter an amount above $0.' }, { status: 400 })
  }
  const tipDollars = Math.round(Math.max(0, parseFloat(String(body.tipAmount)) || 0) * 100) / 100
  const total = Math.round((amount + tipDollars) * 100) / 100
  const note = String(body.note ?? '').trim().slice(0, 200) || null

  // A split pays the total (amount + tip) across two methods.
  let split: SplitEntry[] | null = null
  let primaryMethod: PaymentMethod
  if (body.split != null) {
    if (!Array.isArray(body.split)) {
      return NextResponse.json({ error: 'Split payment must be a list of two parts.' }, { status: 400 })
    }
    split = (body.split as { method?: unknown; amount?: unknown }[]).map(e => ({
      method: e.method as PaymentMethod,
      amount: Math.round((parseFloat(String(e.amount)) || 0) * 100) / 100,
    }))
    const splitError = validateSplitEntries(split, total)
    if (splitError) return NextResponse.json({ error: splitError }, { status: 400 })
    primaryMethod = primarySplitMethod(split)
  } else {
    if (!isPaymentMethod(body.paymentMethod)) {
      return NextResponse.json({ error: 'Pick how they paid.' }, { status: 400 })
    }
    primaryMethod = body.paymentMethod
  }

  const { data: shop } = await admin
    .from('shops')
    .select('id, owner_id')
    .eq('id', shopId)
    .maybeSingle()
  if (!shop) return NextResponse.json({ error: 'Shop not found' }, { status: 404 })

  // Authorization: the shop's owner, or an active barber in the shop.
  const isOwner = shop.owner_id === user.id
  let callerBarberRow: { barber_id: string } | null = null
  if (!isOwner) {
    const { data: row } = await admin
      .from('shop_barbers')
      .select('barber_id')
      .eq('shop_id', shopId)
      .eq('barber_id', user.id)
      .eq('active', true)
      .maybeSingle()
    callerBarberRow = row
    if (!row) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Who made the sale (tip attribution): a barber caller sells as
  // themselves; the owner may attribute the sale to any active barber
  // in the shop, or leave it as a house sale.
  let barberId: string | null = null
  if (callerBarberRow) {
    barberId = user.id
  } else if (body.barberId) {
    const { data: row } = await admin
      .from('shop_barbers')
      .select('barber_id')
      .eq('shop_id', shopId)
      .eq('barber_id', body.barberId)
      .eq('active', true)
      .maybeSingle()
    if (!row) return NextResponse.json({ error: 'That barber is not in this shop.' }, { status: 400 })
    barberId = body.barberId
  }

  const { data: sale, error: insertError } = await admin
    .from('quick_sales')
    .insert({
      shop_id: shopId,
      barber_id: barberId,
      amount,
      tip_amount: tipDollars,
      payment_method: primaryMethod,
      payment_split: split,
      note,
      created_by: user.id,
    })
    .select('id')
    .single()
  if (insertError || !sale) {
    return NextResponse.json({ error: 'Could not record the sale — nothing was saved. Try again.' }, { status: 500 })
  }

  // Tips count toward the barber's earnings the same as appointment
  // tips; appointment_id stays null for a quick sale.
  if (tipDollars > 0 && barberId) {
    await admin.from('tips').insert({
      shop_id: shopId,
      barber_id: barberId,
      client_id: null,
      amount: tipDollars,
      appointment_id: null,
    })
  }

  return NextResponse.json({ ok: true, id: sale.id, total, paymentMethod: primaryMethod, split })
}
