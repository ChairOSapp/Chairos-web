// Shared calendar UI helpers: staff colors, status treatments, date/time formatting.
// Used by OwnerCalendar, StaffCalendar, AppointmentPopover.

export const STAFF_COLORS = [
  '#4B5320', // olive (brand)
  '#0369a1', // blue
  '#7c3aed', // violet
  '#b45309', // amber
  '#be123c', // rose
  '#15803d', // green
  '#c2410c', // orange
  '#1d4ed8', // indigo
]

/** '#4B5320' + 0.14 -> 'rgba(75,83,32,0.14)' — safe in every webview. */
export function tint(hex: string, alpha: number): string {
  let h = (hex || '#65655F').replace('#', '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  const r = parseInt(h.slice(0, 2), 16) || 0
  const g = parseInt(h.slice(2, 4), 16) || 0
  const b = parseInt(h.slice(4, 6), 16) || 0
  return `rgba(${r},${g},${b},${alpha})`
}

export interface StatusMeta {
  label: string
  dot: string
  dimmed?: boolean
  strike?: boolean
}

export const STATUS_META: Record<string, StatusMeta> = {
  pending:   { label: 'Needs confirming', dot: '#d97706' },
  confirmed: { label: 'Confirmed',        dot: '#4B5320' },
  done:      { label: 'Done',             dot: '#4B5320', dimmed: true },
  noshow:    { label: 'No-show',          dot: '#dc2626', strike: true },
  cancelled: { label: 'Cancelled',        dot: '#9B9890', strike: true },
}

export function statusMeta(status?: string): StatusMeta {
  return STATUS_META[status || ''] || STATUS_META.pending
}

/** '14:30:00' -> '2:30 PM' */
export function fmtTime12(t?: string): string {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`
}

/** '14:30:00' -> '2:30p' (compact, for month cells) */
export function fmtTimeShort(t?: string): string {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'p' : 'a'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')}${ampm}`
}

/** '2026-09-27' -> 'Sun, Sep 27' */
export function fmtDateLabel(d?: string): string {
  if (!d) return ''
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

/** '2026-09-27' -> 'Sunday, September 27' */
export function fmtDateLong(d?: string): string {
  if (!d) return ''
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

/** Date -> '2026-09-27' (local) */
export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** '14:30:00' -> minutes since midnight */
export function timeToMin(t?: string): number {
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

/** '$45' from number|string price */
export function fmtPrice(p?: number | string): string {
  const n = typeof p === 'string' ? parseFloat(p) : (p || 0)
  return `$${(isNaN(n) ? 0 : n).toFixed(0)}`
}
