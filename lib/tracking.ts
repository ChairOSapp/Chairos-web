// Shop-level Meta Pixel / Google tag, loaded only on that shop's own public
// booking page (app/book/[shopCode]/page.tsx) -- never dashboard or
// site-wide -- so each owner's ad pixel only ever sees their own booking
// traffic. Both are optional per-shop settings (shops.meta_pixel_id /
// shops.google_tag_id); every function here is a no-op when the id is unset.

declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & { queue?: unknown[]; loaded?: boolean; version?: string; callMethod?: (...args: unknown[]) => void }
    _fbq?: Window['fbq']
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

let metaPixelLoaded = false
let googleTagLoaded = false

export function initMetaPixel(pixelId: string | null | undefined) {
  if (!pixelId || metaPixelLoaded || typeof window === 'undefined') return
  metaPixelLoaded = true

  // Meta's standard base snippet, adapted to load the SDK via a real
  // <script> element (CSP-friendly) rather than document.write.
  const fbq = function (...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod(...args)
    else fbq.queue!.push(args)
  } as Window['fbq'] & { callMethod?: (...args: unknown[]) => void }
  if (!window._fbq) window._fbq = fbq
  fbq.loaded = true
  fbq.version = '2.0'
  fbq.queue = []
  window.fbq = fbq

  const script = document.createElement('script')
  script.async = true
  script.src = 'https://connect.facebook.net/en_US/fbevents.js'
  document.head.appendChild(script)

  window.fbq('init', pixelId)
  window.fbq('track', 'PageView')
}

export function trackMetaEvent(event: string, params?: Record<string, unknown>) {
  if (typeof window === 'undefined' || !window.fbq) return
  window.fbq('track', event, params)
}

export function initGoogleTag(tagId: string | null | undefined) {
  if (!tagId || googleTagLoaded || typeof window === 'undefined') return
  googleTagLoaded = true

  window.dataLayer = window.dataLayer || []
  window.gtag = function gtag(...args: unknown[]) { window.dataLayer!.push(args) }
  window.gtag('js', new Date())
  window.gtag('config', tagId)

  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(tagId)}`
  document.head.appendChild(script)
}

export function trackGoogleEvent(event: string, params?: Record<string, unknown>) {
  if (typeof window === 'undefined' || !window.gtag) return
  window.gtag('event', event, params)
}
