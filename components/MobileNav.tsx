'use client'
import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useVerticalLabels } from '@/lib/VerticalContext'

const ITEMS = [
  { label: 'Home',     href: '/dashboard',          icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { label: 'Schedule', href: '/dashboard/calendar', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { label: 'Clients',  href: '/dashboard/clients',  icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
  { label: 'Insights', href: '/dashboard/insights', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
]

// Everything that doesn't fit in the 5-slot bottom bar. Owner desktop nav
// (components/OwnerNav.tsx) shows all of these directly; on mobile they were
// previously unreachable by tapping anything -- only Home's quick-link
// buttons and Settings surfaced a few of them (Revenue, Staff, Reviews).
const MORE_ITEMS = [
  { label: null, href: '/dashboard/staff', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
  { label: 'Services', href: '/dashboard/services', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { label: 'Pricing', href: '/dashboard/pricing', icon: 'M7 7h.01M7 3h5.586a1 1 0 01.707.293l6.414 6.414a1 1 0 010 1.414l-8.586 8.586a1 1 0 01-1.414 0l-6.414-6.414A1 1 0 013 12.586V7a4 4 0 014-4z' },
  { label: 'Tips', href: '/dashboard/tips', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  { label: 'Revenue', href: '/dashboard/revenue', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { label: 'Campaigns', href: '/dashboard/campaigns', icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
  { label: 'Waitlist', href: '/dashboard/waitlist', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
  { label: 'Unmatched', href: '/dashboard/unmatched-payments', icon: 'M9 12h6m-6 4h3m-9 5h12a2 2 0 002-2V7a2 2 0 00-2-2h-2.28a2 2 0 00-1.72-1H9a2 2 0 00-1.72 1H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { label: 'Reviews', href: '/dashboard/reviews', icon: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z' },
  { label: 'Consent', href: '/dashboard/consent', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', tattooOnly: true },
  { label: 'Kiosk', href: '/dashboard/kiosk', icon: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
]

export default function MobileNav() {
  const router = useRouter()
  const pathname = usePathname()
  const { staffLabelPlural, vertical } = useVerticalLabels()
  const [moreOpen, setMoreOpen] = useState(false)
  const moreItems = MORE_ITEMS.filter(item => !item.tattooOnly || vertical === 'tattoo')
  const moreActive = moreItems.some(item => pathname === item.href || pathname.startsWith(item.href + '/'))

  function go(href: string) {
    setMoreOpen(false)
    router.push(href)
  }

  return (
    <>
      {moreOpen && (
        <div className="md:hidden fixed inset-0 bg-black/40 z-50" onClick={() => setMoreOpen(false)}>
          <div
            onClick={e => e.stopPropagation()}
            className="fixed bottom-0 left-0 right-0 bg-warm-100 dark:bg-[#1E1E1B] border-t border-warm-200 dark:border-[#2A2A26] rounded-t-2xl p-4 pb-6 max-h-[70vh] overflow-y-auto"
          >
            <div className="w-10 h-1 bg-warm-300 dark:bg-[#3A3A34] rounded-full mx-auto mb-4" />
            <div className="grid grid-cols-4 gap-3">
              {moreItems.map(item => (
                <button key={item.href} onClick={() => go(item.href)}
                  className="flex flex-col items-center gap-1.5 py-2 text-charcoal-500 dark:text-[#A8A89E] hover:text-charcoal-900 dark:hover:text-[#EDECEA] transition-colors">
                  <div className="w-11 h-11 rounded-xl bg-warm-200 dark:bg-[#252521] flex items-center justify-center">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d={item.icon} />
                    </svg>
                  </div>
                  <span className="text-[11px] text-center leading-tight">{item.label ?? staffLabelPlural}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-warm-100 dark:bg-[#1E1E1B] border-t border-warm-200 dark:border-[#2A2A26] px-2 py-2 flex justify-around z-50">
        {ITEMS.map((item) => {
          const active = item.href === '/dashboard/insights'
            ? ['/dashboard/analytics', '/dashboard/insights', '/dashboard/revenue'].some(p => pathname === p || pathname.startsWith(p + '/'))
            : (pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href)))
          return (
            <button key={item.href} onClick={() => router.push(item.href)}
              className={`flex flex-col items-center gap-1 px-3 py-1 transition-colors ${active ? 'text-od-green' : 'text-charcoal-500 dark:text-[#A8A89E] hover:text-charcoal-900 dark:hover:text-[#EDECEA]'}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d={item.icon} />
              </svg>
              <span className="text-xs">{item.label}</span>
            </button>
          )
        })}
        <button onClick={() => setMoreOpen(true)}
          className={`flex flex-col items-center gap-1 px-3 py-1 transition-colors ${moreActive ? 'text-od-green' : 'text-charcoal-500 dark:text-[#A8A89E] hover:text-charcoal-900 dark:hover:text-[#EDECEA]'}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" />
          </svg>
          <span className="text-xs">More</span>
        </button>
      </div>
    </>
  )
}
