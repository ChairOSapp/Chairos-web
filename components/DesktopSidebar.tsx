'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useVerticalLabels } from '@/lib/VerticalContext'
import NotificationBell from '@/components/NotificationBell'
import NotificationToast from '@/components/NotificationToast'
import PushBootstrap from '@/components/PushBootstrap'

// Desktop-only left sidebar. Rendered from app/dashboard/layout.tsx on md+
// screens; OwnerNav/StaffNav hide themselves on desktop so nav never doubles
// up. Hidden on chromeless routes (POS checkout, kiosk).

const OWNER_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { label: 'Calendar', href: '/dashboard/calendar', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { label: null, href: '/dashboard/staff', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
  { label: 'Clients', href: '/dashboard/clients', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
  { label: 'Services', href: '/dashboard/services', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { label: 'Pricing', href: '/dashboard/pricing', icon: 'M7 7h.01M7 3h5.586a1 1 0 01.707.293l6.414 6.414a1 1 0 010 1.414l-8.586 8.586a1 1 0 01-1.414 0l-6.414-6.414A1 1 0 013 12.586V7a4 4 0 014-4z' },
  { label: 'Tips', href: '/dashboard/tips', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  { label: 'Revenue', href: '/dashboard/revenue', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { label: 'Insights', href: '/dashboard/insights', icon: 'M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v16a1 1 0 01-1 1H5a1 1 0 01-1-1V4z' },
  { label: 'Campaigns', href: '/dashboard/campaigns', icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
  { label: 'Waitlist', href: '/dashboard/waitlist', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
  { label: 'Unmatched', href: '/dashboard/unmatched-payments', icon: 'M9 12h6m-6 4h3m-9 5h12a2 2 0 002-2V7a2 2 0 00-2-2h-2.28a2 2 0 00-1.72-1H9a2 2 0 00-1.72 1H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { label: 'Reviews', href: '/dashboard/reviews', icon: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z' },
  { label: 'Consent', href: '/dashboard/consent', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { label: 'Kiosk', href: '/dashboard/kiosk', icon: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
  { label: 'Settings', href: '/dashboard/settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
]

const CHAIR_ITEMS = [
  { label: 'My Schedule', href: '/dashboard/chair', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { label: 'Calendar', href: '/dashboard/chair/calendar', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { label: 'Earnings', href: '/dashboard/chair/earnings', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { label: 'Clients', href: '/dashboard/clients', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z', soloOwnerOnly: true },
  { label: 'Campaigns', href: '/dashboard/campaigns', icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z', soloOwnerOnly: true },
  { label: 'Insights', href: '/dashboard/insights', icon: 'M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v16a1 1 0 01-1 1H5a1 1 0 01-1-1V4z', soloOwnerOnly: true },
  { label: 'Shop Settings', href: '/dashboard/settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z', soloOwnerOnly: true },
  { label: 'Kiosk', href: '/dashboard/kiosk', icon: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z', soloOwnerOnly: true },
  { label: 'My Profile', href: '/dashboard/chair/settings', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
  { label: 'Reviews', href: '/dashboard/chair/reviews', icon: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z' },
]

// Chromeless routes: POS checkout flow and kiosk stay full-screen.
const CHROMELESS = ['/dashboard/pos', '/dashboard/kiosk']

export default function DesktopSidebar() {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = useMemo(() => createClient(), [])
  const { staffLabelPlural } = useVerticalLabels()
  const [userId, setUserId] = useState<string | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [isSoloOwner, setIsSoloOwner] = useState(false)
  const [shopName, setShopName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [initials, setInitials] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || cancelled) return
      setUserId(user.id)
      const { data: prof } = await supabase
        .from('profiles')
        .select('full_name, role')
        .eq('id', user.id)
        .maybeSingle()
      if (cancelled) return
      setRole(prof?.role ?? null)
      const name = prof?.full_name || ''
      setDisplayName(name)
      setInitials(name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() || '?')

      if (prof?.role === 'barber') {
        const { data: sb } = await supabase
          .from('shop_barbers')
          .select('shops(name, owner_id)')
          .eq('barber_id', user.id)
          .eq('active', true)
          .maybeSingle()
        if (cancelled) return
        const shopRow: any = (sb as any)?.shops
        const shop = Array.isArray(shopRow) ? shopRow[0] : shopRow
        setShopName(shop?.name || '')
        setIsSoloOwner(shop?.owner_id === user.id)
      } else {
        const { data: shop } = await supabase
          .from('shops')
          .select('name')
          .eq('owner_id', user.id)
          .maybeSingle()
        if (cancelled) return
        setShopName((shop as any)?.name || '')
      }
    }
    load()
    return () => { cancelled = true }
  }, [supabase])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (CHROMELESS.some(p => pathname?.startsWith(p))) return null

  // Wait for the role before choosing nav — otherwise staff briefly see owner items.
  const isOwner = role === null ? null : role !== 'barber'
  const items = isOwner === null
    ? []
    : isOwner
    ? OWNER_ITEMS.map(i => ({ ...i, label: i.label ?? staffLabelPlural }))
    : CHAIR_ITEMS.filter(i => !i.soloOwnerOnly || isSoloOwner).map(i => ({
        ...i,
        href: isSoloOwner && i.href === '/dashboard/chair/reviews' ? '/dashboard/reviews' : i.href,
        label: isSoloOwner && i.label === 'Reviews' ? 'Reviews' : i.label === 'Reviews' ? 'My Reviews' : i.label,
      }))

  return (
    <aside className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-64 z-40 bg-warm-100 dark:bg-[#1E1E1B] border-r border-warm-200 dark:border-[#2A2A26]">
      {/* Brand */}
      <button onClick={() => router.push('/dashboard')} className="px-5 pt-6 pb-5 text-left">
        <span className="font-serif text-od-green text-2xl">ChairOS</span>
        {shopName && <div className="text-xs text-charcoal-500 dark:text-[#A8A89E] mt-0.5 truncate">{shopName}</div>}
      </button>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-0.5">
        {items.map(item => {
          const active = item.href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname === item.href || pathname?.startsWith(item.href + '/')
          return (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${
                active
                  ? 'bg-od-green/15 dark:bg-[rgba(122,140,58,0.2)] text-od-green'
                  : 'text-charcoal-500 dark:text-[#A8A89E] hover:text-charcoal-900 dark:hover:text-[#EDECEA] hover:bg-warm-200 dark:hover:bg-[#252521]'
              }`}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                <path d={item.icon} />
              </svg>
              {item.label}
            </button>
          )
        })}
      </nav>

      {/* Bottom: notifications, user, sign out */}
      <div className="border-t border-warm-200 dark:border-[#2A2A26] px-4 py-4">
        <div className="flex items-center gap-3 mb-3">
          {userId && (
            <>
              <NotificationBell userId={userId} />
              <NotificationToast userId={userId} />
              <PushBootstrap />
            </>
          )}
          <div className="w-9 h-9 rounded-xl bg-od-green/10 border border-od-green/30 flex items-center justify-center font-serif text-od-green text-sm flex-shrink-0">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-charcoal-900 dark:text-[#EDECEA] truncate">{displayName}</div>
            <div className="text-[11px] text-charcoal-500 dark:text-[#A8A89E] truncate">{isOwner === null ? '…' : isOwner ? 'Owner' : 'Chair'}</div>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="w-full text-left text-xs font-medium text-charcoal-500 dark:text-[#A8A89E] hover:text-charcoal-900 dark:hover:text-[#EDECEA] transition-colors px-1 py-1"
        >
          Sign out
        </button>
      </div>
    </aside>
  )
}
