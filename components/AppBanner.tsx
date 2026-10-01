'use client'
import { useEffect, useState } from 'react'
import { usePlatform, isNativeApp } from '@/lib/platform'

const DISMISSED_KEY = 'chairos-app-banner-dismissed'

/**
 * "Get the app" banner — shown only on mobile web (not inside the native
 * app, not on desktop). Dismissable, stays dismissed for 30 days.
 */
export default function AppBanner() {
  const platform = usePlatform()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (isNativeApp()) return
    if (platform !== 'web-ios' && platform !== 'web-android') return
    try {
      const dismissed = localStorage.getItem(DISMISSED_KEY)
      if (dismissed && Date.now() - parseInt(dismissed, 10) < 30 * 24 * 60 * 60 * 1000) return
    } catch { /* show anyway */ }
    // Small delay so it doesn't flash on every page load
    const t = setTimeout(() => setVisible(true), 1500)
    return () => clearTimeout(t)
  }, [platform])

  if (!visible) return null

  const dismiss = () => {
    try { localStorage.setItem(DISMISSED_KEY, String(Date.now())) } catch {}
    setVisible(false)
  }

  const storeUrl = platform === 'web-ios'
    ? 'https://apps.apple.com/app/chairos' // TODO: real App Store URL after launch
    : 'https://chairos.cc'

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4 safe-area-pb">
      <div className="max-w-md mx-auto bg-[#1A1815] border border-amber-500/30 rounded-2xl p-4 flex items-center gap-3 shadow-2xl">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-black font-bold text-lg flex-shrink-0">
          C
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-white">Get the ChairOS app</div>
          <div className="text-xs text-white/50">Faster bookings, push notifications</div>
        </div>
        <a href={storeUrl}
          className="flex-shrink-0 px-4 py-2 bg-amber-500 text-black text-xs font-bold rounded-xl hover:bg-amber-400 transition-colors">
          Get
        </a>
        <button onClick={dismiss} className="flex-shrink-0 text-white/40 hover:text-white/70 text-lg leading-none px-1">
          ×
        </button>
      </div>
    </div>
  )
}
