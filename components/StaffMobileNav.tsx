'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useVerticalLabels } from '@/lib/VerticalContext'
import { AnimatePresence, FadeBackdrop, SlideUpSheet, StaggerList, StaggerItem } from './motion'

const ITEMS = [
  { label: 'Home',     href: '/dashboard/chair',          icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { label: 'Schedule', href: '/dashboard/chair/calendar', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { label: 'Clients',  href: '/dashboard/chair/clients',  icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
  { label: 'Earnings', href: '/dashboard/chair/earnings', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  { label: 'Settings', href: '/dashboard/chair/settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
]

// Items the 5-slot bottom bar can't fit. Desktop StaffNav shows "My Reviews"
// for every barber and the shop-management pages for solo-chair owners, but
// on mobile there was no way to reach any of these until this sheet.
const MORE_ITEMS = [
  { label: 'Reviews', href: '/dashboard/chair/reviews', soloOnly: false, icon: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z' },
  { label: null, href: '/dashboard/staff', soloOnly: true, icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
  { label: 'Clients', href: '/dashboard/clients', soloOnly: true, icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
  { label: 'Campaigns', href: '/dashboard/campaigns', soloOnly: true, icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
  { label: 'Insights', href: '/dashboard/insights', soloOnly: true, icon: 'M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v16a1 1 0 01-1 1H5a1 1 0 01-1-1V4z' },
  { label: 'Shop Settings', href: '/dashboard/settings', soloOnly: true, icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
  { label: 'Kiosk', href: '/dashboard/kiosk', soloOnly: true, icon: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
]

export default function StaffMobileNav({ userId }: { userId?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const { staffLabelPlural } = useVerticalLabels()
  const supabase = useMemo(() => createClient(), [])
  const [moreOpen, setMoreOpen] = useState(false)
  // Solo Chair owns their shop outright (same check as StaffNav) — they get
  // the shop-management pages an owner would otherwise reach through OwnerNav.
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

  const moreItems = MORE_ITEMS.filter(item => !item.soloOnly || isSoloOwner)
  const moreActive = moreItems.some(item => pathname === item.href || pathname.startsWith(item.href + '/'))

  function go(href: string) {
    setMoreOpen(false)
    router.push(href)
  }

  return (
    <>
      <AnimatePresence>
      {moreOpen && (
        <FadeBackdrop className="md:hidden fixed inset-0 bg-black/40 z-[60]" onClick={() => setMoreOpen(false)}>
          <SlideUpSheet
            onClick={e => e.stopPropagation()}
            className="fixed bottom-0 left-0 right-0 bg-warm-100 dark:bg-[#1E1E1B] border-t border-warm-200 dark:border-[#2A2A26] rounded-t-2xl p-4 pb-8 pb-safe-sheet max-h-[70vh] overflow-y-auto"
          >
            <div className="w-10 h-1 bg-warm-300 dark:bg-[#3A3A34] rounded-full mx-auto mb-4" />
            <StaggerList className="grid grid-cols-4 gap-3">
              {moreItems.map(item => (
                <StaggerItem key={item.href}>
                <button onClick={() => go(item.href)}
                  className="w-full flex flex-col items-center gap-1.5 py-2 text-charcoal-500 dark:text-[#A8A89E] hover:text-charcoal-900 dark:hover:text-[#EDECEA] transition-colors">
                  <div className="w-11 h-11 rounded-xl bg-warm-200 dark:bg-[#252521] flex items-center justify-center">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d={item.icon} />
                    </svg>
                  </div>
                  <span className="text-[11px] text-center leading-tight">{item.label ?? staffLabelPlural}</span>
                </button>
                </StaggerItem>
              ))}
            </StaggerList>
          </SlideUpSheet>
        </FadeBackdrop>
      )}
      </AnimatePresence>

      <div aria-hidden className="md:hidden h-[calc(4rem+env(safe-area-inset-bottom))]" />
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-warm-100 dark:bg-[#1E1E1B] border-t border-warm-200 dark:border-[#2A2A26] px-2 py-2 pb-safe flex justify-around z-50">
        {ITEMS.map((item) => {
          const active = pathname === item.href || (item.href !== '/dashboard/chair' && pathname.startsWith(item.href))
          return (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              className={`flex flex-col items-center gap-1 px-3 py-1 transition-colors ${active ? 'text-od-green dark:text-[#7A8C3A]' : 'text-charcoal-500 dark:text-[#A8A89E]'}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d={item.icon} />
              </svg>
              <span className="text-xs">{item.label}</span>
            </button>
          )
        })}
        <button onClick={() => setMoreOpen(true)}
          className={`flex flex-col items-center gap-1 px-3 py-1 transition-colors ${moreActive ? 'text-od-green dark:text-[#7A8C3A]' : 'text-charcoal-500 dark:text-[#A8A89E]'}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" />
          </svg>
          <span className="text-xs">More</span>
        </button>
      </div>
    </>
  )
}
