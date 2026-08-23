'use client'
import { useEffect, useRef, useState, use as usePromise } from 'react'
import Link from 'next/link'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { createClient } from '@/lib/supabase'
import SignaturePad, { SignaturePadHandle } from '@/components/consent/SignaturePad'

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

interface TemplateInfo {
  alreadySigned: boolean
  accessToken?: string
  templateId?: string
  version?: number
  signedUrl?: string
  shopName?: string
  clientName?: string
}

export default function ConsentSigningPage({ params }: { params: Promise<{ appointmentId: string }> }) {
  const { appointmentId } = usePromise(params)
  const [info, setInfo] = useState<TemplateInfo | null>(null)
  const [loadError, setLoadError] = useState('')
  const [numPages, setNumPages] = useState(0)
  const [reachedEnd, setReachedEnd] = useState(false)
  const [typedName, setTypedName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [result, setResult] = useState<{ accessToken: string } | null>(null)
  const sigPadRef = useRef<SignaturePadHandle>(null)
  const supabase = createClient()
  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/consent/template?appointmentId=${appointmentId}`)
      const data = await res.json()
      if (!res.ok) { setLoadError(data.error || 'Could not load consent form'); return }
      setInfo(data)
      if (data.clientName) setTypedName(data.clientName)
    }
    load()
  }, [appointmentId])

  async function handleSubmit() {
    setSubmitError('')
    if (!typedName.trim()) { setSubmitError('Please type your full name'); return }
    if (!sigPadRef.current || sigPadRef.current.isEmpty()) { setSubmitError('Please draw your signature'); return }
    if (!reachedEnd) { setSubmitError('Please scroll through the full document before signing'); return }

    const signatureImageDataUrl = sigPadRef.current.toPngDataUrl()
    if (!signatureImageDataUrl) { setSubmitError('Please draw your signature'); return }

    setSubmitting(true)
    const { data, error } = await supabase.functions.invoke('sign-consent-form', {
      body: {
        appointmentId,
        templateId: info?.templateId,
        typedName: typedName.trim(),
        signatureImageDataUrl,
        signedDate: today,
      },
    })
    setSubmitting(false)
    if (error || data?.error) {
      setSubmitError(data?.error || error?.message || 'Failed to submit signature')
      return
    }
    setResult({ accessToken: data.accessToken })
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-warm-50 flex items-center justify-center p-6">
        <p className="text-charcoal-500 text-sm max-w-sm text-center">{loadError}</p>
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

  if (info.alreadySigned || result) {
    const accessToken = result?.accessToken || info.accessToken
    return (
      <div className="min-h-screen bg-warm-50 flex items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <h1 className="font-serif text-2xl text-od-green mb-3">Signed</h1>
          <p className="text-charcoal-500 text-sm mb-6">This consent form has already been signed.</p>
          {accessToken && (
            <Link href={`/consent/signed/${accessToken}`} className="text-od-green underline text-sm">
              View your signed copy
            </Link>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-warm-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="font-serif text-2xl text-charcoal-900 mb-1">Consent Form — {info.shopName}</h1>
        <p className="text-charcoal-500 text-sm mb-6">Please read the full document, then sign below.</p>

        <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden mb-6">
          <div
            className="max-h-[60vh] overflow-y-auto p-4"
            onScroll={e => {
              const el = e.currentTarget
              if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setReachedEnd(true)
            }}
          >
            <Document
              file={info.signedUrl}
              onLoadSuccess={({ numPages }) => {
                setNumPages(numPages)
                if (numPages <= 1) setReachedEnd(true)
              }}
              onLoadError={() => setLoadError('Could not render the consent form PDF')}
              loading={<div className="text-charcoal-500 text-sm py-8 text-center">Loading document…</div>}
            >
              {Array.from({ length: numPages }, (_, i) => (
                <Page key={i} pageNumber={i + 1} width={600} className="mb-3" renderAnnotationLayer={false} />
              ))}
            </Document>
          </div>
          {!reachedEnd && numPages > 1 && (
            <div className="px-4 py-2 text-xs text-charcoal-500 bg-warm-200 border-t border-warm-200">
              Scroll to the bottom to continue
            </div>
          )}
        </div>

        <div className="bg-warm-100 border border-warm-200 rounded-xl p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Full Legal Name</label>
            <input
              value={typedName}
              onChange={e => setTypedName(e.target.value)}
              placeholder="Type your full name"
              className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Signature</label>
            <SignaturePad ref={sigPadRef} />
          </div>
          <div className="text-xs text-charcoal-500">Date: {today}</div>

          {submitError && <p className="text-red-400 text-sm bg-red-950 border border-red-900 rounded-lg p-3">{submitError}</p>}

          <button
            onClick={handleSubmit}
            disabled={submitting || !reachedEnd}
            className="w-full bg-od-green hover:bg-od-green-light text-white font-semibold py-3 rounded-lg text-sm disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Submitting…' : 'I Agree and Sign'}
          </button>
        </div>
      </div>
    </div>
  )
}
