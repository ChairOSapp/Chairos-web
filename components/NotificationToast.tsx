'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

type Toast = {
  id: string
  title: string
  body: string
  type: string
}

export default function NotificationToast({ userId }: { userId: string }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const supabase = createClient()

  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel(`notifications-${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`
      }, (payload) => {
        const n = payload.new as any
        const toast: Toast = {
          id: n.id,
          title: n.title,
          body: n.body,
          type: n.type,
        }
        setToasts(prev => [...prev, toast])
        setTimeout(() => {
          setToasts(prev => prev.filter(t => t.id !== toast.id))
        }, 4000)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId])

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-16 right-4 z-50 flex flex-col gap-2 max-w-sm w-full">
      {toasts.map(toast => (
        <div
          key={toast.id}
          onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
          className="bg-warm-100 border border-warm-300 rounded-xl p-4 shadow-lg cursor-pointer hover:border-od-green/50 transition-all animate-slide-in">
          <div className="flex items-start gap-3">
            <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
              toast.type === 'booking' ? 'bg-od-green' :
              toast.type === 'tip' ? 'bg-green-500' :
              toast.type === 'floor' ? 'bg-blue-500' :
              'bg-warm-500'
            }`} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-charcoal-900">{toast.title}</div>
              <div className="text-xs text-charcoal-400 mt-0.5">{toast.body}</div>
            </div>
            <button className="text-charcoal-600 hover:text-charcoal-900 text-lg leading-none flex-shrink-0">×</button>
          </div>
        </div>
      ))}
    </div>
  )
}
