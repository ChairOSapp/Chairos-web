// Client-safe notification event catalog (no server imports — safe to
// import from client components). lib/notify.ts builds on this.

export const NOTIFICATION_EVENT_TYPES = [
  { key: 'booking', label: 'New bookings', defaults: ['push', 'in_app'] },
  { key: 'booking_cancelled', label: 'Cancellations', defaults: ['push', 'in_app'] },
  { key: 'payment', label: 'Payments & deposits', defaults: ['push', 'in_app'] },
  { key: 'tip', label: 'Tips', defaults: ['push', 'in_app'] },
  { key: 'billing', label: 'Booth rent & charges', defaults: ['push', 'in_app'] },
  { key: 'walk_in', label: 'Walk-ins', defaults: ['push', 'in_app'] },
  { key: 'referral', label: 'Referral rewards', defaults: ['in_app'] },
  { key: 'brief', label: 'Daily & weekly briefs', defaults: ['in_app'] },
  { key: 'client', label: 'Client alerts', defaults: ['in_app'] },
  { key: 'system', label: 'Everything else', defaults: ['in_app'] },
] as const

export type NotificationEventKey = (typeof NOTIFICATION_EVENT_TYPES)[number]['key']

/** Map a raw notification type onto its preference catalog key. */
export function resolveEventKey(type: string): NotificationEventKey {
  const t = (type || '').toLowerCase()
  if (t === 'booking_cancelled') return 'booking_cancelled'
  if (t.startsWith('booking')) return 'booking'
  if (t.startsWith('tip')) return 'tip'
  if (t.startsWith('payment') || t.startsWith('deposit')) return 'payment'
  if (t.startsWith('billing') || t.startsWith('booth_rent')) return 'billing'
  if (t.startsWith('walk_in')) return 'walk_in'
  if (t.startsWith('referral') || t.startsWith('rebooking')) return 'referral'
  if (t.includes('brief')) return 'brief'
  if (t.startsWith('lapse') || t.startsWith('client') || t.startsWith('sms_')) return 'client'
  return 'system'
}

export function defaultChannels(key: string): string[] {
  return [...(NOTIFICATION_EVENT_TYPES.find(e => e.key === key)?.defaults ?? ['in_app'])]
}
