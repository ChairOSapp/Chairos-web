// Shared client-identity resolution for the portal. clients.phone is
// globally unique (DB constraint), so a phone number resolves to at most
// one clients row; every shop relationship comes from
// client_shop_memberships off that one client_id. This is the single
// place that turns "a verified phone number" into "what this client is
// allowed to see" -- every portal route calls this rather than querying
// clients/appointments directly, so the scoping logic can't drift between
// routes.
import { SupabaseClient } from '@supabase/supabase-js'

export interface PortalBarber {
  barberId: string
  name: string
}

export interface PortalShop {
  shopId: string
  shopName: string
  shopCode: string | null
  vertical: string
  referralProgramEnabled: boolean
  referralRewardType: string | null
  referralRewardValue: number | null
  // Per-barber money routing: when true, cards are saved/charged against
  // the barber's Square merchant (like booking does), so the payment tab
  // needs a barber picker and must pass barberId to widget-config and
  // save-card. When false the shop owner's account is used.
  barbersCollectOwn: boolean
  barbers: PortalBarber[]
}

export interface PortalClient {
  clientId: string
  fullName: string | null
  email: string | null
  phone: string
  squareCardBrand: string | null
  squareCardLast4: string | null
  referralCode: string
  shops: PortalShop[]
}

export async function resolvePortalClient(admin: SupabaseClient, phone: string): Promise<PortalClient | null> {
  const { data: client } = await admin
    .from('clients')
    .select('id, full_name, email, phone, square_card_brand, square_card_last4, referral_code')
    .eq('phone', phone)
    .maybeSingle()

  if (!client) return null

  // client_shop_memberships is populated by one specific call in the
  // online booking flow (fire-and-forget, non-fatal on failure per its own
  // comment) -- it under-represents real relationships for anything
  // created another way (walk-ins, manually-entered appointments, etc).
  // Union it with the shops this client actually has appointments at, so
  // "shops you have a relationship with" reflects real history, not just
  // whether that one membership call happened to succeed.
  const [{ data: memberships }, { data: apptShopIds }] = await Promise.all([
    admin.from('client_shop_memberships').select('shops(id, name, shop_code, vertical, barbers_collect_own_payments, referral_program_enabled, referral_reward_type, referral_reward_value)').eq('client_id', client.id),
    admin.from('appointments').select('shop_id').eq('client_id', client.id),
  ])

  const toPortalShop = (s: any): PortalShop => ({
    shopId: s.id,
    shopName: s.name,
    shopCode: s.shop_code,
    vertical: s.vertical,
    referralProgramEnabled: s.referral_program_enabled === true,
    referralRewardType: s.referral_reward_type ?? null,
    referralRewardValue: s.referral_reward_value ?? null,
    barbersCollectOwn: s.barbers_collect_own_payments === true,
    barbers: [],
  })

  const shopIdsFromMemberships: PortalShop[] = (memberships || [])
    .map((m: any) => Array.isArray(m.shops) ? m.shops[0] : m.shops)
    .filter(Boolean)
    .map(toPortalShop)

  const knownShopIds = new Set(shopIdsFromMemberships.map(s => s.shopId))
  const missingShopIds = [...new Set((apptShopIds || []).map(a => a.shop_id))].filter(id => id && !knownShopIds.has(id))

  let shopsFromAppointments: PortalShop[] = []
  if (missingShopIds.length > 0) {
    const { data: extraShops } = await admin.from('shops').select('id, name, shop_code, vertical, barbers_collect_own_payments, referral_program_enabled, referral_reward_type, referral_reward_value').in('id', missingShopIds)
    shopsFromAppointments = (extraShops || []).map(toPortalShop)
  }

  const shops: PortalShop[] = [...shopIdsFromMemberships, ...shopsFromAppointments]

  // For per-barber shops the payment tab needs the barber picker, so load
  // the active roster for those shops only.
  const perBarberShops = shops.filter(s => s.barbersCollectOwn)
  if (perBarberShops.length > 0) {
    const { data: rosters } = await admin
      .from('shop_barbers')
      .select('shop_id, barber_id, barber_name, alias')
      .in('shop_id', perBarberShops.map(s => s.shopId))
      .eq('active', true)
    const byShop = new Map<string, PortalBarber[]>()
    for (const r of rosters || []) {
      const list = byShop.get((r as any).shop_id) || []
      list.push({ barberId: (r as any).barber_id, name: (r as any).barber_name || (r as any).alias || 'Barber' })
      byShop.set((r as any).shop_id, list)
    }
    for (const s of perBarberShops) s.barbers = byShop.get(s.shopId) || []
  }

  return {
    clientId: client.id,
    fullName: client.full_name,
    email: client.email,
    phone: client.phone,
    squareCardBrand: client.square_card_brand,
    squareCardLast4: client.square_card_last4,
    referralCode: client.referral_code,
    shops,
  }
}
