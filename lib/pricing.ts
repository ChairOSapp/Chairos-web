// Evaluates pricing_rules against a chosen booking slot. A rule is a promo
// when it carries a start_date/end_date (active only within that window);
// otherwise it's a permanent/recurring rule gated by days_of_week and
// start_time/end_time. Every active rule whose own conditions match applies
// simultaneously (a promo and a recurring surcharge can both hit the same
// slot) — see findApplicablePricing.
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

export interface AppliedRule {
  rule: PricingRule
  isPromo: boolean
  label: string
  /** This rule's own effect in isolation, purely for display -- e.g. "-20%"
   *  or "$25". With more than one rule applied, dollar amounts aren't summed
   *  from these (order would make that ambiguous); see PricingResult.finalPrice
   *  for the actual combined total. */
  displayValue: string
}

export interface PricingResult {
  originalPrice: number
  finalPrice: number
  appliedRules: AppliedRule[]
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
 * Combines every active rule whose own conditions match this service+date+
 * day+time into one result, instead of picking a single winner. A promo and
 * a recurring surcharge on the same slot both apply (e.g. "Fall Special
 * -20%" plus a "Morning Surge +25%").
 *
 * At most one flat_price rule can set the base (you can't have two
 * different "set prices" both win) -- if several match, the most specific
 * (service-specific over shop-wide) wins, ties break toward whichever
 * swings furthest from list price. Every matching percent_adjustment rule
 * then multiplies on top of that base. Percent multipliers commute
 * (0.8 * 1.25 is the same regardless of order), so the final total is
 * well-defined even though the rules apply "simultaneously" rather than in
 * some arbitrary sequence.
 */
export function findApplicablePricing(
  rules: PricingRule[],
  params: { serviceId: string; price: number; dateStr: string; dayName: string; timeMinutes: number }
): PricingResult {
  const { serviceId, price, dateStr, dayName, timeMinutes } = params
  const candidates = rules.filter(r => r.active && ruleAppliesToService(r, serviceId))

  const promoMatches = candidates.filter(r => isPromoRule(r) && promoActiveOn(r, dateStr))
  const recurringMatches = candidates.filter(r => !isPromoRule(r) && recurringAppliesAt(r, dayName, timeMinutes))
  const applicable = [...promoMatches, ...recurringMatches]

  if (applicable.length === 0) {
    return { originalPrice: price, finalPrice: price, appliedRules: [] }
  }

  const flatRules = applicable.filter(r => r.flat_price != null)
  const percentRules = applicable.filter(r => r.flat_price == null && r.percent_adjustment != null)

  let base = price
  const appliedRules: AppliedRule[] = []

  if (flatRules.length > 0) {
    const bestFlat = [...flatRules].sort((a, b) => {
      const aSpecific = a.service_id ? 1 : 0
      const bSpecific = b.service_id ? 1 : 0
      if (aSpecific !== bSpecific) return bSpecific - aSpecific
      return Math.abs(b.flat_price! - price) - Math.abs(a.flat_price! - price)
    })[0]
    base = Math.round(bestFlat.flat_price! * 100) / 100
    appliedRules.push({ rule: bestFlat, isPromo: isPromoRule(bestFlat), label: ruleLabel(bestFlat), displayValue: `$${base}` })
  }

  for (const r of percentRules) {
    const pct = r.percent_adjustment || 0
    appliedRules.push({ rule: r, isPromo: isPromoRule(r), label: ruleLabel(r), displayValue: `${pct > 0 ? '+' : ''}${pct}%` })
  }

  const combinedMultiplier = percentRules.reduce((acc, r) => acc * (1 + (r.percent_adjustment || 0) / 100), 1)
  const finalPrice = Math.max(0, Math.round(base * combinedMultiplier * 100) / 100)

  return { originalPrice: price, finalPrice, appliedRules }
}
