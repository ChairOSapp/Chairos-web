'use client'
import { useMemo } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import NotificationBell from '@/components/NotificationBell'
import NotificationToast from '@/components/NotificationToast'
import { NotificationsProvider } from '@/src/context/NotificationsContext'

export default function BarberNav({ shopName, barberName, color, initial, photoUrl, userId }: {
  shopName: string
  barberName: string
  color: string
  initial: string
  photoUrl?: string
  userId?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = useMemo(() => createClient(), [])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <header className="bg-warm-100 border-b border-warm-200 px-4 h-14 flex items-center justify-between sticky top-0 z-50">
      <div className="flex items-center gap-1">
        <span className="font-serif text-od-green text-lg mr-4">ChairOS</span>
        {[
          { label: 'My Schedule', href: '/dashboard/barber' },
          { label: 'My Profile', href: '/dashboard/barber/settings' },
        ].map(item => {
          const active = pathname === item.href
          return (
            <button key={item.href} onClick={() => router.push(item.href)}
              className={`hidden md:flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                active ? 'bg-od-green/15 text-od-green' : 'text-charcoal-500 hover:text-white hover:bg-warm-200'
              }`}>
              {item.label}
            </button>
          )
        })}
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden sm:block text-right">
          <div className="text-xs font-medium text-charcoal-900">{barberName}</div>
          <div className="text-xs text-charcoal-500">{shopName}</div>
        </div>
        {userId && (
          <NotificationsProvider>
            <NotificationBell userId={userId} />
            <NotificationToast userId={userId} />
          </NotificationsProvider>
        )}
        <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center font-serif text-sm font-bold flex-shrink-0"
          style={{ background: color + '22', border: `2px solid ${color}`, color }}>
          {photoUrl
            ? <img src={photoUrl} alt="" className="w-full h-full object-cover" />
            : initial}
        </div>
        <button onClick={handleSignOut} className="text-xs text-charcoal-500 hover:text-charcoal-900 transition-colors">
          Sign out
        </button>
      </div>
    </header>
  )
}
