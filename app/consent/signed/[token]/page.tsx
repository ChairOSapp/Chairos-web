'use client'
import { useEffect, useState, use as usePromise } from 'react'
import Link from 'next/link'

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
  const [emailState, setEmailState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [emailMsg, setEmailMsg] = useState('')

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/consent/signed/${token}`)
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Not found'); return }
      setInfo(data)
    }
    load()
  }, [token])

  async function emailCopy() {
    setEmailState('sending')
    setEmailMsg('')
    try {
      const res = await fetch(`/api/consent/signed/${token}/email`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setEmailState('idle')
        setEmailMsg(data.error || 'Could not send the email')
        return
      }
      setEmailState('sent')
      setEmailMsg(`Sent to ${data.maskedEmail}`)
    } catch {
      setEmailState('idle')
      setEmailMsg('Could not send the email. Check your connection and try again.')
    }
  }

  if (error) {
    return (
      <div className="min-h-screen bg-warm-50 flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-charcoal-500 text-sm max-w-sm mb-6">{error}</p>
          <Link href="/my" className="btn-chairos inline-block">Back to home</Link>
        </div>
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

        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-4">
          <button
            onClick={() => window.open(info.signedUrl, '_blank')}
            className="btn-chairos"
          >
            Print or save a copy
          </button>
          <button
            onClick={emailCopy}
            disabled={emailState !== 'idle'}
            className="btn-chairos-outline disabled:opacity-50"
          >
            {emailState === 'sending' ? 'Sending…' : emailState === 'sent' ? 'Emailed ✓' : 'Email it to me'}
          </button>
          <Link href="/my" className="btn-chairos-outline inline-block text-center">
            Back to home
          </Link>
        </div>
        {emailMsg && (
          <p className={`text-sm text-center mb-4 ${emailState === 'sent' ? 'text-od-green' : 'text-red-500'}`}>
            {emailMsg}
          </p>
        )}

        <p className="text-charcoal-400 text-xs text-center">The PDF link above refreshes each time you open this page. Bookmark this page to come back to your form.</p>
      </div>
    </div>
  )
}
