'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useParams, useRouter } from 'next/navigation'

export default function KioskCheckIn() {
  const params = useParams()
  const shopCode = (params.shopCode as string)?.toUpperCase()
  const supabase = createClient()
  const router = useRouter()

  const [shop, setShop] = useState<any>(null)
  const [barbers, setBarbers] = useState<any[]>([])
  const [services, setServices] = useState<any[]>([])
  const [staffLabel, setStaffLabel] = useState('Barber')
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [step, setStep] = useState<'details' | 'code'>('details')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [requestedBarberId, setRequestedBarberId] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const { data: shop } = await supabase
        .from('shops').select('*').eq('shop_code', shopCode).maybeSingle()
      if (!shop) { setNotFound(true); setLoading(false); return }
      setShop(shop)

      const { data: verticalMeta } = await supabase
        .from('vertical_config').select('staff_label').eq('vertical', shop.vertical).maybeSingle()
      if (verticalMeta?.staff_label) setStaffLabel(verticalMeta.staff_label)

      const { data: barbers } = await supabase
        .from('shop_barbers').select('*').eq('shop_id', shop.id).eq('active', true)
      setBarbers(barbers || [])

      const { data: services } = await supabase
        .from('services').select('*').eq('shop_id', shop.id).eq('active', true)
        .order('price', { ascending: true })
      setServices(services || [])

      setLoading(false)
    }
    load()
  }, [shopCode])

  function reset() {
    setStep('details')
    setName('')
    setPhone('')
    setRequestedBarberId('')
    setServiceId('')
    setCode('')
    setError('')
  }

  async function handleSendCode(e?: React.SyntheticEvent) {
    e?.preventDefault()
    if (!name || !phone) return
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/kiosk/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopCode,
          name,
          phone,
          requestedBarberId: requestedBarberId || undefined,
          serviceId: serviceId || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not send a code')
      setStep('code')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (!code) return
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/kiosk/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopCode, phone, code }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not verify that code')
      router.push(`/kiosk/${shopCode}/status/${data.id}`)
    } catch (err: any) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-od-green border-t-transparent animate-spin" />
    </div>
  )

  if (notFound) return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center p-4">
      <p className="text-charcoal-500 text-sm">Shop not found.</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="font-serif text-3xl text-od-green mb-1">{shop.name}</h1>
          <p className="text-charcoal-400 text-sm">Check in for a walk-in visit</p>
        </div>

        {step === 'details' ? (
          <form onSubmit={handleSendCode} className="bg-warm-100 border border-warm-200 rounded-xl p-8 space-y-4">
            {error && <p className="text-red-400 text-sm bg-red-950 border border-red-900 rounded-lg p-3">{error}</p>}
            <div>
              <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Your Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} required
                className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Phone Number</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} required
                className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors" />
              <p className="text-xs text-charcoal-400 mt-1">We'll text you a code to confirm it's you.</p>
            </div>
            {barbers.length > 0 && (
              <div>
                <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Which {staffLabel}?</label>
                <select value={requestedBarberId} onChange={e => setRequestedBarberId(e.target.value)}
                  className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors">
                  <option value="">No preference</option>
                  {barbers.map(b => (
                    <option key={b.id} value={b.barber_id}>{b.barber_name || b.alias}</option>
                  ))}
                </select>
              </div>
            )}
            {services.length > 0 && (
              <div>
                <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Service (optional)</label>
                <select value={serviceId} onChange={e => setServiceId(e.target.value)}
                  className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors">
                  <option value="">Not sure yet</option>
                  {services.map(s => (
                    <option key={s.id} value={s.id}>{s.name} — ${s.price}</option>
                  ))}
                </select>
              </div>
            )}
            <button type="submit" disabled={submitting || !name || !phone}
              className="w-full bg-od-green hover:bg-od-green-light text-white font-semibold py-3 rounded-lg transition-colors text-sm tracking-wide disabled:opacity-60">
              {submitting ? 'Sending code...' : 'Text Me a Code'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerify} className="bg-warm-100 border border-warm-200 rounded-xl p-8 space-y-4">
            {error && <p className="text-red-400 text-sm bg-red-950 border border-red-900 rounded-lg p-3">{error}</p>}
            <div className="text-center">
              <p className="text-charcoal-600 text-sm">We texted a code to <span className="font-semibold text-charcoal-900">{phone}</span></p>
            </div>
            <div>
              <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Enter Code</label>
              <input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ''))} required autoFocus
                className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-2xl tracking-[0.5em] text-center outline-none focus:border-od-green transition-colors" />
            </div>
            <button type="submit" disabled={submitting || code.length !== 6}
              className="w-full bg-od-green hover:bg-od-green-light text-white font-semibold py-3 rounded-lg transition-colors text-sm tracking-wide disabled:opacity-60">
              {submitting ? 'Checking in...' : 'Verify & Check In'}
            </button>
            <div className="flex items-center justify-between text-xs">
              <button type="button" onClick={reset} className="text-charcoal-400 hover:text-charcoal-600 transition-colors">
                ← Wrong number
              </button>
              <button type="button" onClick={handleSendCode} disabled={submitting} className="text-od-green hover:text-od-green-light transition-colors disabled:opacity-60">
                Resend code
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
