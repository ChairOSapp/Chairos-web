// In-memory cache for the main tab pages (Home, Schedule, Clients,
// Insights). The dashboard is a web app: every tab tap unmounts the
// page and runs its data load from scratch behind a full-screen
// spinner, even for data fetched a minute earlier. Native apps feel
// instant because their tabs stay alive. This cache is the web
// equivalent for tab switches: it lives in JS module state, which
// survives client-side navigations (only a full page reload clears
// it), and pages use it stale-while-revalidate — paint the cached
// snapshot immediately, refresh in the background, then write the
// fresh result back through.
//
// It is deliberately NOT persisted (no localStorage/sessionStorage):
// a cold app open always loads fresh, which also keeps the stale-
// session resume behavior unchanged.

const store = new Map<string, unknown>()

export function tabCacheGet<T>(key: string): T | undefined {
  return store.get(key) as T | undefined
}

export function tabCacheSet(key: string, value: unknown): void {
  store.set(key, value)
}

export function tabCacheClear(): void {
  store.clear()
}
