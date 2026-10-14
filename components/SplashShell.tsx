'use client'

import { useEffect, useState } from 'react'

// Branded instant-loading shell (web-side half of the iOS splash fix).
// Server-rendered so it paints on the very first paint, before hydration;
// removed through React state (never raw DOM removal) so the App Router
// never trips over a missing node during client-side navigation.
// It also owns the native handoff: inside the iOS wrapper the native
// splash is held (launchAutoHide: false) until the effect below hides
// it. By the time this runs the shell is already painted, so the user
// goes branded splash -> branded shell -> content, and the raw site
// loading underneath never shows.
export default function SplashShell() {
  const [phase, setPhase] = useState<'show' | 'fade' | 'gone'>('show')

  useEffect(() => {
    void (async () => {
      try {
        const { Capacitor } = await import('@capacitor/core')
        if (!Capacitor.isNativePlatform()) return
        const { SplashScreen } = await import('@capacitor/splash-screen')
        await SplashScreen.hide({ fadeOutDuration: 300 })
      } catch { /* web, or plugin not in this build: shell timers still apply */ }
    })()
    const timers: ReturnType<typeof setTimeout>[] = []
    const fade = () => setPhase(prev => (prev === 'show' ? 'fade' : prev))
    const gone = () => setPhase('gone')
    const onLoad = () => {
      timers.push(setTimeout(fade, 600))
      timers.push(setTimeout(gone, 1200))
    }
    if (document.readyState === 'complete') onLoad()
    else window.addEventListener('load', onLoad)
    // Safety net: never trap the user behind the splash.
    timers.push(setTimeout(fade, 6000))
    timers.push(setTimeout(gone, 6600))
    return () => {
      window.removeEventListener('load', onLoad)
      timers.forEach(clearTimeout)
    }
  }, [])

  if (phase === 'gone') return null
  return (
    <div id="chairos-splash" aria-hidden="true" className={phase === 'fade' ? 'chairos-splash-hide' : undefined}>
      <p className="mark">Chair<b>OS</b></p>
      <div className="bar"><i /></div>
    </div>
  )
}
