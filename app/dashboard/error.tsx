'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import * as Sentry from '@sentry/nextjs'

export default function DashboardError({
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
    <div className="flex items-center justify-center p-6 py-24">
      <div className="max-w-sm w-full text-center">
        <h1 className="text-lg font-semibold text-charcoal-900 mb-2">This page hit a snag</h1>
        <p className="text-charcoal-500 text-sm mb-6">
          Nothing was saved or lost. Try loading it again.
        </p>
        <button onClick={() => retry()} className="btn-chairos w-full mb-3">
          Try again
        </button>
        <Link href="/dashboard" className="btn-chairos-outline inline-block w-full">
          Back to dashboard
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
