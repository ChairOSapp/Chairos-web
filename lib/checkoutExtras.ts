import { isPaymentMethod, type PaymentMethod } from '@/lib/paymentMethods'

// Checkout add-ons and split payments, shared by the POS routes
// (/api/pos/mark-paid, /api/square/checkout, /api/pos/quick-sale).
//
// An add-on is a staff-entered line item on top of the service price:
// a product the client bought, an extra charge for extra work. Each
// carries its own label so the sale is never a mystery line in the
// books later ("$18 — Pomade"). Add-ons are stored on the appointment
// (appointments.addons jsonb) and folded into amount_paid, so revenue
// totals stay right while the itemization survives.
//
// A split is the full amount due paid across exactly two methods
// ("$40 on the card, the rest cash"). Stored as appointments /
// quick_sales .payment_split jsonb; the row's payment_method keeps
// the larger entry as the primary for method reporting.

export interface CheckoutAddon {
  label: string
  amount: number // dollars, cent-exact
}

export interface SplitEntry {
  method: PaymentMethod
  amount: number // dollars, cent-exact
}

const MAX_ADDONS = 10
const MAX_ADDON_AMOUNT = 100000

export function parseAddons(
  input: unknown
): { addons: CheckoutAddon[]; total: number } | { error: string } {
  if (input == null) return { addons: [], total: 0 }
  if (!Array.isArray(input)) return { error: 'Add-ons must be a list of items.' }
  if (input.length > MAX_ADDONS) {
    return { error: `Too many add-on items (max ${MAX_ADDONS}).` }
  }
  const addons: CheckoutAddon[] = []
  let cents = 0
  for (const raw of input) {
    const r = (raw ?? {}) as { label?: unknown; amount?: unknown }
    const amount = Math.round((parseFloat(String(r.amount)) || 0) * 100) / 100
    if (!(amount > 0) || amount > MAX_ADDON_AMOUNT) {
      return { error: 'Each add-on item needs an amount above $0.' }
    }
    const label = String(r.label ?? '').trim().slice(0, 80) || 'Item'
    addons.push({ label, amount })
    cents += Math.round(amount * 100)
  }
  return { addons, total: cents / 100 }
}

export function addonsTotalOf(addons: unknown): number {
  if (!Array.isArray(addons)) return 0
  let cents = 0
  for (const a of addons) {
    const amt = parseFloat(String((a as { amount?: unknown })?.amount)) || 0
    cents += Math.round(amt * 100)
  }
  return cents / 100
}

// Validates a proposed split against the full amount due. Entries are
// built by the caller (a route may compose them from a card portion +
// remainder) so this one check guards every path. Returns an error
// string, or null when the split is exact.
export function validateSplitEntries(
  entries: SplitEntry[],
  totalDue: number
): string | null {
  if (entries.length !== 2) return 'A split payment uses exactly two methods.'
  const [a, b] = entries
  if (!isPaymentMethod(a?.method) || !isPaymentMethod(b?.method)) {
    return 'Both split methods must be valid payment methods.'
  }
  if (a.method === b.method) return 'Pick two different methods for a split payment.'
  const aCents = Math.round((a.amount || 0) * 100)
  const bCents = Math.round((b.amount || 0) * 100)
  if (aCents <= 0 || bCents <= 0) return 'Each part of a split payment must be above $0.'
  if (aCents + bCents !== Math.round(totalDue * 100)) {
    return 'The two parts of the split must add up to the total due.'
  }
  return null
}

// The method that took the larger share — recorded as the row's
// primary payment_method so method-level reporting stays sensible.
export function primarySplitMethod(entries: SplitEntry[]): PaymentMethod {
  return entries[0].amount >= entries[1].amount ? entries[0].method : entries[1].method
}
