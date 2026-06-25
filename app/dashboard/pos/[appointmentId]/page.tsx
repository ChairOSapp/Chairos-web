'use client'
import { useEffect, useState, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'

const TIP_PRESETS = [
  { label: '15%', pct: 0.15 },
  { label: '20%', pct: 0.20 },
  { label: '25%', pct: 0.25 },
  { label: 'No tip', pct: 0 },
]

type Mode = 'card-on-file' | 'manual' | 'no-card'

export default function POSCheckout() {
  const { appointmentId } = useParams() as { appointmentId: string }
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [appt, setAppt] = useState<any>(null)
  const [client, setClient] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Tip
  const [tipPreset, setTipPreset] = useState<number | null>(0.20)
  const [customTip, setCustomTip] = useState('')
  const [useCustomTip, setUseCustomTip] = useState(false)

  // Payment mode
  const [mode, setMode] = useState<Mode>('no-card')

  // Card form (manual entry)
  const squareCardRef = useRef<any>(null)
  const [cardReady, setCardReady] = useState(false)
  const [cardLoading, setCardLoading] = useState(false)

  // Save card toggle (when mode = manual)
  const [saveCard, setSaveCard] = useState(false)

  // Processing
  const [processing, setProcessing] = useState(false)
  const [success, setSuccess] = useState(false)
  const [receiptData, setReceiptData] = useState<any>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: apptData } = await supabase
        .from('appointments')
        .select('*, services(name, price)')
        .eq('id', appointmentId)
        .maybeSingle()

      if (!apptData) { setError('Appointment not found'); setLoading(false); return }
      if (apptData.payment_status === 'paid') { setError('This appointment is already checked out'); setLoading(false); return }
      setAppt(apptData)

      if (apptData.client_id) {
        const { data: clientData } = await supabase
          .from('clients')
          .select('id, full_name, square_customer_id, square_card_id, square_card_brand, square_card_last4')
          .eq('id', apptData.client_id)
          .maybeSingle()
        setClient(clientData)
        if (clientData?.square_card_id) setMode('card-on-file')
        else setMode('manual')
      } else {
        setMode('manual')
      }

      setLoading(false)
    }
    load()
  }, [appointmentId])

  // Initialize Square card form when mode = manual
  useEffect(() => {
    if (mode !== 'manual') {
      if (squareCardRef.current) {
        squareCardRef.current.destroy?.().catch(() => {})
        squareCardRef.current = null
        setCardReady(false)
      }
      return
    }
    if (squareCardRef.current) return

    const appId = process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID
    const locationId = process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID
    if (!appId || !locationId) return

    setCardLoading(true)
    let mounted = true

    async function init() {
      try {
        const { payments } = await import('@square/web-sdk')
        if (!mounted) return
        const p = await payments(appId!, locationId!)
        if (!mounted) return
        if (!p) throw new Error('Square payments SDK failed to initialize')
        const card = await p.card()
        if (!mounted) return
        await card.attach('#pos-card-container')
        if (!mounted) return
        squareCardRef.current = card
        setCardReady(true)
      } catch (e: any) {
        if (!mounted) return
        setError('Card form failed to load')
      } finally {
        if (mounted) setCardLoading(false)
      }
    }
    init()

    return () => {
      mounted = false
      if (squareCardRef.current) {
        squareCardRef.current.destroy?.().catch(() => {})
        squareCardRef.current = null
        setCardReady(false)
      }
    }
  }, [mode])

  const servicePrice = parseFloat(String(appt?.price || 0)) || 0

  const tipAmount = useCustomTip
    ? (parseFloat(customTip) || 0)
    : (tipPreset !== null ? Math.round(servicePrice * tipPreset * 100) / 100 : 0)

  const total = servicePrice + tipAmount

  async function handleCheckout() {
    setError('')
    setProcessing(true)

    let sourceId: string | undefined

    if (mode === 'manual') {
      if (!squareCardRef.current) { setError('Card form not ready'); setProcessing(false); return }
      const result = await squareCardRef.current.tokenize()
      if (result.status !== 'OK') {
        setError(result.errors?.[0]?.message || 'Card error')
        setProcessing(false)
        return
      }
      sourceId = result.token
    }

    try {
      const res = await fetch('/api/square/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointmentId,
          tipAmount,
          sourceId: mode === 'manual' ? sourceId : undefined,
          useCardOnFile: mode === 'card-on-file',
          saveCard: mode === 'manual' ? saveCard : false,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Checkout failed')

      setReceiptData({ total: json.total, tip: tipAmount, service: servicePrice, cardSaved: json.cardSaved })
      setSuccess(true)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setProcessing(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-charcoal-950 flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-2 border-od-green border-t-transparent animate-spin" />
    </div>
  )

  if (error && !appt) return (
    <div className="min-h-screen bg-charcoal-950 flex items-center justify-center p-6">
      <div className="text-center">
        <p className="text-red-400 text-sm mb-4">{error}</p>
        <button onClick={() => router.back()} className="text-od-green text-sm font-semibold">← Go back</button>
      </div>
    </div>
  )

  if (success && receiptData) return (
    <div className="min-h-screen bg-charcoal-950 flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-od-green/10 border border-od-green/30 flex items-center justify-center mx-auto mb-4">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#4B5320" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div className="font-serif text-3xl text-white mb-1">Payment complete</div>
          <div className="text-charcoal-400 text-sm">{appt?.client_name}</div>
        </div>

        <div className="bg-charcoal-900 border border-charcoal-700 rounded-2xl p-5 mb-6 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-charcoal-400">Service</span>
            <span className="text-white font-mono">${receiptData.service.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-charcoal-400">Tip</span>
            <span className="text-white font-mono">${receiptData.tip.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm border-t border-charcoal-700 pt-3">
            <span className="text-white font-semibold">Total</span>
            <span className="text-od-green font-serif text-xl">${receiptData.total.toFixed(2)}</span>
          </div>
          {receiptData.cardSaved && (
            <div className="text-xs text-od-green/70 pt-1 text-center">Card saved for future visits</div>
          )}
        </div>

        <div className="space-y-2">
          <button
            onClick={() => router.push('/dashboard/calendar')}
            className="w-full bg-od-green text-black font-semibold py-3 rounded-xl text-sm hover:bg-od-green-light transition-colors"
          >
            Back to calendar
          </button>
          <button
            onClick={() => router.push('/dashboard')}
            className="w-full bg-charcoal-800 text-charcoal-300 font-semibold py-3 rounded-xl text-sm hover:bg-charcoal-700 transition-colors"
          >
            Dashboard
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-charcoal-950 p-5 pb-10">
      <div className="max-w-sm mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-7 pt-2">
          <button onClick={() => router.back()} className="w-8 h-8 flex items-center justify-center text-charcoal-400 hover:text-white transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          </button>
          <div>
            <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500">Checkout</div>
            <div className="font-serif text-lg text-white leading-tight">{appt?.client_name}</div>
          </div>
        </div>

        {/* Service summary */}
        <div className="bg-charcoal-900 border border-charcoal-700 rounded-2xl p-5 mb-5">
          <div className="flex justify-between items-start mb-1">
            <div>
              <div className="text-white font-semibold text-sm">{appt?.services?.name || 'Service'}</div>
              {client && <div className="text-xs text-charcoal-400 mt-0.5">{client.full_name}</div>}
            </div>
            <div className="font-serif text-2xl text-white">${servicePrice.toFixed(2)}</div>
          </div>
          {client?.square_card_last4 && (
            <div className="mt-3 pt-3 border-t border-charcoal-700 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-od-green" />
              <span className="text-xs text-charcoal-400">Card on file: {client.square_card_brand} •••• {client.square_card_last4}</span>
            </div>
          )}
        </div>

        {/* Tip selector */}
        <div className="mb-5">
          <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500 mb-3">Tip</div>
          <div className="grid grid-cols-4 gap-2 mb-3">
            {TIP_PRESETS.map(p => (
              <button
                key={p.label}
                onClick={() => { setTipPreset(p.pct); setUseCustomTip(false) }}
                className={`py-3 rounded-xl text-sm font-semibold transition-colors ${
                  !useCustomTip && tipPreset === p.pct
                    ? 'bg-od-green text-black'
                    : 'bg-charcoal-800 text-charcoal-300 hover:bg-charcoal-700'
                }`}
              >
                {p.label}
                {p.pct > 0 && !useCustomTip && tipPreset === p.pct && (
                  <div className="text-[10px] font-normal opacity-70">${(servicePrice * p.pct).toFixed(2)}</div>
                )}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setUseCustomTip(v => !v)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                useCustomTip ? 'bg-od-green/20 text-od-green' : 'text-charcoal-400 hover:text-charcoal-200'
              }`}
            >
              Custom amount
            </button>
            {useCustomTip && (
              <div className="flex-1 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-400 text-sm">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={customTip}
                  onChange={e => setCustomTip(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-charcoal-800 border border-charcoal-600 rounded-lg pl-7 pr-3 py-2 text-sm text-white outline-none focus:border-od-green transition-colors"
                  autoFocus
                />
              </div>
            )}
          </div>
        </div>

        {/* Total */}
        <div className="bg-charcoal-900 border border-charcoal-700 rounded-2xl p-5 mb-5">
          <div className="flex justify-between items-center mb-2 text-sm text-charcoal-400">
            <span>Service</span><span className="font-mono">${servicePrice.toFixed(2)}</span>
          </div>
          <div className="flex justify-between items-center mb-3 text-sm text-charcoal-400">
            <span>Tip</span><span className="font-mono">${tipAmount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between items-center pt-3 border-t border-charcoal-700">
            <span className="text-white font-semibold">Total</span>
            <span className="font-serif text-3xl text-od-green">${total.toFixed(2)}</span>
          </div>
        </div>

        {/* Payment method */}
        <div className="mb-5">
          <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500 mb-3">Payment method</div>
          <div className="space-y-2">
            {client?.square_card_id && (
              <button
                onClick={() => setMode('card-on-file')}
                className={`w-full flex items-center gap-3 p-4 rounded-xl border transition-colors text-left ${
                  mode === 'card-on-file'
                    ? 'bg-od-green/10 border-od-green/40 text-od-green'
                    : 'bg-charcoal-800 border-charcoal-700 text-charcoal-300 hover:border-charcoal-500'
                }`}
              >
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${mode === 'card-on-file' ? 'border-od-green' : 'border-charcoal-500'}`}>
                  {mode === 'card-on-file' && <div className="w-2 h-2 rounded-full bg-od-green" />}
                </div>
                <div>
                  <div className="text-sm font-semibold">Card on file</div>
                  <div className="text-xs opacity-70">{client.square_card_brand} •••• {client.square_card_last4}</div>
                </div>
              </button>
            )}
            <button
              onClick={() => setMode('manual')}
              className={`w-full flex items-center gap-3 p-4 rounded-xl border transition-colors text-left ${
                mode === 'manual'
                  ? 'bg-od-green/10 border-od-green/40 text-od-green'
                  : 'bg-charcoal-800 border-charcoal-700 text-charcoal-300 hover:border-charcoal-500'
              }`}
            >
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${mode === 'manual' ? 'border-od-green' : 'border-charcoal-500'}`}>
                {mode === 'manual' && <div className="w-2 h-2 rounded-full bg-od-green" />}
              </div>
              <div>
                <div className="text-sm font-semibold">Enter card manually</div>
                <div className="text-xs opacity-70">Type or swipe card details now</div>
              </div>
            </button>
          </div>
        </div>

        {/* Card form (manual mode) */}
        {mode === 'manual' && (
          <div className="mb-5">
            <div className="bg-charcoal-900 border border-charcoal-700 rounded-xl p-4">
              {cardLoading && (
                <div className="flex items-center gap-2 text-xs text-charcoal-400 py-4">
                  <div className="w-4 h-4 rounded-full border-2 border-charcoal-500 border-t-transparent animate-spin" />
                  Loading card form…
                </div>
              )}
              <div id="pos-card-container" className={cardLoading ? 'hidden' : ''} />
              {!cardLoading && !cardReady && !error && (
                <div className="text-xs text-charcoal-500 py-2">Square not configured — connect a Square account in Settings.</div>
              )}
            </div>

            {/* Save card option */}
            {appt?.client_id && (
              <label className="flex items-center gap-3 mt-3 cursor-pointer">
                <div
                  onClick={() => setSaveCard(v => !v)}
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${saveCard ? 'bg-od-green border-od-green' : 'border-charcoal-600 bg-charcoal-800'}`}
                >
                  {saveCard && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
                <div>
                  <div className="text-sm text-charcoal-200 font-medium">Save card for future visits</div>
                  <div className="text-xs text-charcoal-500">Client's card is stored securely by Square. You can charge it next time without re-entering.</div>
                </div>
              </label>
            )}
          </div>
        )}

        {error && <p className="text-red-400 text-xs mb-4 bg-red-950 border border-red-900 rounded-lg p-3">{error}</p>}

        {/* Charge button */}
        <button
          onClick={handleCheckout}
          disabled={processing || (mode === 'manual' && !cardReady)}
          className="w-full bg-od-green text-black font-bold py-4 rounded-2xl text-base hover:bg-od-green-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {processing ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 rounded-full border-2 border-black border-t-transparent animate-spin" />
              Processing…
            </span>
          ) : (
            `Charge $${total.toFixed(2)}`
          )}
        </button>

        <p className="text-center text-xs text-charcoal-600 mt-3">Secured by Square · This action marks the appointment as complete</p>
      </div>
    </div>
  )
}
