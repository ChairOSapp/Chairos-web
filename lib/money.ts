// Safe money math for ChairOS — integer-cents arithmetic via dinero.js v2.
//
// WHY: Float arithmetic ($0.1 + $0.2 = $0.30000000000000004) is fine for
// display but dangerous for money-in-motion (charges, tips, deposits).
// A 1-cent rounding bug on a charge is a trust bug. These helpers keep
// all math in integer cents and only convert to dollars at the boundary.
//
// CONVENTION: Dinero objects are the internal representation. Functions
// that interface with the DB/API accept/return integer cents or Dinero;
// dollar-float inputs are converted via fromDollars() which rounds once,
// explicitly, at the boundary.
import {
  dinero,
  add as dineroAdd,
  subtract as dineroSubtract,
  multiply as dineroMultiply,
  allocate as dineroAllocate,
  toSnapshot,
  type Dinero,
} from 'dinero.js'

export type { Dinero }

// USD as a plain string currency code. dinero.js v2 types it as
// DineroCurrency; we cast once here so callers don't have to.
const USD = 'USD' as unknown as Parameters<typeof dinero>[0]['currency']
const SCALE = 2

/** Create a Dinero from integer cents. The preferred constructor. */
export function toDinero(cents: number): Dinero<number> {
  return dinero({ amount: Math.round(cents), currency: USD, scale: SCALE })
}

/**
 * Convert a dollar float (e.g. 19.99 from user input or DB numeric) to
 * Dinero. Rounds to the nearest cent ONCE, explicitly, at the boundary.
 * Never do float math on the result — use the wrappers below.
 */
export function fromDollars(dollars: number): Dinero<number> {
  if (!Number.isFinite(dollars)) return toDinero(0)
  return toDinero(Math.round(dollars * 100))
}

/** Extract integer cents from a Dinero. */
export function toCents(d: Dinero<number>): number {
  return toSnapshot(d).amount
}

/** Format for UI/receipts: "$1,234.56". Locale-aware. */
export function formatMoney(d: Dinero<number>, locale = 'en-US'): string {
  const { amount } = toSnapshot(d)
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
  }).format(amount / 100)
}

/** Format integer cents directly: formatCents(1999) -> "$19.99". */
export function formatCents(cents: number, locale = 'en-US'): string {
  return formatMoney(toDinero(cents), locale)
}

export function add(a: Dinero<number>, b: Dinero<number>): Dinero<number> {
  return dineroAdd(a, b)
}

export function subtract(a: Dinero<number>, b: Dinero<number>): Dinero<number> {
  return dineroSubtract(a, b)
}

/**
 * Multiply by a float factor (e.g. 0.8 for -20%, 1.25 for +25%).
 * Rounds to the nearest cent — the standard for pricing adjustments.
 */
export function multiply(d: Dinero<number>, factor: number): Dinero<number> {
  return dineroMultiply(d, factor)
}

/**
 * Split a Dinero into parts by ratio (e.g. [70, 30] for 70/30 tip split).
 * allocate() distributes leftover cents fairly — the sum of parts always
 * equals the original, no penny lost.
 */
export function allocate(d: Dinero<number>, ratios: number[]): Dinero<number>[] {
  return dineroAllocate(d, ratios)
}

/**
 * Percentage of an amount: percentOf($100, 20) = $20.00.
 * Used for deposits, discounts, commissions.
 */
export function percentOf(d: Dinero<number>, percent: number): Dinero<number> {
  return multiply(d, percent / 100)
}

/** Clamp at zero — money owed never goes negative. */
export function maxZero(d: Dinero<number>): Dinero<number> {
  return toCents(d) < 0 ? toDinero(0) : d
}
