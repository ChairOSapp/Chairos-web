'use client'
import { isNativeApp } from './platform'

/**
 * Platform-aware sharing. In the native app, uses the OS share sheet
 * (via Capacitor Share plugin if available). On web, falls back to the
 * Web Share API, then clipboard.
 */
export async function shareContent(opts: {
  title?: string
  text?: string
  url?: string
}): Promise<'shared' | 'copied' | 'dismissed'> {
  // Try native share sheet first (Capacitor)
  if (isNativeApp()) {
    try {
      const { Share } = await import('@capacitor/share')
      await Share.share({ title: opts.title, text: opts.text, url: opts.url })
      return 'shared'
    } catch {
      // Fall through to web methods
    }
  }

  // Web Share API (mobile browsers)
  if (typeof navigator !== 'undefined' && (navigator as any).share) {
    try {
      await (navigator as any).share({ title: opts.title, text: opts.text, url: opts.url })
      return 'shared'
    } catch (err: any) {
      if (err?.name === 'AbortError') return 'dismissed'
      // Fall through to clipboard
    }
  }

  // Clipboard fallback
  const text = [opts.text, opts.url].filter(Boolean).join(' ')
  try {
    await navigator.clipboard.writeText(text)
    return 'copied'
  } catch {
    return 'dismissed'
  }
}
