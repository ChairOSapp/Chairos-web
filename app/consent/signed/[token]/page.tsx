'use client'
import { useEffect, useState, use as usePromise } from 'react'

interface SignedInfo {
  signedUrl: string
  signedAt: string
  templateVersion: number
  shopName: string
}

export default function SignedConsentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = usePromise(params)
  const [info, setInfo] = useState<SignedInfo | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/consent/signed/${token}`)
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Not found'); return }
      setInfo(data)
    }
    load()
  }, [token])

  if (error) {
    return (
      <div className="min-h-screen bg-warm-50 flex items-center justify-center p-6">
        <p className="text-charcoal-500 text-sm">{error}</p>
      </div>
    )
  }

  if (!info) {
    return (
      <div className="min-h-screen bg-warm-50 flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-od-green border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-warm-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-6">
          <h1 className="font-serif text-2xl text-od-green mb-2">Your Signed Consent Form</h1>
          <p className="text-charcoal-500 text-sm mb-1">{info.shopName} · v{info.templateVersion}</p>
          <p className="text-charcoal-500 text-sm">Signed {new Date(info.signedAt).toLocaleString()}</p>
        </div>
        <div className="bg-white border border-warm-200 rounded-xl overflow-hidden mb-6">
          <object
            data={info.signedUrl}
            type="application/pdf"
            className="w-full h-[70vh]"
          >
            <div className="p-8 text-center">
              <p className="text-charcoal-700 mb-4">Unable to display PDF inline.</p>
              <a href={info.signedUrl} className="underline text-od-green">Open PDF</a>
            </div>
          </object>
        </div>
        <p className="text-charcoal-400 text-xs text-center">This link expires after 15 minutes. Save this page's URL to return later.</p>
      </div>
    </div>
  )
}
