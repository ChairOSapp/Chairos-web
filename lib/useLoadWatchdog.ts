'use client'

import { useEffect } from 'react'

const RECOVERY_KEY = 'chairos-stuck-load-at'
const RECOVERY_WINDOW_MS = 5 * 60 * 1000
const STUCK_AFTER_MS = 12000

/**
 * Stuck-load recovery for the dashboard's full-screen loading gates.
 *
 * Reported 2026-10-12: open the app, do a haircut or tattoo, reopen it
 * later and the loading screen spins forever; force-closing the app is
 * the only fix. Root cause: the pages' load chains open with
 * supabase.auth.getUser() and only clear their loading flag at the very
 * end of the success path — no timeout, no guaranteed exit. When the app
 * wakes after being backgrounded past the 1h JWT expiry, the session
 * refresh behind that first call can stall indefinitely (iOS leaves a
 * suspended webview's in-flight request pending instead of failing it),
 * so the chain never settles and the spinner never clears.
 *
 * This hook is the guaranteed exit, independent of the load chain: if
 * `loading` stays up continuously for STUCK_AFTER_MS, do automatically
 * what force-close does manually — one clean page reload. The attempt
 * is stamped in sessionStorage; if the app gets stuck again within the
 * window, reloading is not helping, so land on the login page instead
 * (which bounds its own session check) rather than spinning or looping.
 */
export function useLoadWatchdog(loading: boolean) {
  useEffect(() => {
    if (!loading) return
    const t = setTimeout(recoverFromStuckLoad, STUCK_AFTER_MS)
    return () => clearTimeout(t)
  }, [loading])
}

function recoverFromStuckLoad() {
  let alreadyRecovered = true
  try {
    const last = Number(sessionStorage.getItem(RECOVERY_KEY) || 0)
    alreadyRecovered = Date.now() - last <= RECOVERY_WINDOW_MS
    if (!alreadyRecovered) {
      sessionStorage.setItem(RECOVERY_KEY, String(Date.now()))
    }
  } catch {
    // Storage unreadable: we cannot prove this would be the first
    // recovery, so do not risk a reload loop — go straight to login.
    alreadyRecovered = true
  }
  if (alreadyRecovered) {
    window.location.assign('/login?stuck=1')
  } else {
    window.location.reload()
  }
}
