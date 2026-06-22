'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function NotificationBell({ userId }: { userId: string }) {
  const [unreadCount, setUnreadCount] = useState(0)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    if (!userId) return
    loadUnread()

    const channel = supabase
      .channel(`notif-bell-${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`
      }, () => { loadUnread() })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`
      }, () => { loadUnread() })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId])

  async function loadUnread() {
    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false)
    setUnreadCount(count || 0)
  }

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
