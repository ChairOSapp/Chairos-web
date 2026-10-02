'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import OwnerNav from '@/components/OwnerNav'
import MobileNav from '@/components/MobileNav'
import {
  STATES, VERTICAL_LABELS, stateSummary,
  type Vertical,
} from '@/lib/consent/rules'

type Step = 'state' | 'vertical' | 'options'

export default function ConsentBuilderPage() {
  const [shop, setShop] = useState<any>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState<Step>('state')
  const [stateCode, setStateCode] = useState('')
  const [vertical, setVertical] = useState<Vertical | null>(null)
  const [photoRelease, setPhotoRelease] = useState(false)
  const [chemicalServices, setChemicalServices] = useState(false)
  const [straightRazor, setStraightRazor] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [doneVersion, setDoneVersion] = useState<number | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUserId(user.id)
      const { data: shops } = await supabase
        .from('shops').select('*').eq('owner_id', user.id)
        .order('created_at', { ascending: true }).limit(1)
      const s = shops?.[0] || null
      if (!s) { router.push('/onboarding'); return }
      setShop(s)
      setLoading(false)
    })()
  }, [])

  async function handleGenerate() {
    if (!vertical || !stateCode) return
    setGenerating(true)
    setError('')
    try {
      const res = await fetch('/api/consent/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stateCode,
          vertical,
          options: { photoRelease, chemicalServices, straightRazor },
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Could not generate the form.')
        setGenerating(false)
        return
      }
      fetch('/api/audit/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopId: shop.id, action: 'consent_template.generated',
          entityType: 'consent_form_template', entityId: data.templateId,
          metadata: { version: data.version, stateCode, vertical, builder: true },
        }),
      }).catch(() => {})
      setDoneVersion(data.version)
    } catch {
      setError('Network error. Please try again.')
    }
    setGenerating(false)
  }

  if (loading) return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center">
      <div className="text-od-green text-sm">Loading...</div>
    </div>
  )

  const initials = shop?.name?.split(' ').map((w: string) => w[0]).join('').substring(0, 2).toUpperCase() || 'CH'
  const summary = stateCode && vertical ? stateSummary(stateCode, vertical) : []

  return (
    <div className="min-h-screen bg-warm-50">
      <OwnerNav shopName={shop?.name} ownerName={''} initials={initials} userId={userId || undefined} />

      <div className="p-6 max-w-2xl mx-auto md:pb-0">
        <button onClick={() => router.push('/dashboard/consent')} className="text-charcoal-500 text-sm mb-4">
          ← Back to Consent Forms
        </button>
        <h1 className="font-serif text-2xl text-charcoal-900 mb-1">Build a consent form</h1>
        <p className="text-charcoal-500 text-sm mb-8">
          Pick your state and what you do — ChairOS builds the form with that state's legal minimum baked in.
          Not legal advice; have it reviewed by counsel before use.
        </p>

        {error && <p className="text-red-400 text-sm bg-red-950 border border-red-900 rounded-lg p-3 mb-6">{error}</p>}

        {doneVersion !== null ? (
          <div className="bg-warm-100 border border-warm-200 rounded-xl p-6 text-center">
            <div className="text-4xl mb-3">✅</div>
            <div className="font-serif text-lg text-charcoal-900 mb-1">Version {doneVersion} is live</div>
            <p className="text-charcoal-500 text-sm mb-5">
              Your generated form is now the active template. Clients signing from here on use this version.
            </p>
            <button onClick={() => router.push('/dashboard/consent')} className="btn-chairos">
              Back to Consent Forms
            </button>
          </div>
        ) : (
          <>
            {/* Step 1 — state */}
            <div className="bg-warm-100 border border-warm-200 rounded-xl p-5 mb-4">
              <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500 mb-3">
                1 · Your state
              </div>
              <select
                value={stateCode}
                onChange={(e) => { setStateCode(e.target.value); setStep(e.target.value ? 'vertical' : 'state') }}
                className="w-full px-4 py-3 bg-white border border-warm-300 rounded-lg text-charcoal-900 text-sm"
              >
                <option value="">Select a state…</option>
                {STATES.map(s => (
                  <option key={s.code} value={s.code}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* Step 2 — vertical */}
            {step !== 'state' && (
              <div className="bg-warm-100 border border-warm-200 rounded-xl p-5 mb-4">
                <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500 mb-3">
                  2 · What you do
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(VERTICAL_LABELS) as Vertical[]).map(v => (
                    <button
                      key={v}
                      onClick={() => { setVertical(v); setStep('options') }}
                      className={`px-3 py-4 rounded-lg border text-sm font-semibold transition-colors ${
                        vertical === v
                          ? 'bg-od-green text-white border-od-green'
                          : 'bg-white text-charcoal-700 border-warm-300 hover:border-charcoal-400'
                      }`}
                    >
                      {VERTICAL_LABELS[v]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 3 — options */}
            {step === 'options' && vertical && (
              <div className="bg-warm-100 border border-warm-200 rounded-xl p-5 mb-4">
                <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500 mb-3">
                  3 · What's in the form
                </div>

                <div className="bg-white/60 border border-warm-200 rounded-lg p-4 mb-4">
                  <div className="text-xs font-semibold text-charcoal-700 mb-2">
                    🔒 Locked in by {STATES.find(s => s.code === stateCode)?.name} law
                  </div>
                  <ul className="text-xs text-charcoal-500 space-y-1">
                    {summary.map((s, i) => <li key={i}>· {s}</li>)}
                  </ul>
                  <p className="text-xs text-charcoal-400 mt-2">
                    Identity, health screening, risk acknowledgment, permanence, aftercare, and signatures are always included{vertical === 'tattoo' ? ' for tattoo' : ''}.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="flex items-start gap-3 p-3 bg-white border border-warm-200 rounded-lg cursor-pointer">
                    <input type="checkbox" checked={photoRelease} onChange={(e) => setPhotoRelease(e.target.checked)} className="mt-1" />
                    <span>
                      <span className="block text-sm font-semibold text-charcoal-900">Photo / video release</span>
                      <span className="block text-xs text-charcoal-500">Optional opt-in for shop marketing. Never pre-checked.</span>
                    </span>
                  </label>
                  {vertical === 'salon' && (
                    <label className="flex items-start gap-3 p-3 bg-white border border-warm-200 rounded-lg cursor-pointer">
                      <input type="checkbox" checked={chemicalServices} onChange={(e) => setChemicalServices(e.target.checked)} className="mt-1" />
                      <span>
                        <span className="block text-sm font-semibold text-charcoal-900">Chemical services section</span>
                        <span className="block text-xs text-charcoal-500">Patch-test acknowledgment, prior chemical history, allergy waiver.</span>
                      </span>
                    </label>
                  )}
                  {vertical === 'barber' && (
                    <label className="flex items-start gap-3 p-3 bg-white border border-warm-200 rounded-lg cursor-pointer">
                      <input type="checkbox" checked={straightRazor} onChange={(e) => setStraightRazor(e.target.checked)} className="mt-1" />
                      <span>
                        <span className="block text-sm font-semibold text-charcoal-900">Straight-razor acknowledgment</span>
                        <span className="block text-xs text-charcoal-500">Nick/irritation disclosure for hot-towel shaves.</span>
                      </span>
                    </label>
                  )}
                </div>

                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="btn-chairos w-full mt-5 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {generating ? 'Building your form…' : 'Generate & activate form'}
                </button>
                <p className="text-xs text-charcoal-500 mt-2 text-center">
                  This creates a new version and makes it the active template, like an upload.
                </p>
              </div>
            )}
          </>
        )}
      </div>

      <MobileNav />
    </div>
  )
}
