import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import {
  getManagedShop,
  getShopRole,
  getSeatUsage,
  type ShopMemberRole,
} from '@/lib/shopMembers'
import { syncSeatBilling } from '@/lib/seatBilling'

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

type MemberRow = {
  id: string
  shop_id: string
  user_id: string
  role: string
}

async function requireOwnerMember(
  admin: SupabaseClient,
  userId: string,
  memberId: string
): Promise<
  | { error: NextResponse }
  | { shop: { id: string; owner_id: string | null }; member: MemberRow }
> {
  const shop = await getManagedShop(admin, userId)
  if (!shop) return { error: NextResponse.json({ error: 'No shop found' }, { status: 404 }) }

  const callerRole = await getShopRole(admin, shop.id, userId)
  if (callerRole !== 'owner') {
    return {
      error: NextResponse.json(
        { error: 'Only owners can manage team members' },
        { status: 403 }
      ),
    }
  }

  const { data: member } = await admin
    .from('shop_members')
    .select('id, shop_id, user_id, role')
    .eq('id', memberId)
    .eq('shop_id', shop.id)
    .maybeSingle()
  if (!member) {
    return { error: NextResponse.json({ error: 'Member not found' }, { status: 404 }) }
  }
  return { shop, member }
}

/**
 * PATCH /api/shop/members/[id]  { role }
 * Change a member's role between 'owner' and 'admin'. Owner-only.
 * The primary owner (shops.owner_id) is not a member row and cannot be
 * changed here.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, admin } = await getClients()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const res = await requireOwnerMember(admin, user.id, id)
  if ('error' in res) return res.error
  const { shop, member } = res as { shop: { id: string; owner_id: string | null }; member: MemberRow }

  const body = await req.json().catch(() => ({}))
  const role = body.role as ShopMemberRole
  if (role !== 'owner' && role !== 'admin') {
    return NextResponse.json(
      { error: "Role must be 'owner' or 'admin'" },
      { status: 400 }
    )
  }
  if (member.role === role) {
    return NextResponse.json({ member })
  }

  const { data: updated, error } = await admin
    .from('shop_members')
    .update({ role })
    .eq('id', member.id)
    .select('id, shop_id, user_id, role, invited_by, created_at')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const seats = await getSeatUsage(admin, shop)
  // Role changes don't alter seat counts (owner<->admin are both seats),
  // but sync anyway -- cheap and keeps Stripe honest if counts drifted.
  void syncSeatBilling(admin, shop.id)
  return NextResponse.json({ member: updated, seats })
}

/**
 * DELETE /api/shop/members/[id]
 * Remove an owner/admin seat. Owner-only.
 * Guards: cannot remove the primary owner, cannot remove your own seat
 * (avoids accidental lockout -- transfer primary ownership first).
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, admin } = await getClients()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const res = await requireOwnerMember(admin, user.id, id)
  if ('error' in res) return res.error
  const { shop, member } = res as { shop: { id: string; owner_id: string | null }; member: MemberRow }

  if (member.user_id === shop.owner_id) {
    return NextResponse.json(
      { error: 'The primary owner cannot be removed' },
      { status: 400 }
    )
  }
  if (member.user_id === user.id) {
    return NextResponse.json(
      { error: 'You cannot remove your own seat. Ask another owner to remove it.' },
      { status: 400 }
    )
  }

  const { error } = await admin.from('shop_members').delete().eq('id', member.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Removing a seat can drop the shop back within its included count --
  // sync removes the Stripe item when overage hits zero. Fire-and-forget.
  const seats = await getSeatUsage(admin, shop)
  void syncSeatBilling(admin, shop.id)
  return NextResponse.json({ removed: member.id, seats })
}
