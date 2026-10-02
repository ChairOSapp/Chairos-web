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

// Digital-wallet QR checkout. Owners/chairs link their Venmo, Cash App,
// or Zelle handles in Settings; at POS checkout the client scans a QR
// code that opens the right app with the amount pre-filled.
//
// Returns the URL to encode in the QR code, or null when the method has
// no universal payment link (Zelle) or the handle is blank.
export function walletPayLink(
  method: 'venmo' | 'zelle' | 'cashapp',
  handle: string | null | undefined,
  amount: number,
): string | null {
  const h = (handle || '').trim()
  if (!h) return null
  const amt = amount.toFixed(2)
  if (method === 'venmo') {
    // venmo.com links work with or without the @
    const user = h.replace(/^@/, '')
    return `https://venmo.com/${encodeURIComponent(user)}?txn=pay&amount=${amt}&note=${encodeURIComponent('ChairOS appointment')}`
  }
  if (method === 'cashapp') {
    // Cash App tags start with $ — strip it, the link adds it back
    const tag = h.replace(/^\$/, '')
    return `https://cash.app/$${encodeURIComponent(tag)}/${amt}`
  }
  // Zelle has no universal deep link. The UI shows the handle large with
  // a copy button instead of a QR code.
  return null
}

// Which column on the shops / shop_barbers row holds this method's handle.
export function payoutHandleColumn(method: 'venmo' | 'zelle' | 'cashapp'): string {
  if (method === 'venmo') return 'venmo_handle'
  if (method === 'cashapp') return 'cashapp_handle'
  return 'zelle_handle'
}
