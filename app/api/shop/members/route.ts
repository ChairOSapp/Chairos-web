import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import {
  getManagedShop,
  getShopRole,
  getSeatUsage,
  listShopMembers,
  type ShopMemberRole,
} from '@/lib/shopMembers'

async function getClients() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  return { supabase, admin }
}

/**
 * GET /api/shop/members
 * List everyone holding a seat on the caller's shop: the primary owner
 * plus owner/admin members, with seat usage and the caller's own role.
 * Callers with an owner or admin role on the shop may list.
 */
export async function GET() {
  const { supabase, admin } = await getClients()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const shop = await getManagedShop(admin, user.id)
  if (!shop) return NextResponse.json({ error: 'No shop found' }, { status: 404 })

  const callerRole = await getShopRole(admin, shop.id, user.id)
  if (!callerRole) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [members, seats] = await Promise.all([
    listShopMembers(admin, shop),
    getSeatUsage(admin, shop),
  ])

  return NextResponse.json({
    shop: { id: shop.id, name: shop.name, plan_tier: shop.plan_tier },
    callerRole,
    callerId: user.id,
    members,
    seats,
  })
}

/**
 * POST /api/shop/members  { email, role }
 * Add an owner/admin seat by email. Owner-only.
 *
 * Deliberately stricter than the chair invite flow: the person must already
 * have a ChairOS account (looked up by email), and the seat counts against
 * the plan's included seats. Overages are ALLOWED but flagged as billable
 * in the response -- Stripe per-seat billing is TODO (see lib/shopMembers).
 */
export async function POST(req: NextRequest) {
  const { supabase, admin } = await getClients()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const shop = await getManagedShop(admin, user.id)
  if (!shop) return NextResponse.json({ error: 'No shop found' }, { status: 404 })

  const callerRole = await getShopRole(admin, shop.id, user.id)
  if (callerRole !== 'owner') {
    return NextResponse.json(
      { error: 'Only owners can add team members' },
      { status: 403 }
    )
  }

  const body = await req.json().catch(() => ({}))
  const email = String(body.email || '').trim().toLowerCase()
  const role = body.role as ShopMemberRole
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
  }
  if (role !== 'owner' && role !== 'admin') {
    return NextResponse.json(
      { error: "Role must be 'owner' or 'admin'" },
      { status: 400 }
    )
  }

  // The invitee must already have a ChairOS account -- keeps admin seats
  // deliberate (no casual link-sharing like chair invites).
  const { data: profile } = await admin
    .from('profiles')
    .select('id, email')
    .ilike('email', email)
    .maybeSingle()
  if (!profile) {
    return NextResponse.json(
      { error: 'No ChairOS account found for that email. They need to sign up first.' },
      { status: 404 }
    )
  }
  const inviteeId = profile.id as string

  if (inviteeId === shop.owner_id) {
    return NextResponse.json(
      { error: 'That person is already the primary owner' },
      { status: 400 }
    )
  }

  const { data: existing } = await admin
    .from('shop_members')
    .select('id, role')
    .eq('shop_id', shop.id)
    .eq('user_id', inviteeId)
    .maybeSingle()
  if (existing) {
    return NextResponse.json(
      { error: `They already hold a ${existing.role} seat on this shop` },
      { status: 400 }
    )
  }

  const { data: member, error } = await admin
    .from('shop_members')
    .insert({
      shop_id: shop.id,
      user_id: inviteeId,
      role,
      invited_by: user.id,
    })
    .select('id, shop_id, user_id, role, invited_by, created_at')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // TODO(billing): when Stripe per-seat billing lands, check seats.billable
  // here and update the subscription quantity / metered usage.
  const seats = await getSeatUsage(admin, shop)

  return NextResponse.json({
    member: { ...member, email: profile.email, full_name: null },
    seats,
    seatNotice: seats.billable
      ? `This shop now uses ${seats.used} of ${seats.included} included seats. The extra ${seats.overage} will be billed per seat once billing is enabled.`
      : null,
  })
}
