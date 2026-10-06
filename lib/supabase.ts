import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  patchRefreshTokenRace(client)
  return client
}

// Auth instances already patched (createBrowserClient returns a singleton in
// browsers, but guard anyway since createClient() is called widely).
const patched = new WeakSet<object>()

/**
 * Root cause of the intermittent iOS sign-outs (reported 2026-10-05):
 *
 * Two Supabase clients share one rotating refresh token:
 *   1. the middleware's server client (proxy.ts), which refreshes an expired
 *      session on every request via getUser(), and
 *   2. this browser client, which auto-refreshes on its own timer.
 *
 * When the app is backgrounded past the 1h JWT expiry and then foregrounded,
 * whichever client refreshes first wins. If the middleware wins, the cookie
 * jar holds the new pair (R2) while this client's in-memory session still has
 * the old refresh token (R1). The overdue auto-refresh then fails with
 * "Invalid Refresh Token: Already Used", and supabase-js deletes the local
 * session — the user is signed out even though a valid session existed.
 * (Verified against @supabase/auth-js 2.103.3: _callRefreshToken calls
 * _removeSession() on non-retryable errors; the server only tolerates token
 * reuse within security_refresh_token_reuse_interval = 10s, so any race
 * wider than that is fatal.)
 *
 * Fix: before every refresh attempt, re-read the cookie jar and use the
 * freshest refresh token found there. If the jar is also stale (the session
 * is truly dead), the refresh fails as before and the user is signed out.
 *
 * Re-verify this patch when upgrading @supabase/supabase-js — it wraps the
 * private _callRefreshToken.
 */
function patchRefreshTokenRace(client: unknown) {
  if (typeof window === 'undefined') return
  const auth = (client as { auth?: unknown }).auth as
    | {
        _callRefreshToken?: (token: string) => Promise<{ data: unknown; error: unknown }>
        storage?: { getItem?: (key: string) => Promise<string | null> | string | null }
        storageKey?: string
      }
    | undefined
  if (!auth || typeof auth._callRefreshToken !== 'function') return
  if (patched.has(auth)) return
  patched.add(auth)

  const origCallRefreshToken = auth._callRefreshToken.bind(auth)
  auth._callRefreshToken = async (token: string) => {
    try {
      const getItem = auth.storage?.getItem
      const key = auth.storageKey
      if (getItem && key) {
        const raw = await getItem.call(auth.storage, key)
        if (raw) {
          const stored = JSON.parse(raw) as { refresh_token?: string }
          if (stored?.refresh_token && stored.refresh_token !== token) {
            // Another client (the middleware) rotated the token first and
            // the jar already has the newer pair — use it instead of the
            // stale in-memory token that would fail as "already used".
            token = stored.refresh_token
          }
        }
      }
    } catch {
      // Storage unreadable — proceed with the original token.
    }
    return origCallRefreshToken(token)
  }
}
