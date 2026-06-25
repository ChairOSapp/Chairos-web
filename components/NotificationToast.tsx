'use client'
import { useEffect, useRef, useState } from 'react'
import { useNotifications } from '@/src/context/NotificationsContext'

type Toast = {
  id: string
  title: string
  body: string
  type: string
}

const SEEN_KEY = 'chairos_toasted_notification_ids'

function getSeenIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
  } catch { return new Set() }
}

function persistSeenId(id: string) {
  try {
    const seen = getSeenIds()
    seen.add(id)
    // Cap at 500 entries to avoid unbounded growth
    const arr = [...seen].slice(-500)
    localStorage.setItem(SEEN_KEY, JSON.stringify(arr))
  } catch {}
}

export default function NotificationToast({ userId }: { userId: string }) {
  const { notifications, markRead } = useNotifications()
  const [toasts, setToasts] = useState<Toast[]>([])
  const seenIdsRef = useRef<Set<string>>(new Set())
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // Initialise from localStorage so re-mounts (route changes) don't re-show old toasts
  useEffect(() => {
    seenIdsRef.current = getSeenIds()
  }, [])

  useEffect(() => {
    if (notifications.length === 0) return
    const latest = notifications[0]
    if (!latest.read && !seenIdsRef.current.has(latest.id)) {
      seenIdsRef.current.add(latest.id)
      persistSeenId(latest.id)

      const toast: Toast = {
        id: latest.id,
        title: latest.title,
        body: latest.body,
        type: latest.type,
      }
      setToasts(prev => [...prev, toast])

      const timer = setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== toast.id))
        timersRef.current.delete(toast.id)
        markRead(toast.id)
      }, 4000)
      timersRef.current.set(toast.id, timer)
    }
  }, [notifications])

  function dismiss(id: string) {
    const timer = timersRef.current.get(id)
    if (timer) { clearTimeout(timer); timersRef.current.delete(id) }
    setToasts(prev => prev.filter(t => t.id !== id))
    markRead(id)
  }

  useEffect(() => {
    return () => { timersRef.current.forEach(t => clearTimeout(t)) }
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-16 right-4 z-50 flex flex-col gap-2 max-w-sm w-full">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className="bg-warm-100 border border-warm-300 rounded-xl p-4 shadow-lg cursor-pointer hover:border-od-green/50 transition-all animate-slide-in"
        >
          <div className="flex items-start gap-3">
            <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
              toast.type === 'booking' ? 'bg-od-green' :
              toast.type === 'tip' ? 'bg-green-500' :
              toast.type === 'floor' ? 'bg-blue-500' :
              'bg-warm-500'
            }`} />
            <div className="flex-1 min-w-0" onClick={() => dismiss(toast.id)}>
              <div className="text-sm font-semibold text-charcoal-900">{toast.title}</div>
              <div className="text-xs text-charcoal-400 mt-0.5">{toast.body}</div>
            </div>
            <button
              onClick={() => dismiss(toast.id)}
              className="text-charcoal-600 hover:text-charcoal-900 text-lg leading-none flex-shrink-0"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
