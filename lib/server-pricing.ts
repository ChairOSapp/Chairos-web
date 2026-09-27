// Server-side booking integrity helpers.
//
// The browser must never dictate what a booking costs. Every price used
// for an appointment, a Square charge, or a deposit is recomputed here
// from services.price + pricing_rules (+ a server-validated referral
// reward), using the same pure pricing math as the public booking page
// (lib/pricing.ts) so the number the client saw matches the number
// charged. All functions take a service-role Supabase client and are
// meant for API routes only -- never import this module into client
// components.
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  DAY_NAMES,
  findApplicablePricing,
  type PricingRule,
} from './pricing'
import {
  computeAvailableSlots,
  minutesToDisplayTime,
  timeStrToMinutes,
  type BlockedInterval,
  type DayHours,
} from './availability'

// Appointments in these statuses no longer occupy the slot. Mirrors
// app/api/book/availability/route.ts.
const NON_BLOCKING_STATUSES = ['cancelled']

export interface BookingPriceInput {
  serviceId: string
  shopId: string
  barberId?: string | null
  /** referral_rewards.id the client claims; validated server-side. */
  rewardCode?: string | null
  /** referring client id; required when rewardCode is given. */
  clientId?: string | null
  /** YYYY-MM-DD */
  dateStr: string
  /** minutes since midnight for the booking start */
  timeMinutes: number
}

export interface ValidatedReward {
  id: string
  type: 'percent_off' | 'flat_credit'
  value: number
}

export interface BookingPrice {
  /** null when the service has no list price (pay-at-shop flow) */
  finalPrice: number | null
  reward: ValidatedReward | null
}

/** Mirrors the client-side reward math in app/book/[shopCode]/page.tsx. */
export function applyRewardDiscount(price: number, type: string, value: number): number {
  const discounted = type === 'percent_off' ? price * (1 - value / 100) : price - value
  return Math.max(0, Math.round(discounted * 100) / 100)
}

/**
 * Price of a service for a slot, from the service's list price plus every
 * applicable pricing_rule -- no reward applied. Used by payment routes to
 * sanity-check a stored appointment price.
 */
export async function computeServicePrice(
  admin: SupabaseClient,
  input: { serviceId: string; shopId: string; dateStr: string; timeMinutes: number }
): Promise<number | null> {
  const { data: service } = await admin
    .from('services')
    .select('id, price')
    .eq('id', input.serviceId)
    .eq('shop_id', input.shopId)
    .maybeSingle()
  if (!service) throw new Error('Service not found')
  if (service.price == null) return null

  const { data: rules } = await admin
    .from('pricing_rules')
    .select('*')
    .eq('shop_id', input.shopId)
    .eq('active', true)

  return findApplicablePricing((rules || []) as PricingRule[], {
    serviceId: input.serviceId,
    price: Number(service.price),
    dateStr: input.dateStr,
    dayName: DAY_NAMES[new Date(input.dateStr + 'T12:00:00').getDay()],
    timeMinutes: input.timeMinutes,
  }).finalPrice
}

/**
 * Validates a claimed referral reward the same way the rewards ledger
 * requires: it must exist, belong to this client at this shop, and still
 * be 'earned'. Throws on any failure -- callers fail the booking closed
 * rather than applying a discount that was never earned.
 */
export async function validateReward(
  admin: SupabaseClient,
  input: { rewardId: string; shopId: string; clientId: string | null }
): Promise<ValidatedReward> {
  if (!input.clientId) throw new Error('A reward code requires a matching client record')
  const { data: reward } = await admin
    .from('referral_rewards')
    .select('id, reward_type, reward_value, status')
    .eq('id', input.rewardId)
    .eq('shop_id', input.shopId)
    .eq('referring_client_id', input.clientId)
    .maybeSingle()
  if (!reward) throw new Error('Reward not found')
  if (reward.status !== 'earned') throw new Error('Reward is no longer redeemable')
  return { id: reward.id, type: reward.reward_type, value: Number(reward.reward_value) }
}

/**
 * Flips a reward earned -> redeemed, but only if it is still 'earned'.
 * Returns false when another request already redeemed it (the conditional
 * update matched zero rows) -- the caller must not honor the discount.
 */
export async function redeemReward(admin: SupabaseClient, rewardId: string): Promise<boolean> {
  const { data, error } = await admin
    .from('referral_rewards')
    .update({ status: 'redeemed', redeemed_at: new Date().toISOString() })
    .eq('id', rewardId)
    .eq('status', 'earned')
    .select('id')
  if (error) throw error
  return (data?.length ?? 0) > 0
}

/**
 * Best-effort compensation when a booking that already redeemed a reward
 * fails before its appointment row is written -- puts the reward back to
 * 'earned' so the client doesn't lose it.
 */
export async function restoreReward(admin: SupabaseClient, rewardId: string): Promise<void> {
  await admin
    .from('referral_rewards')
    .update({ status: 'earned', redeemed_at: null })
    .eq('id', rewardId)
    .eq('status', 'redeemed')
}

export async function computeBookingPrice(
  admin: SupabaseClient,
  input: BookingPriceInput
): Promise<BookingPrice> {
  const { data: service } = await admin
    .from('services')
    .select('id, price')
    .eq('id', input.serviceId)
    .eq('shop_id', input.shopId)
    .eq('active', true)
    .maybeSingle()
  if (!service) throw new Error('Service not found or not bookable')

  const { data: rules } = await admin
    .from('pricing_rules')
    .select('*')
    .eq('shop_id', input.shopId)
    .eq('active', true)

  const priceAfterRules =
    service.price == null
      ? null
      : findApplicablePricing((rules || []) as PricingRule[], {
          serviceId: input.serviceId,
          price: Number(service.price),
          dateStr: input.dateStr,
          dayName: DAY_NAMES[new Date(input.dateStr + 'T12:00:00').getDay()],
          timeMinutes: input.timeMinutes,
        }).finalPrice

  let reward: ValidatedReward | null = null
  if (input.rewardCode) {
    reward = await validateReward(admin, {
      rewardId: input.rewardCode,
      shopId: input.shopId,
      clientId: input.clientId ?? null,
    })
  }

  const finalPrice =
    priceAfterRules == null
      ? null
      : reward
        ? applyRewardDiscount(priceAfterRules, reward.type, reward.value)
        : priceAfterRules

  return { finalPrice, reward }
}

export interface SlotCheckInput {
  shopId: string
  /** YYYY-MM-DD */
  dateStr: string
  timeMinutes: number
  serviceId: string
  /** null = any barber (union of per-barber availability, like the slot picker) */
  barberId?: string | null
  /** appointment id to ignore (rebook flow) */
  excludeAppointmentId?: string | null
}

/**
 * Re-validates that a slot is still free, in-request, using the exact same
 * buffer-aware conflict logic as GET /api/book/availability. Returns true
 * when the requested start time is currently bookable.
 */
export async function isSlotAvailable(admin: SupabaseClient, input: SlotCheckInput): Promise<boolean> {
  const { data: shop } = await admin.from('shops').select('id, hours').eq('id', input.shopId).maybeSingle()
  if (!shop) return false

  const { data: service } = await admin
    .from('services')
    .select('duration_minutes, buffer_before_minutes, buffer_after_minutes')
    .eq('id', input.serviceId)
    .eq('shop_id', input.shopId)
    .maybeSingle()
  if (!service) return false

  const dayName = DAY_NAMES[new Date(input.dateStr + 'T12:00:00').getDay()]
  const hoursList = Array.isArray(shop.hours)
    ? (shop.hours as unknown as Array<DayHours & { day: string }>)
    : []
  const hoursForDay = hoursList.find(h => h.day === dayName)

  let barberIds: string[]
  if (input.barberId) {
    barberIds = [input.barberId]
  } else {
    const { data: barbers } = await admin
      .from('shop_barbers')
      .select('barber_id')
      .eq('shop_id', input.shopId)
      .eq('active', true)
    barberIds = (barbers || []).map(b => b.barber_id).filter(Boolean)
  }

  const slotParams = {
    dayHours: hoursForDay,
    serviceDurationMin: service.duration_minutes,
    serviceBufferBeforeMin: service.buffer_before_minutes ?? 0,
    serviceBufferAfterMin: service.buffer_after_minutes ?? 0,
  }
  const wanted = minutesToDisplayTime(input.timeMinutes)

  if (barberIds.length === 0) {
    // No staff on record to scope by -- fall back to shop-wide availability
    // (no per-staff conflicts to check against), same as the availability route.
    return computeAvailableSlots({ ...slotParams, existing: [] }).includes(wanted)
  }

  let query = admin
    .from('appointments')
    .select('barber_id, time, status, services(duration_minutes, buffer_before_minutes, buffer_after_minutes)')
    .eq('shop_id', input.shopId)
    .eq('date', input.dateStr)
    .in('barber_id', barberIds)
  if (input.excludeAppointmentId) query = query.neq('id', input.excludeAppointmentId)
  const { data: existingAppts } = await query

  interface SlotAppt {
    barber_id: string | null
    time: string | null
    status: string | null
    services: {
      duration_minutes: number | null
      buffer_before_minutes: number | null
      buffer_after_minutes: number | null
    } | null
  }
  const slotSet = new Set<string>()
  for (const id of barberIds) {
    const blocked: BlockedInterval[] = []
    for (const appt of (existingAppts ?? []) as unknown as SlotAppt[]) {
      if (appt.barber_id !== id || NON_BLOCKING_STATUSES.includes(appt.status ?? '')) continue
      const svc = appt.services
      const startMin = timeStrToMinutes(String(appt.time).slice(0, 5))
      blocked.push({
        startMin,
        endMin: startMin + (svc?.duration_minutes ?? 30),
        bufferBeforeMin: svc?.buffer_before_minutes ?? 0,
        bufferAfterMin: svc?.buffer_after_minutes ?? 0,
      })
    }
    computeAvailableSlots({ ...slotParams, existing: blocked }).forEach(s => slotSet.add(s))
  }
  return slotSet.has(wanted)
}
