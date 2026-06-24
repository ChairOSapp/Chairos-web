'use client'
import { useRouter } from 'next/navigation'
import { useNotifications } from '@/src/context/NotificationsContext'

export default function NotificationBell({ userId }: { userId: string }) {
  const { unreadCount } = useNotifications()
  const router = useRouter()

  return (
    <button
      onClick={() => router.push('/dashboard/notifications')}
      className="relative w-8 h-8 flex items-center justify-center text-charcoal-400 hover:text-charcoal-900 transition-colors">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
      {unreadCount > 0 && (
        <div className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-od-green rounded-full flex items-center justify-center text-white font-bold"
          style={{ fontSize: '9px' }}>
          {unreadCount > 9 ? '9+' : unreadCount}
        </div>
      )}
    </button>
  )
}
