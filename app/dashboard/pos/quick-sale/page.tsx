'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { PAYMENT_METHODS, paymentMethodLabel, type PaymentMethod } from '@/lib/paymentMethods'
import type { SplitEntry } from '@/lib/checkoutExtras'
import { useLoadWatchdog } from '@/lib/useLoadWatchdog'

interface ShopLite { id: string; name: string }
interface ReceiptState {
  total: number
  amount: number
  tip: number
  note: string
  paymentMethodLabel?: string
  split: SplitEntry[] | null
}

const TIP_PRESETS = [
  { label: '15%', pct: 0.15 },
  { label: '20%', pct: 0.20 },
  { label: '25%', pct: 0.25 },
  { label: 'No tip', pct: 0 },
]

// Quick sale: a register sale with no appointment — a product over
// the counter, a standalone charge. Amount + a note saying what it
// was, paid however the client paid. Lands in quick_sales and counts
// in revenue like appointment income.
export default function QuickSale() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [loading, setLoading] = useState(true)
  useLoadWatchdog(loading)
  const [shop, setShop] = useState<ShopLite | null>(null)
  const [isOwner, setIsOwner] = useState(false)
  const [barbers, setBarbers] = useState<{ barber_id: string; barber_name: string | null; alias: string | null }[]>([])
  const [barberId, setBarberId] = useState<string>('') // '' = house sale

  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [tipPreset, setTipPreset] = useState<number | null>(null)
  const [customTip, setCustomTip] = useState('')
  const [useCustomTip, setUseCustomTip] = useState(false)

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [splitOn, setSplitOn] = useState(false)
  const [splitMethodA, setSplitMethodA] = useState<PaymentMethod>('cash')
  const [splitMethodB, setSplitMethodB] = useState<PaymentMethod>('square')
  const [splitAmountA, setSplitAmountA] = useState('')

  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState<ReceiptState | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      let shopData: ShopLite | null = null
      const { data: ownShop } = await supabase
        .from('shops').select('id, name').eq('owner_id', user.id).maybeSingle()
      if (ownShop) {
        shopData = ownShop
        setIsOwner(true)
      } else {
        const { data: row } = await supabase
          .from('shop_barbers')
          .select('shop_id, shops(id, name)')
          .eq('barber_id', user.id)
          .eq('active', true)
          .maybeSingle()
        shopData = (row as unknown as { shops: ShopLite | null } | null)?.shops || null
        if (shopData) setBarberId(user.id)
      }
      if (!shopData) { setLoading(false); return }
      setShop(shopData)

      if (ownShop) {
        const { data: rows } = await supabase
          .from('shop_barbers')
          .select('barber_id, barber_name, alias')
          .eq('shop_id', shopData.id)
          .eq('active', true)
        const claimed = (rows || []).filter(r => r.barber_id)
        setBarbers(claimed as { barber_id: string; barber_name: string | null; alias: string | null }[])
        // An owner who also works a chair in their own shop sells as
        // themselves by default.
        if (claimed.some(r => r.barber_id === user.id)) setBarberId(user.id)
      }

      setLoading(false)
    }
    load()
  }, [])

  const saleAmount = Math.round((parseFloat(amount) || 0) * 100) / 100
  const tipAmount = useCustomTip
    ? Math.max(0, parseFloat(customTip) || 0)
    : (tipPreset !== null ? Math.round(saleAmount * tipPreset * 100) / 100 : 0)
  const total = Math.round((saleAmount + tipAmount) * 100) / 100

  const splitAmtA = Math.round((parseFloat(splitAmountA) || 0) * 100) / 100
  const splitAmtB = Math.round((total - splitAmtA) * 100) / 100
  const splitValid = !splitOn || (splitMethodA !== splitMethodB && splitAmtA > 0 && splitAmtB > 0)

  async function handleSubmit() {
    setError('')
    if (!shop) { setError('No shop found for your account.'); return }
    if (!(saleAmount > 0)) { setError('Enter an amount above $0.'); return }
    if (splitOn && !splitValid) {
      setError(splitMethodA === splitMethodB
        ? 'Pick two different methods for a split payment.'
        : 'Enter the first part of the split — the second part is the rest of the total.')
      return
    }
    setProcessing(true)
    try {
      const res = await fetch('/api/pos/quick-sale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopId: shop.id,
          barberId: barberId || null,
          amount: saleAmount,
          tipAmount,
          note: note.trim() || undefined,
          paymentMethod: splitOn ? undefined : paymentMethod,
          split: splitOn ? [
            { method: splitMethodA, amount: splitAmtA },
            { method: splitMethodB, amount: splitAmtB },
          ] : undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Could not record the sale')
      setReceipt({
        total: json.total,
        amount: saleAmount,
        tip: tipAmount,
        note: note.trim(),
        paymentMethodLabel: splitOn ? undefined : paymentMethodLabel(paymentMethod),
        split: json.split || null,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record the sale')
    } finally {
      setProcessing(false)
    }
  }

  function reset() {
    setReceipt(null)
    setAmount('')
    setNote('')
    setTipPreset(null)
    setCustomTip('')
    setUseCustomTip(false)
    setSplitOn(false)
    setSplitAmountA('')
    setError('')
  }

  if (loading) return (
    <div className="min-h-screen bg-warm-50 dark:bg-charcoal-950 flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-2 border-[#7A8C3A] border-t-transparent animate-spin" />
    </div>
  )

  if (!shop) return (
    <div className="min-h-screen bg-warm-50 dark:bg-charcoal-950 flex items-center justify-center p-6">
      <div className="text-center">
        <p className="text-charcoal-400 text-sm mb-4">No shop found for your account.</p>
        <button onClick={() => router.push('/dashboard')} className="text-[#7A8C3A] text-sm font-semibold">← Back to dashboard</button>
      </div>
    </div>
  )

  if (receipt) return (
    <div className="min-h-screen bg-warm-50 dark:bg-charcoal-950 flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-[#7A8C3A]/10 border border-[#7A8C3A]/30 flex items-center justify-center mx-auto mb-4">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#7A8C3A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div className="font-serif text-3xl text-charcoal-900 dark:text-white mb-1">Sale recorded</div>
          {receipt.note && <div className="text-charcoal-400 text-sm">{receipt.note}</div>}
        </div>
        <div className="bg-warm-100 dark:bg-charcoal-900 border border-charcoal-700 rounded-2xl p-5 mb-6 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-charcoal-400">Sale</span>
            <span className="text-charcoal-900 dark:text-white font-mono">${receipt.amount.toFixed(2)}</span>
          </div>
          {receipt.tip > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-charcoal-400">Tip</span>
              <span className="text-charcoal-900 dark:text-white font-mono">${receipt.tip.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm border-t border-charcoal-700 pt-3">
            <span className="text-charcoal-900 dark:text-white font-semibold">Total</span>
            <span className="text-[#7A8C3A] font-serif text-xl">${receipt.total.toFixed(2)}</span>
          </div>
          {receipt.paymentMethodLabel && (
            <div className="flex justify-between text-sm pt-1">
              <span className="text-charcoal-400">Paid with</span>
              <span className="text-charcoal-900 dark:text-white font-semibold">{receipt.paymentMethodLabel}</span>
            </div>
          )}
          {receipt.split?.length === 2 && (
            <div className="pt-1 space-y-1">
              <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500">Split payment</div>
              {receipt.split.map((s, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-charcoal-400">{paymentMethodLabel(s.method)}</span>
                  <span className="text-charcoal-900 dark:text-white font-semibold">${Number(s.amount).toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-2">
          <button onClick={reset} className="btn-chairos w-full !py-3 !text-sm">New quick sale</button>
          <button
            onClick={() => router.push('/dashboard')}
            className="w-full bg-warm-200 dark:bg-charcoal-800 text-charcoal-300 font-semibold py-3 rounded-xl text-sm hover:bg-charcoal-700 transition-colors"
          >
            Dashboard
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-warm-50 dark:bg-charcoal-950 p-5 pb-56">
      <div className="max-w-sm mx-auto">
        <div className="flex items-center gap-3 mb-7 pt-2">
          <button onClick={() => router.back()} className="w-11 h-11 -ml-2 flex items-center justify-center text-charcoal-400 hover:text-charcoal-900 dark:text-white transition-colors flex-shrink-0" aria-label="Back">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          </button>
          <div>
            <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500">Quick sale</div>
            <div className="font-serif text-lg text-charcoal-900 dark:text-white leading-tight">{shop.name}</div>
          </div>
        </div>

        {/* Amount */}
        <div className="mb-5">
          <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500 mb-3">Amount</div>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal-400 text-2xl">$</span>
            <input
              type="number" min="0" step="0.01" inputMode="decimal"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              autoFocus
              className="w-full bg-warm-100 dark:bg-charcoal-900 border border-charcoal-700 rounded-2xl pl-10 pr-4 py-4 font-serif text-4xl text-charcoal-900 dark:text-white outline-none focus:border-[#7A8C3A] transition-colors"
            />
          </div>
        </div>

        {/* Note */}
        <div className="mb-5">
          <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500 mb-3">What was it for?</div>
          <input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="e.g. Pomade, gift certificate, beard trim tidy-up"
            className="w-full bg-warm-200 dark:bg-charcoal-800 border border-charcoal-600 rounded-xl px-3 py-2.5 text-base text-charcoal-900 dark:text-white outline-none focus:border-[#7A8C3A] transition-colors"
          />
          <p className="text-[11px] text-charcoal-500 mt-1.5">Shows in your reports next to the sale, so it never reads as a mystery number.</p>
        </div>

        {/* Who made the sale (owner only; chairs sell as themselves) */}
        {isOwner && barbers.length > 0 && (
          <div className="mb-5">
            <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500 mb-3">Who made the sale?</div>
            <select
              value={barberId}
              onChange={e => setBarberId(e.target.value)}
              className="w-full bg-warm-200 dark:bg-charcoal-800 border border-charcoal-600 rounded-xl px-3 py-2.5 text-base text-charcoal-900 dark:text-white outline-none focus:border-[#7A8C3A]"
            >
              <option value="">House sale</option>
              {barbers.map(b => (
                <option key={b.barber_id} value={b.barber_id}>{b.barber_name || b.alias || 'Barber'}</option>
              ))}
            </select>
          </div>
        )}

        {/* Tip */}
        <div className="mb-5">
          <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500 mb-3">Tip</div>
          <div className="grid grid-cols-4 gap-2 mb-3">
            {TIP_PRESETS.map(p => (
              <button
                key={p.label}
                onClick={() => { setTipPreset(p.pct); setUseCustomTip(false) }}
                className={`py-3 rounded-xl text-sm font-semibold transition-colors ${
                  !useCustomTip && tipPreset === p.pct
                    ? 'bg-[#7A8C3A] text-black'
                    : 'bg-warm-200 dark:bg-charcoal-800 text-charcoal-300 hover:bg-charcoal-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setUseCustomTip(v => !v)}
              className={`text-xs font-semibold px-3 py-2.5 min-h-[44px] rounded-lg transition-colors ${
                useCustomTip ? 'bg-[#7A8C3A]/20 text-[#7A8C3A]' : 'text-charcoal-400 hover:text-charcoal-200'
              }`}
            >
              Custom amount
            </button>
            {useCustomTip && (
              <div className="flex-1 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-400 text-sm">$</span>
                <input
                  type="number" min="0" step="0.01"
                  value={customTip}
                  onChange={e => setCustomTip(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-warm-200 dark:bg-charcoal-800 border border-charcoal-600 rounded-lg pl-7 pr-3 py-2 text-base text-charcoal-900 dark:text-white outline-none focus:border-[#7A8C3A] transition-colors"
                />
              </div>
            )}
          </div>
        </div>

        {/* Payment */}
        <div className="mb-5">
          <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500 mb-3">How are they paying?</div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-charcoal-300">Split between two methods</span>
            <button
              type="button" role="switch" aria-checked={splitOn}
              onClick={() => {
                if (!splitOn && !splitAmountA && total > 0) setSplitAmountA((total / 2).toFixed(2))
                setSplitOn(v => !v)
              }}
              className={`w-11 h-6 rounded-full transition-colors flex-shrink-0 ${splitOn ? 'bg-[#7A8C3A]' : 'bg-charcoal-700'}`}
            >
              <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${splitOn ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
            </button>
          </div>

          {splitOn ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <select
                  value={splitMethodA}
                  onChange={e => setSplitMethodA(e.target.value as PaymentMethod)}
                  className="flex-1 min-w-0 bg-warm-200 dark:bg-charcoal-800 border border-charcoal-600 rounded-lg px-3 py-2.5 text-base text-charcoal-900 dark:text-white outline-none focus:border-[#7A8C3A]"
                >
                  {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <div className="relative w-28 flex-shrink-0">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-400 text-sm">$</span>
                  <input
                    type="number" min="0" step="0.01"
                    value={splitAmountA}
                    onChange={e => setSplitAmountA(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-warm-200 dark:bg-charcoal-800 border border-charcoal-600 rounded-lg pl-7 pr-2 py-2.5 text-base text-charcoal-900 dark:text-white outline-none focus:border-[#7A8C3A]"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={splitMethodB}
                  onChange={e => setSplitMethodB(e.target.value as PaymentMethod)}
                  className="flex-1 min-w-0 bg-warm-200 dark:bg-charcoal-800 border border-charcoal-600 rounded-lg px-3 py-2.5 text-base text-charcoal-900 dark:text-white outline-none focus:border-[#7A8C3A]"
                >
                  {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <div className="w-28 flex-shrink-0 text-right font-mono text-base text-charcoal-900 dark:text-white pr-2">
                  ${Math.max(0, splitAmtB).toFixed(2)}
                </div>
              </div>
              {splitMethodA === splitMethodB && <p className="text-red-400 text-xs">Pick two different methods.</p>}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {PAYMENT_METHODS.map(m => (
                  <button
                    key={m.value}
                    onClick={() => setPaymentMethod(m.value)}
                    className={`py-3 rounded-xl text-sm font-semibold transition-colors ${
                      paymentMethod === m.value
                        ? 'bg-[#7A8C3A] text-black'
                        : 'bg-warm-200 dark:bg-charcoal-800 text-charcoal-300 hover:bg-charcoal-700'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              {paymentMethod === 'square' ? (
                <p className="text-xs text-charcoal-400">Run the card on your Square reader or the Square app first, then record it here. It counts toward earnings and the 1099 either way.</p>
              ) : (
                <p className="text-xs text-charcoal-400">Record it once the money is in hand. It counts toward earnings and the 1099.</p>
              )}
            </>
          )}
        </div>

        {error && <p className="text-red-400 text-xs mb-4 bg-red-950 border border-red-900 rounded-lg p-3">{error}</p>}
      </div>

      {/* Sticky record bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-warm-50 dark:bg-charcoal-950/95 backdrop-blur border-t border-charcoal-800 pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-sm mx-auto px-5 pt-3 pb-4">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-semibold tracking-widest uppercase text-charcoal-500">Total</span>
            <span className="font-serif text-2xl text-[#7A8C3A]">${total.toFixed(2)}</span>
          </div>
          <button
            onClick={handleSubmit}
            disabled={processing || !(saleAmount > 0) || !splitValid}
            className="w-full bg-[#7A8C3A] text-black font-bold py-4 rounded-2xl text-base hover:bg-[#8FA043] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {processing ? 'Recording…' : `Record $${total.toFixed(2)} sale`}
          </button>
        </div>
      </div>
    </div>
  )
}
