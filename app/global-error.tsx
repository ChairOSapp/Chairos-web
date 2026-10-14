'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

// Last-resort boundary: replaces the root layout when it fails, so it
// cannot rely on the app's stylesheets or fonts. Everything is inline.
export default function GlobalError({
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
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          background: '#FAFAF7',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          padding: '24px',
        }}
      >
        <div style={{ maxWidth: '340px', width: '100%', textAlign: 'center' }}>
          <p
            style={{
              fontFamily: "Georgia, 'Times New Roman', serif",
              fontSize: '30px',
              color: '#1A1A18',
              margin: '0 0 12px',
            }}
          >
            Chair<span style={{ color: '#4B5320' }}>OS</span>
          </p>
          <h1 style={{ fontSize: '17px', color: '#1A1A18', margin: '0 0 8px' }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: '14px', color: '#6B6B64', margin: '0 0 24px', lineHeight: 1.5 }}>
            The app ran into a problem it could not recover from on its own. Reloading usually fixes it.
          </p>
          <button
            onClick={() => retry()}
            style={{
              display: 'block',
              width: '100%',
              background: '#4B5320',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '8px',
              padding: '12px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              marginBottom: '10px',
            }}
          >
            Try again
          </button>
          <a
            href="/"
            style={{
              display: 'block',
              width: '100%',
              boxSizing: 'border-box',
              background: 'transparent',
              color: '#4B5320',
              border: '1px solid #4B5320',
              borderRadius: '8px',
              padding: '12px',
              fontSize: '14px',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Back to home
          </a>
          {error.digest && (
            <p style={{ fontSize: '12px', color: '#9A9A92', marginTop: '24px' }}>
              If you contact support, mention code {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  )
}
