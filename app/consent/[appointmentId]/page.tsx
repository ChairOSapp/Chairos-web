'use client'
import { useEffect, useRef, useState, use as usePromise } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import SignaturePad, { SignaturePadHandle } from '@/components/consent/SignaturePad'
import {
  buildConsentSections, fieldInputs,
  SIGNING_FIELDS, type ConsentSection, type Vertical,
} from '@/lib/consent/rules'

interface BuilderSpec {
  stateCode: string
  vertical: Vertical
  options: { photoRelease: boolean; chemicalServices: boolean; straightRazor: boolean }
}

interface TemplateInfo {
  alreadySigned: boolean
  accessToken?: string
  templateId?: string
  version?: number
  vertical?: string | null
  builderSpec?: BuilderSpec | null
  signedUrl?: string
  shopName?: string
  clientName?: string
  clientPhone?: string | null
  clientEmail?: string | null
  signingToken?: string
}

const inputCls = "w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green"

export default function ConsentSigningPage({ params }: { params: Promise<{ appointmentId: string }> }) {
  const { appointmentId } = usePromise(params)
  const [info, setInfo] = useState<TemplateInfo | null>(null)
  const [loadError, setLoadError] = useState('')
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/consent/template?appointmentId=${appointmentId}`)
      const data = await res.json()
      if (!res.ok) { setLoadError(data.error || 'Could not load consent form'); return }
      setInfo(data)
    }
    load()
  }, [appointmentId])

  if (loadError) {
    return (
      <div className="min-h-screen bg-warm-50 flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-charcoal-500 text-sm max-w-sm mb-6">{loadError}</p>
          <button onClick={() => window.history.back()} className="btn-chairos">← Go back</button>
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

  if (info.builderSpec) {
    return <BuilderSigningForm info={info} appointmentId={appointmentId} />
  }
  return <LegacySigningForm info={info} appointmentId={appointmentId} />
}

// ── Native form signing (builder-generated templates) ────────────────
// The client fills out the actual form on their device. On submit the
// finished PDF is generated server-side with their answers + signatures.

function BuilderSigningForm({ info, appointmentId }: { info: TemplateInfo; appointmentId: string }) {
  const spec = info.builderSpec!
  const sections = buildConsentSections(spec.stateCode, spec.vertical, spec.options)
  const [answers, setAnswers] = useState<Record<string, string>>(() => ({
    [SIGNING_FIELDS.clientName]: info.clientName || '',
    [SIGNING_FIELDS.clientPhone]: info.clientPhone || '',
    [SIGNING_FIELDS.clientEmail]: info.clientEmail || '',
  }))
  const [checked, setChecked] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [result, setResult] = useState<{ accessToken: string } | null>(null)
  const sigPads = useRef<Record<string, SignaturePadHandle | null>>({})
  const supabase = createClient()
  const today = new Date().toISOString().slice(0, 10)

  const setAnswer = (key: string, value: string) =>
    setAnswers(prev => ({ ...prev, [key]: value }))

  const toggleCheck = (label: string) =>
    setChecked(prev => prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label])

  function validate(): string | null {
    if (!answers[SIGNING_FIELDS.clientName]?.trim()) return 'Please enter your full legal name'
    if (spec.vertical === 'tattoo' && !answers[SIGNING_FIELDS.clientDOB]) {
      return 'Date of birth is required for tattoo consent'
    }
    for (const s of sections) {
      if (s.attestation) {
        for (const c of s.checkboxes || []) {
          if (!checked.includes(c)) return `Please confirm: "${c.slice(0, 60)}${c.length > 60 ? '…' : ''}"`
        }
      }
    }
    const clientPad = sigPads.current[SIGNING_FIELDS.clientSignature]
    if (!clientPad || clientPad.isEmpty()) return 'Please draw your signature'
    return null
  }

  async function handleSubmit() {
    setSubmitError('')
    const err = validate()
    if (err) { setSubmitError(err); return }

    const clientSig = sigPads.current[SIGNING_FIELDS.clientSignature]?.toPngDataUrl()
    if (!clientSig) { setSubmitError('Please draw your signature'); return }
    const artistPad = sigPads.current[SIGNING_FIELDS.artistSignature]
    const artistSig = artistPad && !artistPad.isEmpty() ? artistPad.toPngDataUrl() : null

    setSubmitting(true)
    const { data, error } = await supabase.functions.invoke('sign-consent-form', {
      body: {
        appointmentId,
        templateId: info.templateId,
        signingToken: info.signingToken,
        mode: 'builder',
        builderSpec: spec,
        answers,
        checkedLabels: checked,
        clientSignatureImageDataUrl: clientSig,
        artistSignatureImageDataUrl: artistSig || undefined,
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

  if (info.alreadySigned || result) {
    const accessToken = result?.accessToken || info.accessToken
    return (
      <div className="min-h-screen bg-warm-50 flex items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <h1 className="font-serif text-2xl text-od-green mb-3">Signed</h1>
          <p className="text-charcoal-500 text-sm mb-6">This consent form has already been signed.</p>
          {accessToken && (
            <Link href={`/consent/signed/${accessToken}`} className="text-od-green underline text-sm block mb-6">
              View your signed copy
            </Link>
          )}
          <button onClick={() => window.history.back()} className="btn-chairos-outline">← Back</button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-warm-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <button onClick={() => window.history.back()} className="text-charcoal-500 text-sm mb-4">← Back</button>
        <h1 className="font-serif text-2xl text-charcoal-900 mb-1">Consent Form — {info.shopName}</h1>
        <p className="text-charcoal-500 text-sm mb-6">Fill out the form below, then sign. Your answers go directly onto the finished document.</p>

        {sections.map((s, si) => (
          <SectionCard key={s.id} section={s} index={si + 1}>
            {s.paragraphs.map((p, i) => (
              <p key={i} className="text-charcoal-700 text-sm mb-2">{p}</p>
            ))}
            {(s.checkboxes || []).length > 0 && (
              <div className="space-y-2 my-3">
                {s.checkboxes!.map(c => (
                  <label key={c} className="flex items-start gap-3 p-3 bg-white border border-warm-200 rounded-lg cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked.includes(c)}
                      onChange={() => toggleCheck(c)}
                      className="mt-1 h-4 w-4 accent-[#5B6630]"
                    />
                    <span className="text-sm text-charcoal-800">{c}</span>
                  </label>
                ))}
              </div>
            )}
            {(s.fields || []).map((f, fi) => (
              <FieldRow
                key={fi}
                field={f}
                answers={answers}
                setAnswer={setAnswer}
                sigPads={sigPads}
                dobRequired={spec.vertical === 'tattoo'}
              />
            ))}
          </SectionCard>
        ))}

        {submitError && <p className="text-red-400 text-sm bg-red-950 border border-red-900 rounded-lg p-3 mb-4">{submitError}</p>}

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full bg-od-green hover:bg-od-green-light text-white font-semibold py-3 rounded-lg text-sm disabled:opacity-50 transition-colors"
        >
          {submitting ? 'Submitting…' : 'I Agree and Sign'}
        </button>
        <p className="text-charcoal-400 text-xs text-center mt-3">
          By signing you confirm the information above is accurate.
        </p>
      </div>
    </div>
  )
}

function SectionCard({ section, index, children }: { section: ConsentSection; index: number; children: React.ReactNode }) {
  return (
    <div className="bg-warm-100 border border-warm-200 rounded-xl p-5 mb-4">
      <div className="text-xs font-semibold tracking-widest uppercase text-od-green mb-3">
        {index} · {section.title}
      </div>
      {children}
    </div>
  )
}

function FieldRow({ field, answers, setAnswer, sigPads, dobRequired }: {
  field: string
  answers: Record<string, string>
  setAnswer: (key: string, value: string) => void
  sigPads: React.RefObject<Record<string, SignaturePadHandle | null>>
  dobRequired: boolean
}) {
  // Notes (not fill-in lines) render as plain text.
  if (!field.trim().endsWith(':')) {
    return <p className="text-xs text-charcoal-400 mb-2">{field}</p>
  }
  const inputs = fieldInputs(field).filter(inp =>
    // Dates are stamped at signing time, not typed.
    inp.key !== SIGNING_FIELDS.clientDate && inp.key !== SIGNING_FIELDS.artistDate
  )
  if (inputs.length === 0) return null
  return (
    <div className={`grid gap-3 my-3 ${inputs.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {inputs.map(inp => (
        <div key={inp.key} className={inp.signature ? 'col-span-2' : ''}>
          <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">
            {inp.label}
            {inp.key === SIGNING_FIELDS.clientName && ' *'}
            {inp.key === SIGNING_FIELDS.clientDOB && dobRequired && ' *'}
          </label>
          {inp.signature ? (
            <SignaturePad ref={el => { sigPads.current[inp.key] = el }} />
          ) : (
            <input
              type={inp.type}
              value={answers[inp.key] || ''}
              onChange={e => setAnswer(inp.key, e.target.value)}
              className={inputCls}
            />
          )}
        </div>
      ))}
    </div>
  )
}

// ── Legacy flow (shop-uploaded PDFs): PDF viewer + name/signature ────

function LegacySigningForm({ info, appointmentId }: { info: TemplateInfo; appointmentId: string }) {
  const [numPages] = useState(0)
  const [reachedEnd, setReachedEnd] = useState(true)
  const [typedName, setTypedName] = useState(info.clientName || '')
  const [dob, setDob] = useState('')
  const [phone, setPhone] = useState(info.clientPhone || '')
  const [email, setEmail] = useState(info.clientEmail || '')
  const [artistName, setArtistName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [result, setResult] = useState<{ accessToken: string } | null>(null)
  const sigPadRef = useRef<SignaturePadHandle>(null)
  const artistSigPadRef = useRef<SignaturePadHandle>(null)
  const supabase = createClient()
  const today = new Date().toISOString().slice(0, 10)
  void numPages

  async function handleSubmit() {
    setSubmitError('')
    if (!typedName.trim()) { setSubmitError('Please type your full name'); return }
    if (info?.vertical === 'tattoo' && !dob) { setSubmitError('Date of birth is required for tattoo consent'); return }
    if (dob && !/^\d{4}-\d{2}-\d{2}$/.test(dob)) { setSubmitError('Please enter a valid date of birth'); return }
    if (!sigPadRef.current || sigPadRef.current.isEmpty()) { setSubmitError('Please draw your signature'); return }
    if (!reachedEnd) { setSubmitError('Please scroll through the full document before signing'); return }

    const signatureImageDataUrl = sigPadRef.current.toPngDataUrl()
    if (!signatureImageDataUrl) { setSubmitError('Please draw your signature'); return }

    setSubmitting(true)
    let artistSignatureImageDataUrl: string | null = null
    if (artistSigPadRef.current && !artistSigPadRef.current.isEmpty()) {
      artistSignatureImageDataUrl = artistSigPadRef.current.toPngDataUrl()
    }

    const { data, error } = await supabase.functions.invoke('sign-consent-form', {
      body: {
        appointmentId,
        templateId: info?.templateId,
        signingToken: info?.signingToken,
        mode: 'legacy',
        typedName: typedName.trim(),
        clientInfo: {
          dob: dob || undefined,
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
        },
        signatureImageDataUrl,
        signedDate: today,
        artistName: artistName.trim() || undefined,
        artistSignatureImageDataUrl: artistSignatureImageDataUrl || undefined,
      },
    })
    setSubmitting(false)
    if (error || data?.error) {
      setSubmitError(data?.error || error?.message || 'Failed to submit signature')
      return
    }
    setResult({ accessToken: data.accessToken })
  }

  if (info.alreadySigned || result) {
    const accessToken = result?.accessToken || info.accessToken
    return (
      <div className="min-h-screen bg-warm-50 flex items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <h1 className="font-serif text-2xl text-od-green mb-3">Signed</h1>
          <p className="text-charcoal-500 text-sm mb-6">This consent form has already been signed.</p>
          {accessToken && (
            <Link href={`/consent/signed/${accessToken}`} className="text-od-green underline text-sm block mb-6">
              View your signed copy
            </Link>
          )}
          <button onClick={() => window.history.back()} className="btn-chairos-outline">← Back</button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-warm-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <button onClick={() => window.history.back()} className="text-charcoal-500 text-sm mb-4">← Back</button>
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
            <object data={info.signedUrl} type="application/pdf" className="w-full h-[600px] bg-white">
              <div className="p-8 text-center">
                <p className="text-charcoal-700 mb-4">Unable to display PDF. <a href={info.signedUrl} className="underline">Open it here</a>.</p>
              </div>
            </object>
          </div>
        </div>

        <div className="bg-warm-100 border border-warm-200 rounded-xl p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Full Legal Name</label>
            <input value={typedName} onChange={e => setTypedName(e.target.value)} placeholder="Type your full name" className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Date of Birth{info.vertical === 'tattoo' ? ' *' : ''}</label>
              <input type="date" value={dob} onChange={e => setDob(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Phone</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 123-4567" className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Signature</label>
            <SignaturePad ref={sigPadRef} />
          </div>
          <div className="text-xs text-charcoal-500">Date: {today}</div>

          <div className="pt-4 border-t border-warm-200">
            <div className="text-sm font-semibold text-charcoal-900 mb-3">Artist Signature (optional)</div>
            <div>
              <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Artist Name</label>
              <input value={artistName} onChange={e => setArtistName(e.target.value)} placeholder="Artist name" className={inputCls} />
            </div>
            <div className="mt-3">
              <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Artist Signature</label>
              <SignaturePad ref={artistSigPadRef} />
            </div>
          </div>

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
