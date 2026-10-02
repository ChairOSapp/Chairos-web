import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { isAdminEmail } from '@/lib/admin'

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function getRequestUser(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// Founder-only, read-only deep dossier for one account (owner or chair):
// who they are, what they pay for, what their shop/chair actually does.
// Includes the account holder's own contact info so the founder can reach
// out directly (email/SMS). End-client PII (names, phones, emails of their
// customers) never leaves here.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRequestUser(req)
  if (!isAdminEmail(user?.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id: userId } = await params
  const supabase = getAdminSupabase()

  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, plan_type, subscription_status, stripe_customer_id, stripe_subscription_id, trial_end, created_at')
    .eq('id', userId)
    .maybeSingle()
  if (profErr) return NextResponse.json({ error: profErr.message }, { status: 500 })
  if (!profile) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

  // Phone + SMS consent live in a newer migration; fetch separately so the
  // dossier still loads if that migration hasn't been run yet.
  let contact: { phone: string | null; sms_consent: boolean; sms_consent_at: string | null } = {
    phone: null, sms_consent: false, sms_consent_at: null,
  }
  try {
    const { data } = await supabase
      .from('profiles')
      .select('phone, sms_consent, sms_consent_at')
      .eq('id', userId)
      .maybeSingle()
    if (data) contact = {
      phone: (data as any).phone ?? null,
      sms_consent: !!(data as any).sms_consent,
      sms_consent_at: (data as any).sms_consent_at ?? null,
    }
  } catch { /* column not migrated yet — leave contact empty */ }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  // Owned shop (if any) + employed shop (if chair)
  const [{ data: ownedShop }, { data: membership }] = await Promise.all([
    supabase.from('shops').select('id, name, shop_code, vertical, created_at').eq('owner_id', userId).maybeSingle(),
    supabase.from('shop_barbers').select('shop_id, active, created_at').eq('barber_id', userId).eq('active', true).maybeSingle(),
  ])

  let employedShop: any = null
  if (membership?.shop_id) {
    const { data } = await supabase.from('shops').select('id, name, shop_code, vertical').eq('id', membership.shop_id).maybeSingle()
    employedShop = data
  }

  // Chair performance: appointments where they are the barber
  const { data: appts } = await supabase
    .from('appointments')
    .select('id, shop_id, price, status, payment_status, created_at')
    .eq('barber_id', userId)

  const done = (appts ?? []).filter(a => a.status === 'done')
  const revenue = done.reduce((s, a) => s + (Number(a.price) || 0), 0)
  const last30 = (appts ?? []).filter(a => a.created_at >= thirtyDaysAgo)
  const byStatus: Record<string, number> = {}
  for (const a of appts ?? []) byStatus[a.status] = (byStatus[a.status] ?? 0) + 1
  const lastAppt = (appts ?? []).reduce<string | null>(
    (max, a) => (!max || a.created_at > max ? a.created_at : max), null
  )

  // Distinct clients served (count only — no PII)
  const { data: clientLinks } = await supabase
    .from('appointments')
    .select('client_id')
    .eq('barber_id', userId)
    .not('client_id', 'is', null)
  const distinctClients = new Set((clientLinks ?? []).map(r => r.client_id)).size

  // If they own a shop, roll up the whole shop too (viability at a glance)
  let shopRollup: any = null
  if (ownedShop) {
    const { data: shopAppts } = await supabase
      .from('appointments')
      .select('price, status, created_at')
      .eq('shop_id', ownedShop.id)
    const sDone = (shopAppts ?? []).filter(a => a.status === 'done')
    shopRollup = {
      shop_id: ownedShop.id,
      appointments: (shopAppts ?? []).length,
      revenue: Math.round(sDone.reduce((s, a) => s + (Number(a.price) || 0), 0) * 100) / 100,
      last30d: (shopAppts ?? []).filter(a => a.created_at >= thirtyDaysAgo).length,
    }
  }

  return NextResponse.json({
    profile: {
      id: profile.id,
      email: profile.email,
      full_name: profile.full_name,
      role: profile.role,
      plan_type: profile.plan_type,
      subscription_status: profile.subscription_status,
      stripe_customer_id: profile.stripe_customer_id,
      stripe_subscription_id: profile.stripe_subscription_id,
      trial_end: profile.trial_end,
      created_at: profile.created_at,
      phone: contact.phone,
      sms_consent: contact.sms_consent,
      sms_consent_at: contact.sms_consent_at,
    },
    ownedShop: ownedShop ? {
      id: ownedShop.id,
      name: ownedShop.name,
      shop_code: ownedShop.shop_code,
      vertical: ownedShop.vertical,
      created_at: ownedShop.created_at,
      rollup: shopRollup,
    } : null,
    employedShop: employedShop ? {
      id: employedShop.id,
      name: employedShop.name,
      shop_code: employedShop.shop_code,
      vertical: employedShop.vertical,
      since: membership?.created_at ?? null,
    } : null,
    chair: {
      appointments: (appts ?? []).length,
      completed: done.length,
      byStatus,
      revenue: Math.round(revenue * 100) / 100,
      last30d: last30.length,
      distinctClients,
      lastAppointmentAt: lastAppt,
    },
  })
}
