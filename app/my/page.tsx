'use client'
import { useEffect, useRef, useState } from 'react'
import * as Sentry from '@sentry/nextjs'
import { squareCardInputStyle } from '@/lib/squareCard'
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
        const card = await paymentsInstance.card({ style: squareCardInputStyle(true) })
        if (!isMounted) return
        step = 'card-attach'
        await card.attach('#portal-square-card')
        if (!isMounted) return
        squareCardRef.current = card
        setCardReady(true)
      } catch (e) {
        // Failed init (Square CDN hiccup, attach race, ...) is now loud:
        // Sentry gets the real error, the client gets a message plus a
        // retry, instead of the dead "unavailable" line.
        console.error('Square init error:', describeSquareInitError(step, e), e)
        if (isMounted) {
          Sentry.captureException(e, { tags: { area: 'portal_square_card_init' }, extra: { shopId: selectedShopId } })
          setSquareError('The card form didn\u2019t load. Check your connection and try again. Nothing was saved or charged.')
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
  }, [tab, editingShopId, selectedShopId, selectedBarberId, squareRetryKey])

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
            {authError && <p className="text-red-400 text-xs mt-3">{authError}</p>}
          </div>
          <p className="text-charcoal-600 text-xs text-center mt-6">Powered by ChairOS</p>
        </div>
      </div>
    )
  }

  // ---------- Portal shell ----------
  const TABS: { key: Tab; label: string }[] = [
    { key: 'home', label: 'Home' },
    { key: 'history', label: 'History' },
    { key: 'loyalty', label: 'Loyalty' },
    { key: 'payment', label: 'Payment' },
  ]

  return (
    <div className="min-h-screen bg-warm-50">
      <div className="bg-warm-100 border-b border-warm-200 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="font-serif text-lg text-charcoal-900">Hi, {client.fullName?.split(' ')[0] || 'there'}</h1>
            <p className="text-charcoal-500 text-xs">{client.shops.length} shop{client.shops.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={signOut} className="text-xs text-charcoal-500 hover:text-charcoal-900 transition-colors">Sign out</button>
        </div>
        <div className="max-w-2xl mx-auto flex gap-1.5 mt-4 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                tab === t.key ? 'bg-od-green text-white' : 'bg-warm-200 text-charcoal-500 hover:text-charcoal-900'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-6">

        {tab === 'home' && (
          <div>
            {client.shops.length === 0 ? (
              <div className="bg-warm-100 border border-warm-200 rounded-xl p-8 text-center">
                <p className="text-charcoal-500 text-sm">No shops on file yet for this number. Once you book somewhere on ChairOS, it'll show up here.</p>
              </div>
            ) : (
              <div className="space-y-2 mb-6">
                <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Your Shops</div>
                {client.shops.map(s => (
                  <a key={s.shopId} href={s.shopCode ? `/book/${s.shopCode}` : '#'}
                    className="block bg-warm-100 border border-warm-200 rounded-xl p-4 hover:border-od-green transition-colors">
                    <div className="text-sm font-semibold text-charcoal-900">{s.shopName}</div>
                    <div className="text-xs text-charcoal-500 mt-0.5">Book again →</div>
                  </a>
                ))}
              </div>
            )}

            <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Upcoming</div>
            {apptsLoading ? (
              <div className="text-charcoal-500 text-sm py-4">Loading…</div>
            ) : upcoming.length === 0 ? (
              <div className="bg-warm-100 border border-warm-200 rounded-xl p-6 text-center text-charcoal-500 text-sm">No upcoming appointments.</div>
            ) : (
              <div className="space-y-2">
                {upcoming.map(a => (
                  <div key={a.id} className="bg-warm-100 border border-warm-200 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold text-charcoal-900">{a.serviceName}</span>
                      <span className="font-mono text-sm text-od-green">${a.price}</span>
                    </div>
                    <div className="text-xs text-charcoal-500">{a.shopName}{a.barberName ? ` · ${a.barberName}` : ''}</div>
                    <div className="text-xs text-charcoal-400 mt-1">{fmtDate(a.date)} at {fmtTime(a.time)}</div>
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => handleCancel(a.id)} disabled={cancelling === a.id}
                        className="text-xs px-3 py-1.5 rounded-lg border border-warm-300 text-charcoal-600 hover:text-red-500 hover:border-red-300 transition-colors disabled:opacity-50">
                        {cancelling === a.id ? 'Cancelling…' : 'Cancel'}
                      </button>
                    </div>
                    {cancelResult?.id === a.id && (
                      <div className={`text-xs mt-2 ${cancelResult.ok ? 'text-green-600' : 'text-red-500'}`}>
                        {cancelResult.message}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'history' && (
          <div>
            <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-3">Booking History</div>
            {apptsLoading ? (
              <div className="text-charcoal-500 text-sm py-4">Loading…</div>
            ) : past.length === 0 ? (
              <div className="bg-warm-100 border border-warm-200 rounded-xl p-6 text-center text-charcoal-500 text-sm">No past appointments yet.</div>
            ) : (
              <div className="space-y-2">
                {past.map(a => (
                  <div key={a.id} className="bg-warm-100 border border-warm-200 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold text-charcoal-900">{a.serviceName}</span>
                      <span className="font-mono text-sm text-charcoal-900">${a.price}</span>
                    </div>
                    <div className="text-xs text-charcoal-500">{a.shopName}{a.barberName ? ` · ${a.barberName}` : ''}</div>
                    <div className="flex items-center justify-between mt-1">
                      <div className="text-xs text-charcoal-400">{fmtDate(a.date)} · <span className="capitalize">{a.status}</span></div>
                      <button onClick={() => handleRebook(a.id)} disabled={rebooking === a.id}
                        className="text-xs font-semibold text-od-green hover:opacity-80 transition-opacity disabled:opacity-50">
                        {rebooking === a.id ? 'Booking…' : 'Rebook →'}
                      </button>
                    </div>
                    {rebookResult?.id === a.id && (
                      <p className={`text-xs mt-2 ${rebookResult.ok ? 'text-od-green' : 'text-red-400'}`}>{rebookResult.message}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'loyalty' && (
          <div>
            <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-3">Refer a Friend</div>
            {client.shops.length === 0 ? (
              <div className="bg-warm-100 border border-warm-200 rounded-xl p-6 text-center text-charcoal-500 text-sm mb-6">Book somewhere first to get your referral link.</div>
            ) : client.shops.every(s => !s.referralProgramEnabled) ? (
              <div className="bg-warm-100 border border-warm-200 rounded-xl p-6 text-center text-charcoal-500 text-sm mb-6">None of your shops are running a referral program right now.</div>
            ) : (
              <div className="space-y-2 mb-6">
                {client.shops.filter(s => s.referralProgramEnabled).map(s => {
                  const link = s.shopCode ? `${window.location.origin}/book/${s.shopCode}?ref=${client.referralCode}` : null
                  const earned = earnedRewards.find(r => r.shopId === s.shopId)
                  return (
                    <div key={s.shopId} className="bg-warm-100 border border-warm-200 rounded-xl p-4">
                      <div className="text-sm font-semibold text-charcoal-900 mb-1">{s.shopName}</div>
                      {earned && (
                        <div className="text-xs font-semibold text-od-green bg-od-green/10 border border-od-green/30 rounded-lg px-3 py-2 mb-2">
                          You've earned {earned.rewardText} — applied automatically on your next booking here.
                        </div>
                      )}
                      {link ? (
                        <>
                          <div className="text-xs text-charcoal-500 mb-2">Share this link — you'll get {referralRewardText(s)} when your friend books their first visit.</div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-warm-200 border border-warm-300 rounded-lg px-3 py-2 text-charcoal-700 text-xs break-all font-mono">{link}</div>
                            <button
                              onClick={() => { navigator.clipboard.writeText(link); setCopiedReferralShopId(s.shopId); setTimeout(() => setCopiedReferralShopId(null), 2000) }}
                              className="flex-shrink-0 px-3 py-2 bg-od-green text-white text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity">
                              {copiedReferralShopId === s.shopId ? 'Copied!' : 'Copy'}
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="text-xs text-charcoal-500">Referral link unavailable for this shop.</div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-3">Loyalty</div>
            {client.shops.length === 0 ? (
              <div className="bg-warm-100 border border-warm-200 rounded-xl p-6 text-center text-charcoal-500 text-sm">Book somewhere first to start earning.</div>
            ) : (
              <div className="space-y-2">
                {client.shops.map(s => (
                  <div key={s.shopId} className="bg-warm-100 border border-warm-200 rounded-xl p-4">
                    <div className="text-sm font-semibold text-charcoal-900 mb-1">{s.shopName}</div>
                    <div className="text-xs text-charcoal-500">Loyalty points and vouchers aren't live yet — check back soon.</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'payment' && (
          <div>
            <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-1">Your wallet</div>
            <p className="text-xs text-charcoal-500 mb-4">Cards are stored securely by Square — one per shop. Add a card for each shop you visit.</p>
            {client.shops.length === 0 ? (
              <div className="bg-warm-100 border border-warm-200 rounded-xl p-6 text-center text-charcoal-500 text-sm">Book somewhere first to save a card.</div>
            ) : walletLoading ? (
              <div className="flex items-center gap-2 py-6 text-charcoal-400 text-sm">
                <div className="w-4 h-4 rounded-full border-2 border-warm-300 border-t-od-green animate-spin flex-shrink-0" />
                Loading your wallet…
              </div>
            ) : (
              <div className="space-y-3">
                {client.shops.map(shop => {
                  const card = walletCards?.find(c => c.shopId === shop.shopId)
                  const status = card?.status || 'none'
                  const open = editingShopId === shop.shopId
                  return (
                    <div key={shop.shopId} className="bg-warm-100 border border-warm-200 rounded-xl p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-charcoal-900 truncate">{shop.shopName}</div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${status === 'current' ? 'bg-green-500' : status === 'stale' ? 'bg-amber-500' : 'bg-charcoal-300'}`} />
                            <span className="text-xs text-charcoal-500">
                              {status === 'current' && card?.brand ? `${card.brand} ending in ${card.last4} on file`
                                : status === 'current' ? 'Card on file'
                                : status === 'stale' ? 'Card on file is out of date'
                                : 'No card on file'}
                            </span>
                          </div>
                        </div>
                        <button onClick={() => open ? closeWalletForm() : openWalletForm(shop)}
                          className="flex-shrink-0 text-xs font-semibold px-3 py-2 rounded-lg bg-od-green text-white transition-colors">
                          {open ? 'Close' : status === 'none' ? 'Add card' : 'Update'}
                        </button>
                      </div>
                      {open && (
                        <div className="mt-4 pt-4 border-t border-warm-200">
                          {perBarberShop && selectedShop && selectedShop.barbers.length > 0 && (
                            <div className="mb-4">
                              <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">For which barber?</label>
                              <select value={selectedBarberId} onChange={e => { setSquareNotConnected(false); setSelectedBarberId(e.target.value) }}
                                className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors">
                                {selectedShop.barbers.map(b => <option key={b.barberId} value={b.barberId}>{b.name}</option>)}
                              </select>
                              <p className="text-xs text-charcoal-500 mt-1.5">Cards are kept with your barber, so pick the one you book with.</p>
                            </div>
                          )}
                          {perBarberShop && selectedShop && selectedShop.barbers.length === 0 ? (
                            <div className="bg-warm-200 border border-warm-300 rounded-xl px-4 py-4 text-sm text-charcoal-900">
                              We couldn&apos;t find an active barber for you at {selectedShopName} — book an appointment first, then save your card here.
                            </div>
                          ) : squareNotConnected ? (
                            <div className="bg-warm-200 border border-warm-300 rounded-xl px-4 py-4 text-sm text-charcoal-900">
                              {`${chargeParty} hasn't set up card payments yet — you can pay at the shop as usual.`}
                              {squareNotConnectedMsg ? <span className="block text-xs text-charcoal-500 mt-1">{squareNotConnectedMsg}</span> : null}
                            </div>
                          ) : (
                            <>
                              <div className="bg-neutral-900 border border-neutral-700 rounded-xl p-4 mb-3">
                                {cardLoading && (
                                  <div className="flex items-center gap-2 py-3 text-neutral-500 text-sm">
                                    <div className="w-4 h-4 rounded-full border-2 border-neutral-600 border-t-amber-500 animate-spin flex-shrink-0" />
                                    Loading card form...
                                  </div>
                                )}
                                <div id="portal-square-card" />
                                {!cardLoading && !cardReady && squareError ? (
                                  <div className="py-2">
                                    <p className="text-amber-400 text-xs">{squareError}</p>
                                    {/* In-app recovery: the iOS wrapper has no page refresh. */}
                                    <button type="button" onClick={retrySquareInit}
                                      className="mt-2 text-xs font-semibold text-neutral-200 underline underline-offset-2 hover:text-white transition-colors">
                                      Try again
                                    </button>
                                  </div>
                                ) : !cardLoading && !cardReady && (
                                  <p className="text-neutral-500 text-xs py-2">Card form unavailable right now.</p>
                                )}
                              </div>
                              <button onClick={handleSaveCard} disabled={saving || !cardReady}
                                className="w-full font-semibold py-3 rounded-lg text-sm transition-colors text-white bg-od-green disabled:opacity-50">
                                {saving ? 'Saving…' : 'Save Card'}
                              </button>
                              <label className="flex items-start gap-3 cursor-pointer mt-3">
                                <input
                                  type="checkbox"
                                  checked={cardConsent}
                                  onChange={e => setCardConsent(e.target.checked)}
                                  className="mt-0.5 w-4 h-4 flex-shrink-0"
                                />
                                <span className="text-xs text-neutral-400 leading-relaxed">{cardConsentText}</span>
                              </label>
                              <p className="text-neutral-600 text-xs mt-2">Your card is saved securely by Square. We do not store your full card number.</p>
                            </>
                          )}
                          {saveResult && (
                            <p className={`text-xs mt-2 ${saveResult.ok ? 'text-od-green' : 'text-amber-400'}`}>{saveResult.message}</p>
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
    </div>
  )
}
