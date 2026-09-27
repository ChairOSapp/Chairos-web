'use client'

import { useState } from 'react'
import QRCode from 'react-qr-code'

const PORTAL_URL = 'https://chairos.cc/my'

// Shareable client-portal card for the owner dashboard: the portal only
// works if clients know it exists, so owners get a copyable link plus a
// QR code they can print or display in the shop.
export default function ClientPortalCard() {
  const [copied, setCopied] = useState(false)

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(PORTAL_URL)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = PORTAL_URL
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="mb-4 bg-warm-100 border border-warm-200 rounded-xl px-4 py-4 flex items-center gap-4">
      <div className="bg-white p-2 rounded-lg flex-shrink-0">
        <QRCode value={PORTAL_URL} size={72} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-charcoal-900">Your clients have a portal</div>
        <p className="text-xs text-charcoal-500 mt-0.5 mb-2">
          Bookings, card on file, loyalty — clients sign in with their phone number.
        </p>
        <div className="flex items-center gap-2">
          <code className="text-xs text-charcoal-700 bg-warm-200 rounded px-2 py-1 truncate">{PORTAL_URL}</code>
          <button onClick={copyLink}
            className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg text-white bg-od-green transition-colors">
            {copied ? 'Copied!' : 'Copy link'}
          </button>
        </div>
      </div>
    </div>
  )
}
