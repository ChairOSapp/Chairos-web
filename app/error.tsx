'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import * as Sentry from '@sentry/nextjs'

export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    try {
      Sentry.captureException(error)
    } catch { /* reporting must never block recovery */ }
  }, [error])

  return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center p-6">
      <div className="max-w-sm w-full text-center">
        <p className="font-serif text-3xl text-charcoal-900 mb-3">
          Chair<b className="font-normal text-od-green">OS</b>
        </p>
        <h1 className="text-lg font-semibold text-charcoal-900 mb-2">Something went wrong</h1>
        <p className="text-charcoal-500 text-sm mb-6">
          That one is on us, not you. Try again, and if it keeps happening, head back home and reopen the page.
        </p>
        <button onClick={() => retry()} className="btn-chairos w-full mb-3">
          Try again
        </button>
        <Link href="/" className="btn-chairos-outline inline-block w-full">
          Back to home
        </Link>
        {error.digest && (
          <p className="text-charcoal-400 text-xs mt-6">
            If you contact support, mention code {error.digest}
          </p>
        )}
      </div>
    </div>
  )
}
