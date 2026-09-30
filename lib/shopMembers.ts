import type { SupabaseClient } from '@supabase/supabase-js'

export type ShopMemberRole = 'owner' | 'admin'

export type ShopMember = {
  id: string
  shop_id: string
  user_id: string
  role: ShopMemberRole
  invited_by: string | null
  created_at: string
  email?: string | null
  full_name?: string | null
}

// ---------------------------------------------------------------------------
// Seat configuration.
// Stripe Price ID for extra admin/owner seats (ChairOS Extra Admin Seat).
// Billing model: ONE invoice, itemized. Extra seats are a subscription item
// on the primary owner's existing subscription (see lib/seatBilling.ts);
// Stripe prorates mid-cycle changes. Seat-change API routes call
// syncSeatBilling() fire-and-forget after every invite/role-change/remove.
// ---------------------------------------------------------------------------
export const SEAT_CONFIG = {
  /** Stripe Price ID for an extra admin/owner seat (monthly, per unit). */
  stripeExtraSeatPriceId: 'price_1ULNttPWMhJ6JfbDRhb4lD2a',
  /** Owner seats included on every plan (the primary shops.owner_id). */
  includedOwnerSeats: 1,
  /** Extra owner/admin seats included on the standard plan. */
  includedExtraSeatsStandard: 0,
  /**
   * Extra owner/admin seats included on the school (campus) plan.
   * 1 primary owner + 4 extra = 5 admins total, part of the package.
   */
  includedExtraSeatsSchool: 4,
} as const

export type SeatUsage = {
  /** Seats included in the plan (primary owner + tier extras). */
  included: number
  /** Seats actually used (primary owner + member rows). */
  used: number
  /** Seats beyond the included count. Billable once Stripe lands. */
  overage: number
  /** True when used > included. */
  billable: boolean
}

export type ManagedShop = {
  id: string
  name: string
  owner_id: string | null
  plan_tier: string | null
}

/** Count owner/admin seats in use vs included for a shop. */
export async function getSeatUsage(
  admin: SupabaseClient,
  shop: { id: string; plan_tier?: string | null }
): Promise<SeatUsage> {
  const { count } = await admin
    .from('shop_members')
    .select('id', { count: 'exact', head: true })
    .eq('shop_id', shop.id)
    .in('role', ['owner', 'admin'])

  const extra =
    shop.plan_tier === 'school'
      ? SEAT_CONFIG.includedExtraSeatsSchool
      : SEAT_CONFIG.includedExtraSeatsStandard
  const included = SEAT_CONFIG.includedOwnerSeats + extra
  // The primary owner (shops.owner_id) always occupies one seat.
  const used = 1 + (count ?? 0)
  const overage = Math.max(0, used - included)
  return { included, used, overage, billable: overage > 0 }
}

/**
 * Effective role of a user on a shop: 'owner' for the primary owner
 * (shops.owner_id) or a member-owner, 'admin' for a member-admin,
 * null otherwise.
 */
export async function getShopRole(
  admin: SupabaseClient,
  shopId: string,
  userId: string
): Promise<'owner' | 'admin' | null> {
  const { data: shop } = await admin
    .from('shops')
    .select('owner_id')
    .eq('id', shopId)
    .maybeSingle()
  if (shop?.owner_id === userId) return 'owner'
  const { data: member } = await admin
    .from('shop_members')
    .select('role')
    .eq('shop_id', shopId)
    .eq('user_id', userId)
    .maybeSingle()
  return (member?.role as 'owner' | 'admin' | undefined) ?? null
}

/**
 * The shop the caller manages: their primary-owned shop first, else the
 * earliest shop where they hold an owner/admin membership. Returns null
 * when the caller manages no shop.
 */
export async function getManagedShop(
  admin: SupabaseClient,
  userId: string
): Promise<ManagedShop | null> {
  const { data: owned } = await admin
    .from('shops')
    .select('id, name, owner_id, plan_tier')
    .eq('owner_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
  if (owned?.[0]) return owned[0] as ManagedShop

  const { data: membership } = await admin
    .from('shop_members')
    .select('shop_id')
    .eq('user_id', userId)
    .in('role', ['owner', 'admin'])
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!membership) return null

  const { data: shop } = await admin
    .from('shops')
    .select('id, name, owner_id, plan_tier')
    .eq('id', membership.shop_id)
    .maybeSingle()
  return (shop as ManagedShop) ?? null
}

/**
 * List every seat-holder on a shop: the primary owner first, then member
 * rows joined to profiles for display (email / name).
 */
export async function listShopMembers(
  admin: SupabaseClient,
  shop: ManagedShop
): Promise<ShopMember[]> {
  const members: ShopMember[] = []

  if (shop.owner_id) {
    const { data: prof } = await admin
      .from('profiles')
      .select('email, full_name')
      .eq('id', shop.owner_id)
      .maybeSingle()
    members.push({
      id: `primary-${shop.owner_id}`,
      shop_id: shop.id,
      user_id: shop.owner_id,
      role: 'owner',
      invited_by: null,
      created_at: '',
      email: prof?.email ?? null,
      full_name: prof?.full_name ?? null,
    })
  }

  const { data: rows } = await admin
    .from('shop_members')
    .select('id, shop_id, user_id, role, invited_by, created_at')
    .eq('shop_id', shop.id)
    .order('created_at', { ascending: true })

  for (const row of rows ?? []) {
    const { data: prof } = await admin
      .from('profiles')
      .select('email, full_name')
      .eq('id', row.user_id)
      .maybeSingle()
    members.push({
      ...(row as Omit<ShopMember, 'email' | 'full_name'>),
      email: prof?.email ?? null,
      full_name: prof?.full_name ?? null,
    })
  }

  return members
}
