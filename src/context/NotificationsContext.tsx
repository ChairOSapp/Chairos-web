'use client'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'

type Notification = { id: string; title: string; body: string; type: string; read: boolean; created_at: string }
type NotificationsContextType = {
  notifications: Notification[]
  unreadCount: number
  markAllRead: () => Promise<void>
  loading: boolean
}
const NotificationsContext = createContext<NotificationsContextType>({
  notifications: [], unreadCount: 0, markAllRead: async () => {}, loading: true
})
export function useNotifications() { return useContext(NotificationsContext) }

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), [])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
  }, [supabase])

  useEffect(() => {
    if (!userId) return
    let channel: ReturnType<typeof supabase.channel> | null = null

    async function load() {
      setLoading(true)
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50)
      setNotifications(data || [])
      setLoading(false)
    }

    load()
    channel = supabase
      .channel(`notifications:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () => load())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () => load())
      .subscribe()

    return () => { if (channel) supabase.removeChannel(channel) }
  }, [userId, supabase])

  async function markAllRead() {
    if (!userId) return
    await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false)
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  const unreadCount = notifications.filter(n => !n.read).length
  return (
    <NotificationsContext.Provider value={{ notifications, unreadCount, markAllRead, loading }}>
      {children}
    </NotificationsContext.Provider>
  )
}
