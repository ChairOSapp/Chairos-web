// How an appointment was paid. 'square' = card charged through Square;
// everything else was collected outside Square (cash in hand, Venmo, ...)
// and is recorded at POS checkout so earnings and the 1099 stay complete.
export const PAYMENT_METHODS = [
  { value: 'square', label: 'Card' },
  { value: 'cash', label: 'Cash' },
  { value: 'venmo', label: 'Venmo' },
  { value: 'zelle', label: 'Zelle' },
  { value: 'cashapp', label: 'Cash App' },
  { value: 'other', label: 'Other' },
] as const

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]['value']

export const PAYMENT_METHOD_VALUES = PAYMENT_METHODS.map(m => m.value)

export function isPaymentMethod(v: unknown): v is PaymentMethod {
  return typeof v === 'string' && (PAYMENT_METHOD_VALUES as string[]).includes(v)
}

export function paymentMethodLabel(v: string | null | undefined): string {
  const found = PAYMENT_METHODS.find(m => m.value === v)
  return found ? found.label : 'Card'
}

// Buckets for revenue splits: card vs cash vs everything else off-Square.
// Null (legacy rows from before tracking) means Square — that was the only
// way to get paid before this feature existed.
export function paymentMethodBucket(v: string | null | undefined): 'square' | 'cash' | 'other' {
  if (v === 'cash') return 'cash'
  if (v === 'venmo' || v === 'zelle' || v === 'cashapp' || v === 'other') return 'other'
  return 'square'
}
