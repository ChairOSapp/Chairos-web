'use client'
import { useRouter } from 'next/navigation'
import { useNotifications } from '@/src/context/NotificationsContext'

function getDotColor(type: string) {
  if (type === 'booking' || type === 'booking_cancelled') return 'bg-od-green'
  if (type === 'tip') return 'bg-green-500'
  if (type === 'floor') return 'bg-blue-500'
  if (type === 'client' || type === 'lapse_alert') return 'bg-red-400'
  if (type === 'payment' || type === 'billing') return 'bg-amber-500'
  return 'bg-warm-500'
}

function isToday(iso: string) {
  return new Date(iso).toDateString() === new Date().toDateString()
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  })
}

/**
 * Notifications created before the link column existed carry no deep link.
 * Fall back to the right destination by type so every tap lands somewhere
 * useful instead of just flashing the row read.
 */
function fallbackLink(type: string): string | null {
  if (['booking', 'booking_cancelled', 'walk_in', 'appointment_waitlist_claimed',
       'appointment_waitlist_expired', 'abandoned_booking_recovery',
       'abandoned_booking_recovery_confirmed', 'rebooking_sms'].includes(type))
    return '/dashboard/calendar'
  if (['payment', 'billing', 'booth_rent_charge', 'deposit_late_payment_refund',
       'deposit_webhook_anomaly', 'external_payment_reconciliation', 'tip'].includes(type))
    return '/dashboard/unmatched-payments'
  if (['lapse_alert', 'client'].includes(type)) return '/dashboard/clients'
  if (type === 'review') return '/dashboard/reviews'
  if (['campaign_attribution_error', 'referral_sms'].includes(type)) return '/dashboard/campaigns'
  if (['sms_help', 'sms_optin', 'sms_optout', 'missed_call_textback', 'manual'].includes(type))
    return '/dashboard/consent'
  if (['daily_brief', 'weekly', 'daily', 'recurring', 'owner', 'barber', 'profile'].includes(type))
    return '/dashboard/insights'
  return null
}

/**
 * The single notification inbox, rendered by both the owner and the chair
 * notifications pages. Reads from NotificationsContext (the one live,
 * realtime-backed feed) so the bell badge, toasts, and this list can never
 * disagree — marking all read here clears the badge instantly, no refresh
 * or tab-switch needed.
 */
export default function NotificationsInbox() {
  const { notifications, unreadCount, markAllRead, markRead, loading } = useNotifications()
  const router = useRouter()

  function openNotification(n: { id: string; link?: string | null; type: string }) {
    markRead(n.id)
    const dest = n.link || fallbackLink(n.type)
    if (dest) router.push(dest)
  }

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <div className="w-6 h-6 rounded-full border-2 border-od-green border-t-transparent animate-spin" />
    </div>
  )

  const today = notifications.filter(n => isToday(n.created_at))
  const earlier = notifications.filter(n => !isToday(n.created_at))

  const renderRow = (n: any) => {
    const dest = n.link || fallbackLink(n.type)
    return (
    <div key={n.id}
      onClick={() => openNotification(n)}
      className={`px-5 py-4 flex items-start gap-3 transition-colors ${dest ? 'cursor-pointer hover:bg-warm-200/60' : ''} ${!n.read ? 'bg-od-green/5' : ''}`}>
      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${getDotColor(n.type)} ${n.read ? 'opacity-30' : ''}`} />
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-semibold ${n.read ? 'text-charcoal-400' : 'text-charcoal-900'}`}>
          {n.title}
        </div>
        <div className="text-xs text-charcoal-500 mt-0.5">{n.body}</div>
        <div className="text-xs text-charcoal-600 mt-1">{formatWhen(n.created_at)}</div>
      </div>
      {!n.read && (
        <div className="w-1.5 h-1.5 rounded-full bg-od-green flex-shrink-0 mt-2" />
      )}
    </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-serif text-2xl text-charcoal-900 mb-1">Notifications</h1>
          <p className="text-charcoal-500 text-sm">
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
          </p>
        </div>
        {notifications.length > 0 && unreadCount > 0 && (
          <button
            onClick={() => markAllRead()}
            className="text-xs text-od-green hover:text-od-green-light transition-colors">
            Mark all read
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden">
          <div className="p-8 text-center">
            <div className="text-4xl mb-3">🔔</div>
            <div className="text-sm text-charcoal-500">No notifications yet.</div>
            <div className="text-xs text-charcoal-600 mt-1">Booking alerts and updates will show up here.</div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {today.length > 0 && (
            <div>
              <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2 px-1">Today</div>
              <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden divide-y divide-warm-200">
                {today.map(renderRow)}
              </div>
            </div>
          )}
          {earlier.length > 0 && (
            <div>
              <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2 px-1">Earlier</div>
              <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden divide-y divide-warm-200">
                {earlier.map(renderRow)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
