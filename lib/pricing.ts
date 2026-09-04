// Evaluates pricing_rules against a chosen booking slot. A rule is a promo
// when it carries a start_date/end_date (active only within that window);
// otherwise it's a permanent/recurring rule gated by days_of_week and
// start_time/end_time. Promos take precedence over recurring rules for the
// same slot rather than stacking — see findApplicablePricingRule.
import { timeStrToMinutes } from './availability'

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export interface PricingRule {
  id: string
  shop_id: string
  service_id: string | null
  name: string
  promo_name: string | null
  days_of_week: string[] | null
  start_time: string | null // "HH:MM:SS" or "HH:MM"
  end_time: string | null
  start_date: string | null // "YYYY-MM-DD"
  end_date: string | null
  flat_price: number | null
  percent_adjustment: number | null
  active: boolean
}

export interface AppliedPricing {
  rule: PricingRule
  isPromo: boolean
  originalPrice: number
  finalPrice: number
  label: string
}

export function isPromoRule(rule: Pick<PricingRule, 'start_date' | 'end_date'>): boolean {
  return rule.start_date != null && rule.end_date != null
}

function ruleAppliesToService(rule: Pick<PricingRule, 'service_id'>, serviceId: string): boolean {
  return rule.service_id == null || rule.service_id === serviceId
}

/** dateStr is "YYYY-MM-DD"; compared lexically, which is safe for that format. */
export function promoActiveOn(rule: Pick<PricingRule, 'start_date' | 'end_date'>, dateStr: string): boolean {
  if (!rule.start_date || !rule.end_date) return false
  return dateStr >= rule.start_date && dateStr <= rule.end_date
}

export function promoStatus(rule: Pick<PricingRule, 'start_date' | 'end_date'>, todayStr: string): 'active' | 'upcoming' | 'expired' | null {
  if (!rule.start_date || !rule.end_date) return null
  if (todayStr < rule.start_date) return 'upcoming'
  if (todayStr > rule.end_date) return 'expired'
  return 'active'
}

export function recurringAppliesAt(
  rule: Pick<PricingRule, 'days_of_week' | 'start_time' | 'end_time'>,
  dayName: string,
  timeMinutes: number
): boolean {
  if (rule.days_of_week && rule.days_of_week.length > 0 && !rule.days_of_week.includes(dayName)) return false
  if (rule.start_time && timeMinutes < timeStrToMinutes(rule.start_time.slice(0, 5))) return false
  if (rule.end_time && timeMinutes >= timeStrToMinutes(rule.end_time.slice(0, 5))) return false
  return true
}

export function applyAdjustment(price: number, rule: Pick<PricingRule, 'flat_price' | 'percent_adjustment'>): number {
  if (rule.flat_price != null) return Math.round(rule.flat_price * 100) / 100
  return Math.round(price * (1 + (rule.percent_adjustment || 0) / 100) * 100) / 100
}

export function ruleLabel(rule: Pick<PricingRule, 'name' | 'promo_name'>): string {
  return rule.promo_name || rule.name
}

/**
 * Picks the single rule that applies to a service at a given date/day/time,
 * so adjustments never silently stack. Promo rules (date-range) win over
 * recurring (day/time) rules outright; within the same kind, a
 * service-specific rule wins over a shop-wide one, and ties break toward
 * the larger price swing.
 */
export function findApplicablePricingRule(
  rules: PricingRule[],
  params: { serviceId: string; price: number; dateStr: string; dayName: string; timeMinutes: number }
): AppliedPricing | null {
  const { serviceId, price, dateStr, dayName, timeMinutes } = params
  const candidates = rules.filter(r => r.active && ruleAppliesToService(r, serviceId))

  const promoMatches = candidates.filter(r => isPromoRule(r) && promoActiveOn(r, dateStr))
  const pool = promoMatches.length > 0
    ? promoMatches
    : candidates.filter(r => !isPromoRule(r) && recurringAppliesAt(r, dayName, timeMinutes))

  if (pool.length === 0) return null

  const best = pool
    .map(rule => ({ rule, finalPrice: applyAdjustment(price, rule) }))
    .sort((a, b) => {
      const aSpecific = a.rule.service_id ? 1 : 0
      const bSpecific = b.rule.service_id ? 1 : 0
      if (aSpecific !== bSpecific) return bSpecific - aSpecific
      return Math.abs(b.finalPrice - price) - Math.abs(a.finalPrice - price)
    })[0]

  return {
    rule: best.rule,
    isPromo: promoMatches.length > 0,
    originalPrice: price,
    finalPrice: best.finalPrice,
    label: ruleLabel(best.rule),
  }
}
