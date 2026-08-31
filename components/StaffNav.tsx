'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import NotificationBell from '@/components/NotificationBell'
import NotificationToast from '@/components/NotificationToast'
import { NotificationsProvider } from '@/src/context/NotificationsContext'

export default function StaffNav({ shopName, barberName, color, initial, photoUrl, userId }: {
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
  // Solo Chair is role='barber' but owns the shop they're the sole
  // barber_id of -- unlike hired staff, they need the shop-management
  // pages (Campaigns, Insights) an owner would otherwise reach through
  // OwnerNav, since there's no separate owner account for them to use.
  const [isSoloOwner, setIsSoloOwner] = useState(false)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    async function check() {
      const { data: shopBarber } = await supabase
        .from('shop_barbers')
        .select('shops(owner_id)')
        .eq('barber_id', userId)
        .eq('active', true)
        .maybeSingle()
      const shopRow = (shopBarber as any)?.shops
      const ownerId = Array.isArray(shopRow) ? shopRow[0]?.owner_id : shopRow?.owner_id
      if (!cancelled) setIsSoloOwner(ownerId === userId)
    }
    check()
    return () => { cancelled = true }
  }, [userId, supabase])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const navItems = [
    { label: 'My Schedule', href: '/dashboard/chair' },
    { label: 'Calendar', href: '/dashboard/chair/calendar' },
    { label: 'Earnings', href: '/dashboard/chair/earnings' },
    ...(isSoloOwner ? [
      { label: 'Clients', href: '/dashboard/clients' },
      { label: 'Campaigns', href: '/dashboard/campaigns' },
      { label: 'Insights', href: '/dashboard/insights' },
      { label: 'Shop Settings', href: '/dashboard/settings' },
    ] : []),
    { label: 'My Profile', href: '/dashboard/chair/settings' },
    // Solo Chair owns their shop's reviews outright (import from Google,
    // add manually, approve AI response drafts) -- send them to the full
    // management page instead of the read-only "your barbers" view.
    { label: isSoloOwner ? 'Reviews' : 'My Reviews', href: isSoloOwner ? '/dashboard/reviews' : '/dashboard/chair/reviews' },
  ]

  return (
    <header className="bg-warm-100 dark:bg-[#1E1E1B] border-b border-warm-200 dark:border-[#2A2A26] px-4 h-14 flex items-center justify-between sticky top-0 z-50">
      <div className="flex items-center gap-1">
        <span className="font-serif text-od-green text-lg mr-4">ChairOS</span>
        {navItems.map(item => {
          const active = pathname === item.href
          return (
            <button key={item.href} onClick={() => router.push(item.href)}
              className={`hidden md:flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                active ? 'bg-od-green/15 dark:bg-[rgba(122,140,58,0.2)] text-od-green' : 'text-charcoal-500 dark:text-[#A8A89E] hover:text-charcoal-900 dark:hover:text-[#EDECEA] hover:bg-warm-200 dark:hover:bg-[#252521]'
              }`}>
              {item.label}
            </button>
          )
        })}
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden sm:block text-right">
          <div className="text-xs font-medium text-charcoal-900 dark:text-[#EDECEA]">{barberName}</div>
          <div className="text-xs text-charcoal-500 dark:text-[#A8A89E]">{shopName}</div>
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
        <button onClick={handleSignOut} className="text-xs text-charcoal-500 dark:text-[#A8A89E] hover:text-charcoal-900 dark:hover:text-[#EDECEA] transition-colors">
          Sign out
        </button>
      </div>
    </header>
  )
}
