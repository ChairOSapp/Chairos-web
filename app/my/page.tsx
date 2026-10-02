'use client'
import { useEffect, useRef, useState } from 'react'
import * as Sentry from '@sentry/nextjs'
import { useTheme } from 'next-themes'
import { squareCardInputStyle } from '@/lib/squareCard'
import { shareContent } from '@/lib/share'
import { describeSquareInitError, type SquareInitStep } from '@/lib/squareInitDiag'
import type { PortalShop } from '@/lib/portalData'

type PortalClient = {
  clientId: string
  fullName: string | null
  email: string | null
  phone: string
  squareCardBrand: string | null
  squareCardLast4: string | null
  referralCode: string
  shops: PortalShop[]
}
type Appointment = {
  id: string
  shopId: string
  shopName: string
  shopCode: string
  barberId: string | null
  barberName: string | null
  serviceId: string
  serviceName: string
  durationMinutes: number | null
  date: string
  time: string
  price: number
  status: string
  notes: string | null
}

type Tab = 'home' | 'history' | 'loyalty' | 'payment'

function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
function fmtTime(t: string) {
  const [h, m] = t.slice(0, 5).split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

export default function ClientPortalPage() {
  const [loading, setLoading] = useState(true)
  const [client, setClient] = useState<PortalClient | null>(null)
  // resolvedTheme follows the system (prefers-color-scheme) by default via
  // next-themes defaultTheme="system" -- drives the Square card input colors.
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  // Login state
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState('')

  const [tab, setTab] = useState<Tab>('home')
  const [copiedReferralShopId, setCopiedReferralShopId] = useState<string | null>(null)
  const [upcoming, setUpcoming] = useState<Appointment[]>([])
  const [past, setPast] = useState<Appointment[]>([])
  const [apptsLoading, setApptsLoading] = useState(false)
  const [rebooking, setRebooking] = useState<string | null>(null)
  const [rebookResult, setRebookResult] = useState<{ id: string; message: string; ok: boolean } | null>(null)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [cancelResult, setCancelResult] = useState<{ id: string; message: string; ok: boolean } | null>(null)

  // Payment tab state
  const [selectedShopId, setSelectedShopId] = useState('')
  // Per-barber shops (barbers_collect_own_payments): the card is saved
  // against the barber's Square merchant -- the same account booking and
  // charging use -- so the client picks which barber the card is for.
  const [selectedBarberId, setSelectedBarberId] = useState('')
  const squareCardRef = useRef<any>(null)
  const [cardReady, setCardReady] = useState(false)
  const [cardLoading, setCardLoading] = useState(false)
  // This shop's owner hasn't connected Square (fail-closed): no card can
  // be tokenized or saved here, so the form explains instead of offering
  // a dead Save button.
  const [squareNotConnected, setSquareNotConnected] = useState(false)
  const [squareNotConnectedMsg, setSquareNotConnectedMsg] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<{ ok: boolean; message: string } | null>(null)
  // Card-on-file consent: unchecked by default, required to save.
  const [cardConsent, setCardConsent] = useState(false)
  // Wallet view: per-shop card status from /api/portal/cards, plus which
  // shop's add-card form is currently expanded (only one at a time -- the
  // Square card element attaches to a single target div).
  const [walletCards, setWalletCards] = useState<{ shopId: string; status: 'current' | 'stale' | 'none'; brand: string | null; last4: string | null }[] | null>(null)
  const [walletLoading, setWalletLoading] = useState(false)
  const [editingShopId, setEditingShopId] = useState<string | null>(null)
  // Card-init failure: specific message + manual retry (same pattern as the
  // booking page). A failed init used to degrade to a dead "unavailable"
  // line with no recovery and no diagnostic trail.
  const [squareError, setSquareError] = useState<string | null>(null)
  const [squareRetryKey, setSquareRetryKey] = useState(0)
  // Earned-but-unredeemed referral rewards, per shop — so clients see
  // "you've earned X off" instead of discovering it only mid-booking.
  const [earnedRewards, setEarnedRewards] = useState<{ shopId: string; shopName: string; rewardText: string }[]>([])

  function referralRewardText(s: PortalShop): string {
    if (s.referralRewardType === 'flat_credit' && s.referralRewardValue != null) return `$${s.referralRewardValue} off`
    return `${s.referralRewardValue ?? 10}% off`
  }

  useEffect(() => {
    async function checkSession() {
      try {
        const res = await fetch('/api/portal/session')
        if (res.ok) {
          const data = await res.json()
          setClient(data.client)
        }
      } finally {
        setLoading(false)
      }
    }
    checkSession()
  }, [])

  useEffect(() => {
    if (!client) return
    async function loadAppointments() {
      setApptsLoading(true)
      try {
        const res = await fetch('/api/portal/appointments')
        const data = await res.json()
        setUpcoming(data.upcoming || [])
        setPast(data.past || [])
      } finally {
        setApptsLoading(false)
      }
    }
    loadAppointments()
    // Earned referral rewards for the "desire" nudge — the referrer sees
    // exactly what they've earned, not just a share link.
    fetch('/api/portal/rewards').then(r => r.json()).then(d => setEarnedRewards(d.rewards || [])).catch(() => {})
  }, [client])

  // Wallet status loads when the payment tab opens (and after saves) --
  // it's per-shop, so it doesn't belong in the one-shot client load above.
  async function loadWallet() {
    setWalletLoading(true)
    try {
      const res = await fetch('/api/portal/cards')
      const data = await res.json()
      setWalletCards(data.cards || [])
    } catch {
      setWalletCards([])
    } finally {
      setWalletLoading(false)
    }
  }
  useEffect(() => {
    if (client && tab === 'payment') loadWallet()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, tab])

  function openWalletForm(shop: PortalShop) {
    closeWalletForm()
    setSelectedShopId(shop.shopId)
    setSelectedBarberId(shop.barbers[0]?.barberId || '')
    setEditingShopId(shop.shopId)
  }

  function closeWalletForm() {
    if (squareCardRef.current) {
      squareCardRef.current.destroy?.().catch(() => {})
      squareCardRef.current = null
      setCardReady(false)
    }
    setCardLoading(false)
    setSquareNotConnected(false)
    setSquareNotConnectedMsg('')
    setSaveResult(null)
    setCardConsent(false)
    setEditingShopId(null)
  }

  // Square card form -- per-shop widget config (tokenize against the same
  // Square merchant the server saves the card under: the barber's on
  // per-barber shops, the owner's otherwise -- exactly like booking).
  // Only inits when the client has opened a shop's add-card form in the
  // wallet view. Same dynamic-import pattern as the public booking page.
  useEffect(() => {
    if (tab !== 'payment' || !editingShopId || !selectedShopId) return
    if (squareCardRef.current) return
    // Per-barber shops need a chosen barber before we can tokenize.
    const shopForInit = client?.shops.find(s => s.shopId === selectedShopId)
    if (shopForInit?.barbersCollectOwn && !selectedBarberId) return

    const appId = process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID
    if (!appId) return

    setCardLoading(true)
    setSquareNotConnected(false)
    setSquareNotConnectedMsg('')
    setSquareError(null)
    let isMounted = true
    async function initSquare() {
      let step: SquareInitStep = 'config-fetch'
      try {
        const cfgParams = new URLSearchParams({ portalShopId: selectedShopId })
        if (selectedBarberId) cfgParams.set('barberId', selectedBarberId)
        const cfgRes = await fetch(`/api/square/widget-config?${cfgParams}`)
        if (!isMounted) return
        if (!cfgRes.ok) {
          const errData = await cfgRes.json().catch(() => ({} as any))
          if (errData.code === 'square_not_connected' || errData.code === 'square_reconnect_required') {
            // Fail-closed by design: this shop hasn't connected Square, so
            // no card can be saved here. Say so plainly instead of the
            // generic "unavailable" dead end.
            if (isMounted) {
              setSquareNotConnected(true)
              setSquareNotConnectedMsg(errData.error || '')
            }
            return
          }
          throw new Error('widget_config_failed')
        }
        const { locationId } = await cfgRes.json()
        if (!locationId) throw new Error('widget_config_failed')
        step = 'sdk-import'
        const { payments } = await import('@square/web-sdk')
        if (!isMounted) return
        step = 'payments-init'
        const paymentsInstance = await payments(appId!, locationId)
        if (!isMounted || !paymentsInstance) return
        step = 'card-create'
        const card = await paymentsInstance.card({ style: squareCardInputStyle(isDark) })
        if (!isMounted) return
        step = 'card-attach'
        await card.attach('#portal-square-card')
        if (!isMounted) return
        squareCardRef.current = card
        setCardReady(true)
      } catch (e) {
        // Failed init (Square CDN hiccup, attach race, ...) is now loud:
        // Sentry gets the real error. The client gets the specific failure
        // step so the actual problem can be diagnosed instead of guessing.
        console.error('Square init error:', describeSquareInitError(step, e), e)
        if (isMounted) {
          Sentry.captureException(e, { tags: { area: 'portal_square_card_init' }, extra: { shopId: selectedShopId } })
          const detail = describeSquareInitError(step, e)
          setSquareError(`The card form didn't load (${step}): ${detail} Nothing was saved or charged.`)
        }
      } finally {
        if (isMounted) setCardLoading(false)
      }
    }
    initSquare()
    return () => {
      isMounted = false
      if (squareCardRef.current) {
        squareCardRef.current.destroy?.().catch(() => {})
        squareCardRef.current = null
        setCardReady(false)
      }
    }
  }, [tab, editingShopId, selectedShopId, selectedBarberId, squareRetryKey, resolvedTheme])

  function retrySquareInit() {
    setSquareError(null)
    setSquareRetryKey(k => k + 1)
  }

  async function sendCode() {
    setAuthError('')
    setAuthBusy(true)
    try {
      const res = await fetch('/api/portal/otp/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }),
      })
      const data = await res.json()
      if (!res.ok) { setAuthError(data.error || 'Could not send a code'); return }
      setOtpSent(true)
    } catch {
      setAuthError('Could not send a code')
    } finally {
      setAuthBusy(false)
    }
  }

  async function verifyCode() {
    setAuthError('')
    setAuthBusy(true)
    try {
      const res = await fetch('/api/portal/otp/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, code }),
      })
      const data = await res.json()
      if (!res.ok) { setAuthError(data.error || 'Incorrect code'); return }
      setClient(data.client)
    } catch {
      setAuthError('Could not verify that code')
    } finally {
      setAuthBusy(false)
    }
  }

  async function signOut() {
    await fetch('/api/portal/logout', { method: 'POST' }).catch(() => {})
    setClient(null)
    setOtpSent(false)
    setPhone('')
    setCode('')
    setTab('home')
  }

  async function handleRebook(appointmentId: string) {    setRebooking(appointmentId)
    setRebookResult(null)
    try {
      const res = await fetch('/api/portal/rebook', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appointmentId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setRebookResult({ id: appointmentId, ok: false, message: data.error || 'Could not rebook' })
      } else {
        setRebookResult({ id: appointmentId, ok: true, message: `Booked ${data.serviceName} at ${data.shopName} on ${fmtDate(data.date)} at ${fmtTime(data.time)}` })
        const apptsRes = await fetch('/api/portal/appointments')
        const apptsData = await apptsRes.json()
        setUpcoming(apptsData.upcoming || [])
        setPast(apptsData.past || [])
      }
    } finally {
      setRebooking(null)
    }
  }

  async function handleCancel(appointmentId: string) {
    if (!confirm('Cancel this appointment?')) return
    setCancelling(appointmentId)
    setCancelResult(null)
    try {
      const res = await fetch('/api/portal/cancel', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appointmentId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setCancelResult({ id: appointmentId, ok: false, message: data.error || 'Could not cancel' })
      } else {
        const msg = data.isLateCancel
          ? `Cancelled. This was a late cancellation.${data.policy ? ` Policy: ${data.policy}` : ''}`
          : 'Appointment cancelled.'
        setCancelResult({ id: appointmentId, ok: true, message: msg })
        const apptsRes = await fetch('/api/portal/appointments')
        const apptsData = await apptsRes.json()
        setUpcoming(apptsData.upcoming || [])
        setPast(apptsData.past || [])
      }
    } finally {
      setCancelling(null)
    }
  }

  const selectedShopName = client?.shops.find(s => s.shopId === selectedShopId)?.shopName || 'this shop'
  const selectedShop = client?.shops.find(s => s.shopId === selectedShopId)
  const perBarberShop = selectedShop?.barbersCollectOwn === true
  const selectedBarberName = selectedShop?.barbers.find(b => b.barberId === selectedBarberId)?.name || ''
  // Who actually charges the card: the barber's merchant on per-barber
  // shops, the shop otherwise. The disclosure names them accurately.
  const chargeParty = perBarberShop && selectedBarberName ? `${selectedBarberName} at ${selectedShopName}` : selectedShopName
  const cardConsentText = `I agree to save my card with ${chargeParty} for faster checkout. ${chargeParty} may charge this card for deposits and appointment payments. My card is stored securely by Square — the shop never sees my full card number. I can remove my card anytime.`

  async function handleSaveCard() {
    if (!squareCardRef.current || !selectedShopId) return
    if (!cardConsent) {
      setSaveResult({ ok: false, message: 'Please agree to the card-on-file terms to save your card.' })
      return
    }
    setSaving(true)
    setSaveResult(null)
    try {
      const result = await squareCardRef.current.tokenize()
      if (result.status !== 'OK') {
        setSaveResult({ ok: false, message: result.errors?.[0]?.message || 'Card error' })
        return
      }
      const res = await fetch('/api/portal/save-card', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId: result.token, shopId: selectedShopId, barberId: selectedBarberId || null, consent: true, consentText: cardConsentText }),
      })
      const data = await res.json()
      if (!res.ok) { setSaveResult({ ok: false, message: data.error || 'Could not save card' }); return }
      setSaveResult({ ok: true, message: `Saved ${data.brand} ending in ${data.last4}` })
      setClient(prev => prev ? { ...prev, squareCardBrand: data.brand, squareCardLast4: data.last4 } : prev)
      // The wallet rows read per-shop status from /api/portal/cards --
      // refresh so this shop flips to "on file" without a reload.
      loadWallet()
    } catch {
      setSaveResult({ ok: false, message: 'Could not save card' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-od-green border-t-transparent animate-spin" />
    </div>
  )

  // ---------- Login screen ----------
  if (!client) {
    return (
      <div className="min-h-screen bg-warm-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <h1 className="font-serif text-2xl text-charcoal-900 text-center mb-1">ChairOS</h1>
          <p className="text-charcoal-500 text-sm text-center mb-6">Sign in to see your bookings, saved card, and referral rewards.</p>
          <div className="bg-warm-100 border border-warm-200 rounded-xl p-6">
            {!otpSent ? (
              <>
                <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Phone Number</label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 000-0000"
                  className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors mb-4" />
                <button onClick={sendCode} disabled={authBusy || phone.replace(/\D/g, '').length < 10}
                  className="w-full font-semibold py-3 rounded-lg text-sm transition-colors text-white bg-od-green disabled:opacity-50">
                  {authBusy ? 'Sending…' : 'Send Code'}
                </button>
              </>
            ) : (
              <>
                <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Enter Code</label>
                <p className="text-charcoal-500 text-xs mb-3">Sent to {phone}</p>
                <input type="text" inputMode="numeric" value={code} onChange={e => setCode(e.target.value)} placeholder="000000"
                  className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm font-mono outline-none focus:border-od-green transition-colors mb-4" />
                <button onClick={verifyCode} disabled={authBusy || code.length < 6}
                  className="w-full font-semibold py-3 rounded-lg text-sm transition-colors text-white bg-od-green disabled:opacity-50 mb-2">
                  {authBusy ? 'Verifying…' : 'Verify & Sign In'}
                </button>
                <button onClick={() => { setOtpSent(false); setCode(''); setAuthError('') }} className="w-full text-xs text-charcoal-500 hover:text-charcoal-900 transition-colors">
                  ← Use a different number
                </button>
              </>
            )}
            {authError && <p className="text-red-600 dark:text-red-400 text-xs mt-3">{authError}</p>}
          </div>
          <p className="text-charcoal-600 text-xs text-center mt-6">Powered by ChairOS</p>
        </div>
      </div>
    )
  }


  // ---------- Portal shell (redesigned) ----------
  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: 'home', label: 'Home', icon: '⌂' },
    { key: 'history', label: 'History', icon: '◷' },
    { key: 'loyalty', label: 'Rewards', icon: '★' },
    { key: 'payment', label: 'Wallet', icon: '▭' },
  ]

  const firstName = client.fullName?.split(' ')[0] || 'there'
  const nextAppt = upcoming[0]

  // Date badge for appointment cards
  function DateBadge({ date }: { date: string }) {
    const d = new Date(date + 'T12:00:00')
    const month = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()
    const day = d.getDate()
    const weekday = d.toLocaleDateString('en-US', { weekday: 'short' })
    return (
      <div className="flex-shrink-0 w-14 text-center bg-warm-100 border border-warm-200 dark:bg-white/[0.06] dark:border-white/10 rounded-xl py-2">
        <div className="text-[10px] font-bold tracking-widest text-od-green dark:text-[#8A9A3B]">{month}</div>
        <div className="text-xl font-bold text-charcoal-900 dark:text-white leading-tight">{day}</div>
        <div className="text-[10px] text-charcoal-500 dark:text-white/50">{weekday}</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-warm-50 text-charcoal-900 dark:bg-[#0F0E0C] dark:text-white pb-28">
      {/* Hero header */}
      <div className="bg-gradient-to-b from-warm-100 to-warm-50 dark:from-[#1A1815] dark:to-[#0F0E0C] px-6 pt-8 pb-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#8A9A3B] to-[#5A6630] flex items-center justify-center text-lg font-bold text-black">
                {firstName[0]?.toUpperCase() || '?'}
              </div>
              <div>
                <h1 className="text-xl font-bold">Hi, {firstName}</h1>
                <p className="text-charcoal-500 dark:text-white/50 text-xs">{client.shops.length} shop{client.shops.length !== 1 ? 's' : ''} · {upcoming.length} upcoming</p>
              </div>
            </div>
            <button onClick={signOut} className="text-xs text-charcoal-400 hover:text-charcoal-700 dark:text-white/40 dark:hover:text-white/80 transition-colors px-3 py-2">
              Sign out
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-5 -mt-1">

        {tab === 'home' && (
          <div className="space-y-5">
            {/* Next appointment hero */}
            {nextAppt && (
              <div className="bg-gradient-to-br from-od-green/10 to-od-green/5 border border-od-green/25 dark:from-[#8A9A3B]/15 dark:to-[#5A6630]/5 dark:border-[#8A9A3B]/20 rounded-2xl p-5">
                <div className="text-[11px] font-bold tracking-widest text-od-green dark:text-[#8A9A3B] mb-3">NEXT APPOINTMENT</div>
                <div className="flex gap-4">
                  <DateBadge date={nextAppt.date} />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-charcoal-900 dark:text-white">{nextAppt.serviceName}</div>
                    <div className="text-sm text-charcoal-500 dark:text-white/60 mt-0.5">{nextAppt.shopName}{nextAppt.barberName ? ` · ${nextAppt.barberName}` : ''}</div>
                    <div className="text-sm text-charcoal-500 dark:text-white/60">{fmtTime(nextAppt.time)} · ${nextAppt.price}</div>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button onClick={() => handleCancel(nextAppt.id)} disabled={cancelling === nextAppt.id}
                    className="flex-1 text-sm font-semibold py-2.5 rounded-xl border border-warm-300 text-charcoal-500 hover:text-red-600 hover:border-red-300 dark:border-white/15 dark:text-white/70 dark:hover:text-red-400 dark:hover:border-red-400/40 transition-colors disabled:opacity-50">
                    {cancelling === nextAppt.id ? 'Cancelling…' : 'Cancel'}
                  </button>
                </div>
                {cancelResult?.id === nextAppt.id && (
                  <div className={`text-xs mt-2 ${cancelResult.ok ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {cancelResult.message}
                  </div>
                )}
              </div>
            )}

            {/* Other upcoming */}
            {upcoming.length > 1 && (
              <div>
                <div className="text-[11px] font-bold tracking-widest text-charcoal-400 dark:text-white/40 mb-2">ALSO UPCOMING</div>
                <div className="space-y-2">
                  {upcoming.slice(1).map(a => (
                    <div key={a.id} className="bg-white border border-warm-200 dark:bg-white/[0.04] dark:border-white/10 rounded-2xl p-4 flex gap-3">
                      <DateBadge date={a.date} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-charcoal-900 dark:text-white truncate">{a.serviceName}</span>
                          <span className="text-sm text-od-green dark:text-[#8A9A3B] font-semibold ml-2">${a.price}</span>
                        </div>
                        <div className="text-xs text-charcoal-500 dark:text-white/50 mt-0.5">{a.shopName}{a.barberName ? ` · ${a.barberName}` : ''}</div>
                        <div className="text-xs text-charcoal-400 dark:text-white/40">{fmtTime(a.time)}</div>
                        <button onClick={() => handleCancel(a.id)} disabled={cancelling === a.id}
                          className="text-xs text-charcoal-400 hover:text-red-600 dark:text-white/50 dark:hover:text-red-400 transition-colors mt-2 disabled:opacity-50">
                          {cancelling === a.id ? 'Cancelling…' : 'Cancel'}
                        </button>
                        {cancelResult?.id === a.id && (
                          <div className={`text-xs mt-1 ${cancelResult.ok ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {cancelResult.message}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {upcoming.length === 0 && !apptsLoading && (
              <div className="bg-white border border-warm-200 dark:bg-white/[0.04] dark:border-white/10 rounded-2xl p-8 text-center">
                <div className="text-3xl mb-2">📅</div>
                <p className="text-charcoal-500 dark:text-white/60 text-sm">No upcoming appointments.</p>
                <p className="text-charcoal-400 dark:text-white/40 text-xs mt-1">Book with one of your shops below.</p>
              </div>
            )}

            {/* Your shops */}
            {client.shops.length > 0 && (
              <div>
                <div className="text-[11px] font-bold tracking-widest text-charcoal-400 dark:text-white/40 mb-2">YOUR SHOPS</div>
                <div className="grid grid-cols-1 gap-2">
                  {client.shops.map(s => (
                    <a key={s.shopId} href={s.shopCode ? `/book/${s.shopCode}` : '#'}
                      className="flex items-center justify-between bg-white border border-warm-200 dark:bg-white/[0.04] dark:border-white/10 rounded-2xl p-4 hover:border-od-green/40 hover:bg-warm-100 dark:hover:border-[#8A9A3B]/40 dark:hover:bg-white/[0.06] transition-all group">
                      <div>
                        <div className="text-sm font-semibold text-charcoal-900 dark:text-white">{s.shopName}</div>
                        <div className="text-xs text-charcoal-400 dark:text-white/40">Tap to book</div>
                      </div>
                      <div className="w-9 h-9 rounded-full bg-od-green/10 border border-od-green/30 text-od-green group-hover:bg-od-green group-hover:text-white dark:bg-[#8A9A3B]/15 dark:border-[#8A9A3B]/30 dark:text-[#8A9A3B] dark:group-hover:bg-[#8A9A3B] dark:group-hover:text-black flex items-center justify-center transition-all">
                        →
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'history' && (
          <div>
            <div className="text-[11px] font-bold tracking-widest text-charcoal-400 dark:text-white/40 mb-3">BOOKING HISTORY</div>
            {apptsLoading ? (
              <div className="text-charcoal-400 dark:text-white/40 text-sm py-8 text-center">Loading…</div>
            ) : past.length === 0 ? (
              <div className="bg-white border border-warm-200 dark:bg-white/[0.04] dark:border-white/10 rounded-2xl p-8 text-center">
                <div className="text-3xl mb-2">📋</div>
                <p className="text-charcoal-500 dark:text-white/60 text-sm">No past appointments yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {past.map(a => (
                  <div key={a.id} className="bg-white border border-warm-200 dark:bg-white/[0.04] dark:border-white/10 rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold text-charcoal-900 dark:text-white">{a.serviceName}</span>
                      <span className="text-sm text-charcoal-600 dark:text-white/70">${a.price}</span>
                    </div>
                    <div className="text-xs text-charcoal-500 dark:text-white/50">{a.shopName}{a.barberName ? ` · ${a.barberName}` : ''}</div>
                    <div className="flex items-center justify-between mt-2">
                      <div className="text-xs text-charcoal-400 dark:text-white/40">{fmtDate(a.date)} · <span className="capitalize">{a.status}</span></div>
                      <button onClick={() => handleRebook(a.id)} disabled={rebooking === a.id}
                        className="text-xs font-bold text-od-green hover:text-od-green-dark dark:text-[#8A9A3B] dark:hover:text-[#7A8A33] transition-colors disabled:opacity-50">
                        {rebooking === a.id ? 'Booking…' : 'Rebook →'}
                      </button>
                    </div>
                    {rebookResult?.id === a.id && (
                      <p className={`text-xs mt-2 ${rebookResult.ok ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{rebookResult.message}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'loyalty' && (
          <div className="space-y-5">
            <div>
              <div className="text-[11px] font-bold tracking-widest text-charcoal-400 dark:text-white/40 mb-3">REFER A FRIEND</div>
              {client.shops.length === 0 ? (
                <div className="bg-white border border-warm-200 dark:bg-white/[0.04] dark:border-white/10 rounded-2xl p-6 text-center text-charcoal-500 dark:text-white/50 text-sm">Book somewhere first to get your referral link.</div>
              ) : client.shops.every(s => !s.referralProgramEnabled) ? (
                <div className="bg-white border border-warm-200 dark:bg-white/[0.04] dark:border-white/10 rounded-2xl p-6 text-center text-charcoal-500 dark:text-white/50 text-sm">None of your shops are running a referral program right now.</div>
              ) : (
                <div className="space-y-2">
                  {client.shops.filter(s => s.referralProgramEnabled).map(s => {
                    const link = s.shopCode ? `${window.location.origin}/book/${s.shopCode}?ref=${client.referralCode}` : null
                    const earned = earnedRewards.find(r => r.shopId === s.shopId)
                    return (
                      <div key={s.shopId} className="bg-white border border-warm-200 dark:bg-white/[0.04] dark:border-white/10 rounded-2xl p-4">
                        <div className="text-sm font-semibold text-charcoal-900 dark:text-white mb-1">{s.shopName}</div>
                        {earned && (
                          <div className="text-xs font-semibold text-green-700 bg-green-600/10 border border-green-600/20 dark:text-green-400 dark:bg-green-400/10 dark:border-green-400/20 rounded-xl px-3 py-2 mb-2">
                            You've earned {earned.rewardText} — applied automatically on your next booking here.
                          </div>
                        )}
                        {link ? (
                          <>
                            <div className="text-xs text-charcoal-500 dark:text-white/50 mb-2">Share this link — you'll get {referralRewardText(s)} when your friend books their first visit.</div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-warm-100 border border-warm-200 dark:bg-black/30 dark:border-white/10 rounded-xl px-3 py-2 text-charcoal-500 dark:text-white/60 text-xs break-all font-mono">{link}</div>
                              <button
                                onClick={async () => {
                                  const result = await shareContent({ title: `${s.shopName} on ChairOS`, text: `Book with me at ${s.shopName}:`, url: link })
                                  if (result === 'copied' || result === 'shared') {
                                    setCopiedReferralShopId(s.shopId)
                                    setTimeout(() => setCopiedReferralShopId(null), 2000)
                                  }
                                }}
                                className="flex-shrink-0 px-4 py-2 bg-od-green text-white text-xs font-bold rounded-xl hover:bg-od-green-dark dark:bg-[#8A9A3B] dark:hover:bg-[#7A8A33] transition-colors">
                                {copiedReferralShopId === s.shopId ? 'Copied!' : 'Copy'}
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="text-xs text-charcoal-500 dark:text-white/50">Referral link unavailable for this shop.</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div>
              <div className="text-[11px] font-bold tracking-widest text-charcoal-400 dark:text-white/40 mb-3">LOYALTY</div>
              {client.shops.length === 0 ? (
                <div className="bg-white border border-warm-200 dark:bg-white/[0.04] dark:border-white/10 rounded-2xl p-6 text-center text-charcoal-500 dark:text-white/50 text-sm">Book somewhere first to start earning.</div>
              ) : (
                <div className="space-y-2">
                  {client.shops.map(s => (
                    <div key={s.shopId} className="bg-white border border-warm-200 dark:bg-white/[0.04] dark:border-white/10 rounded-2xl p-4">
                      <div className="text-sm font-semibold text-charcoal-900 dark:text-white mb-1">{s.shopName}</div>
                      <div className="text-xs text-charcoal-500 dark:text-white/50">Loyalty points and vouchers aren't live yet — check back soon.</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'payment' && (
          <div>
            <div className="text-[11px] font-bold tracking-widest text-charcoal-400 dark:text-white/40 mb-1">YOUR WALLET</div>
            <p className="text-xs text-charcoal-500 dark:text-white/50 mb-4">Cards are stored securely by Square — one per shop. Add a card for each shop you visit.</p>
            {client.shops.length === 0 ? (
              <div className="bg-white border border-warm-200 dark:bg-white/[0.04] dark:border-white/10 rounded-2xl p-6 text-center text-charcoal-500 dark:text-white/50 text-sm">Book somewhere first to save a card.</div>
            ) : walletLoading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-charcoal-400 dark:text-white/40 text-sm">
                <div className="w-4 h-4 rounded-full border-2 border-warm-300 border-t-od-green dark:border-white/20 dark:border-t-[#8A9A3B] animate-spin flex-shrink-0" />
                Loading your wallet…
              </div>
            ) : (
              <div className="space-y-2">
                {client.shops.map(shop => {
                  const card = walletCards?.find(c => c.shopId === shop.shopId)
                  const status = card?.status || 'none'
                  const open = editingShopId === shop.shopId
                  return (
                    <div key={shop.shopId} className="bg-white border border-warm-200 dark:bg-white/[0.04] dark:border-white/10 rounded-2xl p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-charcoal-900 dark:text-white truncate">{shop.shopName}</div>
                          <div className="flex items-center gap-1.5 mt-1">
                            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${status === 'current' ? 'bg-green-500 dark:bg-green-400' : status === 'stale' ? 'bg-amber-500 dark:bg-amber-400' : 'bg-warm-300 dark:bg-white/20'}`} />
                            <span className="text-xs text-charcoal-500 dark:text-white/50">
                              {status === 'current' && card?.brand ? `${card.brand} ending in ${card.last4} on file`
                                : status === 'current' ? 'Card on file'
                                : status === 'stale' ? 'Card on file is out of date'
                                : 'No card on file'}
                            </span>
                          </div>
                        </div>
                        <button onClick={() => open ? closeWalletForm() : openWalletForm(shop)}
                          className="flex-shrink-0 text-xs font-bold px-4 py-2 rounded-xl bg-od-green text-white hover:bg-od-green-dark dark:bg-[#8A9A3B] dark:hover:bg-[#7A8A33] transition-colors">
                          {open ? 'Close' : status === 'none' ? 'Add card' : 'Update'}
                        </button>
                      </div>
                      {open && (
                        <div className="mt-4 pt-4 border-t border-warm-200 dark:border-white/10">
                          {perBarberShop && selectedShop && selectedShop.barbers.length > 0 && (
                            <div className="mb-4">
                              <label className="block text-[11px] font-bold tracking-widest text-charcoal-400 dark:text-white/40 mb-2">FOR WHICH BARBER?</label>
                              <select value={selectedBarberId} onChange={e => { setSquareNotConnected(false); setSelectedBarberId(e.target.value) }}
                                className="w-full bg-warm-100 border border-warm-300 dark:bg-black/30 dark:border-white/15 rounded-xl px-4 py-3 text-charcoal-900 dark:text-white text-sm outline-none focus:border-od-green dark:focus:border-[#8A9A3B] transition-colors">
                                {selectedShop.barbers.map(b => <option key={b.barberId} value={b.barberId} className="bg-neutral-900">{b.name}</option>)}
                              </select>
                              <p className="text-xs text-charcoal-400 dark:text-white/40 mt-1.5">Cards are kept with your barber, so pick the one you book with.</p>
                            </div>
                          )}
                          {perBarberShop && selectedShop && selectedShop.barbers.length === 0 ? (
                            <div className="bg-white border border-warm-200 dark:bg-white/[0.04] dark:border-white/10 rounded-xl px-4 py-4 text-sm text-charcoal-600 dark:text-white/70">
                              We couldn&apos;t find an active barber for you at {selectedShopName} — book an appointment first, then save your card here.
                            </div>
                          ) : squareNotConnected ? (
                            <div className="bg-white border border-warm-200 dark:bg-white/[0.04] dark:border-white/10 rounded-xl px-4 py-4 text-sm text-charcoal-600 dark:text-white/70">
                              {`${chargeParty} hasn't set up card payments yet — you can pay at the shop as usual.`}
                              {squareNotConnectedMsg ? <span className="block text-xs text-charcoal-400 dark:text-white/40 mt-1">{squareNotConnectedMsg}</span> : null}
                            </div>
                          ) : (
                            <>
                              <div className="bg-warm-100 border border-warm-200 dark:bg-black/40 dark:border-white/10 rounded-xl p-4 mb-3">
                                {cardLoading && (
                                  <div className="flex items-center gap-2 py-3 text-charcoal-400 dark:text-white/40 text-sm">
                                    <div className="w-4 h-4 rounded-full border-2 border-warm-300 border-t-od-green dark:border-white/20 dark:border-t-[#8A9A3B] animate-spin flex-shrink-0" />
                                    Loading card form...
                                  </div>
                                )}
                                <div id="portal-square-card" />
                                {!cardLoading && !cardReady && squareError ? (
                                  <div className="py-2">
                                    <p className="text-amber-600 dark:text-amber-400 text-xs">{squareError}</p>
                                    <button type="button" onClick={retrySquareInit}
                                      className="mt-2 text-xs font-semibold text-charcoal-500 underline underline-offset-2 hover:text-charcoal-900 dark:text-white/70 dark:hover:text-white transition-colors">
                                      Try again
                                    </button>
                                  </div>
                                ) : !cardLoading && !cardReady && (
                                  <p className="text-charcoal-400 dark:text-white/40 text-xs py-2">Card form unavailable right now.</p>
                                )}
                              </div>
                              <button onClick={handleSaveCard} disabled={saving || !cardReady}
                                className="w-full font-bold py-3 rounded-xl text-sm transition-colors text-white bg-od-green hover:bg-od-green-dark dark:bg-[#8A9A3B] dark:hover:bg-[#7A8A33] disabled:opacity-50">
                                {saving ? 'Saving…' : 'Save Card'}
                              </button>
                              <label className="flex items-start gap-3 cursor-pointer mt-3">
                                <input
                                  type="checkbox"
                                  checked={cardConsent}
                                  onChange={e => setCardConsent(e.target.checked)}
                                  className="mt-0.5 w-4 h-4 flex-shrink-0 accent-od-green dark:accent-[#8A9A3B]"
                                />
                                <span className="text-xs text-charcoal-500 dark:text-white/50 leading-relaxed">{cardConsentText}</span>
                              </label>
                              <p className="text-charcoal-400 dark:text-white/30 text-xs mt-2">Your card is saved securely by Square. We do not store your full card number.</p>
                            </>
                          )}
                          {saveResult && (
                            <p className={`text-xs mt-2 ${saveResult.ok ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>{saveResult.message}</p>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

      </div>

      {/* Bottom tab bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-warm-100/95 dark:bg-[#141210]/95 backdrop-blur-lg border-t border-warm-200 dark:border-white/10 safe-area-pb">
        <div className="max-w-2xl mx-auto grid grid-cols-4">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex flex-col items-center gap-1 py-3 transition-colors ${
                tab === t.key ? 'text-od-green dark:text-[#8A9A3B]' : 'text-charcoal-400 hover:text-charcoal-700 dark:text-white/40 dark:hover:text-white/70'
              }`}>
              <span className="text-xl leading-none">{t.icon}</span>
              <span className="text-[10px] font-semibold">{t.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
