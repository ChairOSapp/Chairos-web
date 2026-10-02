'use client'
import { useEffect, useRef, useState } from 'react'

export type McTab = 'actions' | 'directory' | 'health' | 'feedback'

const TABS: { id: McTab; label: string; icon: string }[] = [
  { id: 'actions', label: 'Actions', icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' },
  { id: 'directory', label: 'Directory', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
  { id: 'health', label: 'Health', icon: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z' },
  { id: 'feedback', label: 'Feedback', icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' },
]

// Same floating-pill bottom nav as the app's MobileNav: icon-only,
// active icon gets the pill highlight, auto-hides on scroll down.
export default function AdminNav({ tab, onChange, actionCount }: {
  tab: McTab
  onChange: (t: McTab) => void
  actionCount: number
}) {
  const [navVisible, setNavVisible] = useState(true)
  const lastScrollY = useRef(0)

  useEffect(() => {
    let ticking = false
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        const y = window.scrollY
        const dy = y - lastScrollY.current
        if (y < 80 || dy < -8) setNavVisible(true)
        else if (dy > 8) setNavVisible(false)
        lastScrollY.current = y
        ticking = false
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  function go(t: McTab) {
    if (t === tab) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    onChange(t)
  }

  return (
    <>
      <div aria-hidden className="md:hidden h-[calc(5rem+env(safe-area-inset-bottom))]" />
      <div className={`md:hidden fixed bottom-0 left-0 right-0 z-50 flex justify-center pointer-events-none transition-transform duration-300 ease-out ${navVisible ? 'translate-y-0' : 'translate-y-24'}`}>
        <div className={`pointer-events-auto mx-6 mb-[calc(0.75rem+env(safe-area-inset-bottom))] bg-charcoal-900 rounded-full px-3 py-2 flex items-center gap-1 shadow-lg border border-charcoal-700 transition-opacity duration-300 ${navVisible ? 'opacity-100' : 'opacity-0'}`}>
          {TABS.map(t => {
            const active = tab === t.id
            return (
              <button key={t.id} onClick={() => go(t.id)} aria-label={t.label}
                className={`relative w-16 h-12 rounded-full flex items-center justify-center transition-colors ${
                  active ? 'bg-[#8A9A3B]/25 text-[#A8BE4A]' : 'text-charcoal-500 hover:text-charcoal-200'
                }`}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d={t.icon} />
                </svg>
                {t.id === 'actions' && actionCount > 0 && (
                  <span className="absolute top-1 right-3 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                    {actionCount}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}
