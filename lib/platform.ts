'use client'
import { useEffect, useState } from 'react'

export type Platform = 'ios-native' | 'android-native' | 'web-ios' | 'web-android' | 'web-desktop'

/**
 * Detects the runtime platform. Used to pair the native app and website:
 * same data and auth, but each platform gets its native-optimized behavior
 * (push on native, app banners on web, share sheets, etc).
 */
export function getPlatform(): Platform {
  if (typeof window === 'undefined') return 'web-desktop'
  try {
    // Capacitor native wrapper
    const cap = (window as any).Capacitor
    if (cap?.isNativePlatform?.()) {
      const p = cap.getPlatform?.()
      if (p === 'ios') return 'ios-native'
      if (p === 'android') return 'android-native'
    }
  } catch { /* fall through to web detection */ }

  const ua = navigator.userAgent || ''
  const isIOS = /iPad|iPhone|iPod/.test(ua)
  const isAndroid = /Android/.test(ua)
  const isMobile = isIOS || isAndroid || /Mobi|Tablet/.test(ua)
  if (isIOS) return 'web-ios'
  if (isAndroid) return 'web-android'
  return isMobile ? 'web-android' : 'web-desktop'
}

export function isNativeApp(): boolean {
  const p = getPlatform()
  return p === 'ios-native' || p === 'android-native'
}

export function isMobile(): boolean {
  const p = getPlatform()
  return p !== 'web-desktop'
}

/** React hook version — safe for SSR (defaults to web-desktop until mounted). */
export function usePlatform(): Platform {
  const [platform, setPlatform] = useState<Platform>('web-desktop')
  useEffect(() => {
    setPlatform(getPlatform())
  }, [])
  return platform
}
