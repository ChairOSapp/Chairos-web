'use client'
import { useEffect, useRef, useState } from 'react'

type PortalShop = { shopId: string; shopName: string; shopCode: string | null; vertical: string }
type PortalClient = {
  clientId: string
  fullName: string | null
  email: string | null
  phone: string
  squareCardBrand: string | null
  squareCardLast4: string | null
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
  const [upcoming, setUpcoming] = useState<Appointment[]>([])
  const [past, setPast] = useState<Appointment[]>([])
  const [apptsLoading, setApptsLoading] = useState(false)
  const [rebooking, setRebooking] = useState<string | null>(null)
  const [rebookResult, setRebookResult] = useState<{ id: string; message: string; ok: boolean } | null>(null)

  // Payment tab state
  const [selectedShopId, setSelectedShopId] = useState('')
  const squareCardRef = useRef<any>(null)
  const [cardReady, setCardReady] = useState(false)
  const [cardLoading, setCardLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<{ ok: boolean; message: string } | null>(null)

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
    if (client.shops.length > 0) setSelectedShopId(client.shops[0].shopId)
  }, [client])

  // Square card form -- same dynamic-import pattern as the public booking page.
  useEffect(() => {
    if (tab !== 'payment' || !selectedShopId) return
    if (squareCardRef.current) return

    const appId = process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID
    const locationId = process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID
    if (!appId || !locationId) return

    setCardLoading(true)
    let isMounted = true
    async function initSquare() {
      try {
        const { payments } = await import('@square/web-sdk')
        if (!isMounted) return
        const paymentsInstance = await payments(appId!, locationId!)
        if (!isMounted || !paymentsInstance) return
        const card = await paymentsInstance.card()
        if (!isMounted) return
        await card.attach('#portal-square-card')
        if (!isMounted) return
        squareCardRef.current = card
        setCardReady(true)
      } catch (e) {
        console.error('Square init error:', e)
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
  }, [tab, selectedShopId])

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

  async function handleRebook(appointmentId: string) {
    setRebooking(appointmentId)
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

  async function handleSaveCard() {
    if (!squareCardRef.current || !selectedShopId) return
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
        body: JSON.stringify({ sourceId: result.token, shopId: selectedShopId }),
      })
      const data = await res.json()
      if (!res.ok) { setSaveResult({ ok: false, message: data.error || 'Could not save card' }); return }
      setSaveResult({ ok: true, message: `Saved ${data.brand} ending in ${data.last4}` })
      setClient(prev => prev ? { ...prev, squareCardBrand: data.brand, squareCardLast4: data.last4 } : prev)
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
          <p className="text-charcoal-500 text-sm text-center mb-6">Sign in to see your bookings, saved card, and loyalty points.</p>
          <div className="bg-warm-100 border border-warm-200 rounded-xl p-6">
            {!otpSent ? (
              <>
                <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Phone Number</label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 000-0000"
                  className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors mb-4" />
                <button onClick={sendCode} disabled={authBusy || phone.replace(/\D/g, '').length < 10}
                  className="w-full font-semibold py-3 rounded-lg text-sm transition-colors text-black bg-od-green disabled:opacity-50">
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
                  className="w-full font-semibold py-3 rounded-lg text-sm transition-colors text-black bg-od-green disabled:opacity-50 mb-2">
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
                tab === t.key ? 'bg-od-green text-black' : 'bg-warm-200 text-charcoal-500 hover:text-charcoal-900'
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
            <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-3">Saved Payment Method</div>
            {client.squareCardBrand && client.squareCardLast4 && (
              <div className="bg-warm-100 border border-warm-200 rounded-xl p-4 mb-4 flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                <div className="text-sm text-charcoal-900">{client.squareCardBrand} ending in {client.squareCardLast4} on file</div>
              </div>
            )}
            {client.shops.length === 0 ? (
              <div className="bg-warm-100 border border-warm-200 rounded-xl p-6 text-center text-charcoal-500 text-sm">Book somewhere first to save a card.</div>
            ) : (
              <div className="bg-warm-100 border border-warm-200 rounded-xl p-5">
                {client.shops.length > 1 && (
                  <div className="mb-4">
                    <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">For which shop?</label>
                    <select value={selectedShopId} onChange={e => { squareCardRef.current = null; setCardReady(false); setSelectedShopId(e.target.value) }}
                      className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors">
                      {client.shops.map(s => <option key={s.shopId} value={s.shopId}>{s.shopName}</option>)}
                    </select>
                  </div>
                )}
                <div className="bg-neutral-900 border border-neutral-700 rounded-xl p-4 mb-3">
                  {cardLoading && (
                    <div className="flex items-center gap-2 py-3 text-neutral-500 text-sm">
                      <div className="w-4 h-4 rounded-full border-2 border-neutral-600 border-t-amber-500 animate-spin flex-shrink-0" />
                      Loading card form...
                    </div>
                  )}
                  <div id="portal-square-card" className={cardLoading ? 'hidden' : ''} />
                  {!cardLoading && !cardReady && (
                    <p className="text-neutral-500 text-xs py-2">Card form unavailable right now.</p>
                  )}
                </div>
                <button onClick={handleSaveCard} disabled={saving || !cardReady}
                  className="w-full font-semibold py-3 rounded-lg text-sm transition-colors text-black bg-od-green disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save Card'}
                </button>
                <p className="text-neutral-600 text-xs mt-2">Your card is saved securely by Square. We do not store your full card number.</p>
                {saveResult && (
                  <p className={`text-xs mt-2 ${saveResult.ok ? 'text-od-green' : 'text-amber-400'}`}>{saveResult.message}</p>
                )}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
