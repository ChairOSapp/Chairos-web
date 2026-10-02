'use client'
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string
      reset: (widgetId?: string) => void
      remove: (widgetId?: string) => void
    }
  }
}

let scriptPromise: Promise<void> | null = null
function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      // A failed load must not poison the cached promise, or a remount
      // retry would instantly reject again without re-attempting.
      scriptPromise = null
      reject(new Error('Failed to load Turnstile'))
    }
    document.head.appendChild(script)
  })
  return scriptPromise
}

export type TurnstileHandle = { reset: () => void }

// Renders nothing if NEXT_PUBLIC_TURNSTILE_SITE_KEY isn't set, so auth
// forms keep working locally/in preview before the key is configured.
//
// Turnstile tokens are single-use and expire after ~5 minutes -- once
// submitted for server-side verification, the token is consumed regardless
// of whether the surrounding request (login/signup/booking) actually
// succeeded. Any caller that lets the user retry after a failure MUST call
// reset() first, or the retry resubmits a dead token and gets rejected
// with "timeout-or-duplicate". Verify each token exactly once.
const Turnstile = forwardRef<TurnstileHandle, { onVerify: (token: string) => void; onExpire?: () => void; onError?: () => void }>(
  function Turnstile({ onVerify, onExpire, onError }, ref) {
    const containerRef = useRef<HTMLDivElement>(null)
    const widgetIdRef = useRef<string | null>(null)
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

    useImperativeHandle(ref, () => ({
      reset: () => {
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.reset(widgetIdRef.current)
        }
      },
    }), [])

    useEffect(() => {
      if (!siteKey || !containerRef.current) return
      let cancelled = false

      loadTurnstileScript().then(() => {
        if (cancelled || !window.turnstile || !containerRef.current) return
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: onVerify,
          'expired-callback': onExpire,
        })
      }).catch(() => {
        // The widget never rendered (script blocked/failed) -- tell the
        // caller so it can offer a retry instead of leaving its submit
        // button permanently disabled.
        onError?.()
      })

      return () => {
        cancelled = true
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.remove(widgetIdRef.current)
        }
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [siteKey])

    if (!siteKey) return null
    return <div ref={containerRef} className="flex justify-center" />
  }
)

export default Turnstile
