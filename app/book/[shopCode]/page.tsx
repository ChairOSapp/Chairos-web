'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useParams } from 'next/navigation'

const TIMES = [
  '9:00 AM','9:30 AM','10:00 AM','10:30 AM','11:00 AM','11:30 AM',
  '12:00 PM','12:30 PM','1:00 PM','1:30 PM','2:00 PM','2:30 PM',
  '3:00 PM','3:30 PM','4:00 PM','4:30 PM','5:00 PM','5:30 PM',
  '6:00 PM','6:30 PM'
]

export default function BookingPage() {
  const params = useParams()
  const shopCode = (params.shopCode as string)?.toUpperCase()
  const supabase = createClient()

  const [shop, setShop] = useState<any>(null)
  const [barbers, setBarbers] = useState<any[]>([])
  const [services, setServices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  // Booking state
  const [selectedBarber, setSelectedBarber] = useState<any>(null)
  const [selectedService, setSelectedService] = useState<any>(null)
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedTime, setSelectedTime] = useState('')
  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const { data: shop } = await supabase
        .from('shops')
        .select('*')
        .eq('shop_code', shopCode)
        .single()

      if (!shop) { setNotFound(true); setLoading(false); return }
      setShop(shop)

      const { data: barbers } = await supabase
        .from('shop_barbers')
        .select('*')
        .eq('shop_id', shop.id)
        .eq('active', true)
      setBarbers(barbers || [])

      const { data: services } = await supabase
        .from('services')
        .select('*')
        .eq('shop_id', shop.id)
        .eq('active', true)
        .order('price', { ascending: true })
      setServices(services || [])

      setLoading(false)
    }
    load()
  }, [shopCode])

  async function handleBook() {
    if (!clientName || !clientPhone) { setError('Name and phone are required'); return }
    setSubmitting(true)
    setError('')

    // Convert time to 24hr for database
    const [time, period] = selectedTime.split(' ')
    const [hours, minutes] = time.split(':')
    let h = parseInt(hours)
    if (period === 'PM' && h !== 12) h += 12
    if (period === 'AM' && h === 12) h = 0
    const time24 = `${h.toString().padStart(2,'0')}:${minutes}:00`

    const { error: bookErr } = await supabase.from('appointments').insert({
      shop_id: shop.id,
      barber_id: selectedBarber?.barber_id || null,
      service_id: selectedService.id,
      client_name: clientName,
      client_phone: clientPhone,
      client_email: clientEmail || null,
      date: selectedDate,
      time: time24,
      price: selectedService.price,
      status: 'pending',
      notes: notes || null
    })

    if (bookErr) { setError(bookErr.message); setSubmitting(false); return }
    setSuccess(true)
    setSubmitting(false)
  }

  // Min date = today
  const today = new Date().toISOString().split('T')[0]
  const COLORS = ['#b8861f','#4a7fb5','#3aab6e','#e07850','#9b6db5','#c06060']

  if (loading) return (
    <div className="min-h-screen bg-[#111] flex items-center justify-center">
      <div className="text-amber-500 text-sm">Loading...</div>
    </div>
  )

  if (notFound) return (
    <div className="min-h-screen bg-[#111] flex items-center justify-center p-4">
      <div className="text-center">
        <h1 className="font-serif text-3xl text-amber-500 mb-4">ChairOS</h1>
        <p className="text-neutral-400">Shop not found. Check your link and try again.</p>
      </div>
    </div>
  )

  if (success) return (
    <div className="min-h-screen bg-[#111] flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <h1 className="font-serif text-3xl text-amber-500 mb-6">{shop.name}</h1>
        <div className="bg-[#1a1a1a] border border-neutral-800 rounded-xl p-8">
          <div className="w-14 h-14 bg-green-500/10 border border-green-500/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <h2 className="font-serif text-xl text-white mb-2">You're booked.</h2>
          <p className="text-neutral-400 text-sm mb-6">
            {selectedService.name} with {selectedBarber?.barber_name || selectedBarber?.alias || 'any barber'} on{' '}
            {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} at {selectedTime}.
          </p>
          <div className="bg-neutral-800 rounded-lg p-4 mb-6 text-left space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-neutral-400">Service</span>
              <span className="text-white">{selectedService.name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-400">Price</span>
              <span className="text-amber-500 font-mono">${selectedService.price}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-400">Duration</span>
              <span className="text-white">{selectedService.duration_minutes} mins</span>
            </div>
          </div>
          <p className="text-neutral-600 text-xs">
            You'll receive a confirmation text at {clientPhone}. Powered by ChairOS.
          </p>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#111]">

      {/* SHOP HEADER */}
      <div className="bg-[#0a0a0a] border-b border-neutral-800 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="font-serif text-xl text-amber-500">{shop.name}</h1>
            <p className="text-neutral-500 text-xs mt-0.5">{shop.address}{shop.city ? ` · ${shop.city}` : ''}</p>
          </div>
          <div className="text-right">
            <div className="text-xs text-neutral-500">Shop Code</div>
            <div className="font-mono text-sm text-neutral-400">{shop.shop_code}</div>
          </div>
        </div>
      </div>

      {/* PROGRESS */}
      <div className="bg-[#0a0a0a] border-b border-neutral-800 px-6 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-2">
          {['Barber', 'Service', 'Date & Time', 'Your Info'].map((label, i) => (
            <div key={i} className="flex items-center gap-2 flex-1 last:flex-none">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all
                ${step > i+1 ? 'bg-green-500 text-white' : step === i+1 ? 'bg-amber-500 text-black' : 'bg-neutral-800 text-neutral-600'}`}>
                {step > i+1 ? '✓' : i+1}
              </div>
              <span className={`text-xs hidden sm:block ${step === i+1 ? 'text-amber-500' : step > i+1 ? 'text-green-500' : 'text-neutral-600'}`}>
                {label}
              </span>
              {i < 3 && <div className={`flex-1 h-px ${step > i+1 ? 'bg-green-500' : 'bg-neutral-800'}`} />}
            </div>
          ))}
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-6">

        {error && <p className="text-red-400 text-sm bg-red-950 border border-red-900 rounded-lg p-3 mb-4">{error}</p>}

        {/* STEP 1 — BARBER */}
        {step === 1 && (
          <div>
            <h2 className="font-serif text-xl text-white mb-1">Choose your barber</h2>
            <p className="text-neutral-500 text-sm mb-6">Pick who you want or select any available barber.</p>
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div
                onClick={() => { setSelectedBarber(null); setStep(2) }}
                className="bg-[#1a1a1a] border-2 border-neutral-800 hover:border-amber-500 rounded-xl p-4 cursor-pointer transition-all text-center">
                <div className="w-12 h-12 rounded-full bg-neutral-800 flex items-center justify-center mx-auto mb-3">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                </div>
                <div className="text-sm font-semibold text-white">Any Barber</div>
                <div className="text-xs text-neutral-500 mt-1">First available</div>
              </div>
              {barbers.map((b, i) => (
                <div key={b.id}
                  onClick={() => { setSelectedBarber(b); setStep(2) }}
                  className="bg-[#1a1a1a] border-2 border-neutral-800 hover:border-amber-500 rounded-xl p-4 cursor-pointer transition-all text-center">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 font-serif text-lg font-bold"
                    style={{ background: (b.color || COLORS[i % COLORS.length]) + '22', border: `2px solid ${b.color || COLORS[i % COLORS.length]}`, color: b.color || COLORS[i % COLORS.length] }}>
                    {(b.barber_name || b.alias || '?')[0].toUpperCase()}
                  </div>
                  <div className="text-sm font-semibold text-white">{b.barber_name || b.alias}</div>
                  {b.alias && b.barber_name && <div className="text-xs text-neutral-500 mt-1">{b.alias}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 2 — SERVICE */}
        {step === 2 && (
          <div>
            <h2 className="font-serif text-xl text-white mb-1">Choose a service</h2>
            <p className="text-neutral-500 text-sm mb-6">Select what you'd like done today.</p>
            <div className="space-y-2 mb-6">
              {services.map((s) => (
                <div key={s.id}
                  onClick={() => { setSelectedService(s); setStep(3) }}
                  className={`bg-[#1a1a1a] border-2 rounded-xl p-4 cursor-pointer transition-all flex items-center justify-between
                    ${selectedService?.id === s.id ? 'border-amber-500' : 'border-neutral-800 hover:border-neutral-600'}`}>
                  <div>
                    <div className="text-sm font-semibold text-white">{s.name}</div>
                    <div className="text-xs text-neutral-500 mt-0.5">{s.description} · {s.duration_minutes} mins</div>
                  </div>
                  <div className="font-serif text-lg text-amber-500 ml-4 flex-shrink-0">${s.price}</div>
                </div>
              ))}
            </div>
            <button onClick={() => setStep(1)} className="text-sm text-neutral-500 hover:text-white transition-colors">← Back</button>
          </div>
        )}

        {/* STEP 3 — DATE & TIME */}
        {step === 3 && (
          <div>
            <h2 className="font-serif text-xl text-white mb-1">Pick a date & time</h2>
            <p className="text-neutral-500 text-sm mb-6">Choose when you'd like to come in.</p>
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-2">Date</label>
                <input type="date" value={selectedDate} min={today}
                  onChange={e => setSelectedDate(e.target.value)}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-amber-500 transition-colors" />
              </div>
              {selectedDate && (
                <div>
                  <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-2">Time</label>
                  <div className="grid grid-cols-4 gap-2">
                    {TIMES.map(t => (
                      <button key={t} onClick={() => setSelectedTime(t)}
                        className={`py-2 rounded-lg text-xs font-medium transition-all border
                          ${selectedTime === t ? 'bg-amber-500 border-amber-500 text-black' : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:border-neutral-500'}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="text-sm text-neutral-500 hover:text-white transition-colors">← Back</button>
              <button onClick={() => { if (!selectedDate || !selectedTime) { setError('Please select a date and time'); return }; setError(''); setStep(4) }}
                className="ml-auto bg-amber-500 hover:bg-amber-400 text-black font-semibold px-6 py-2.5 rounded-lg text-sm transition-colors">
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* STEP 4 — CLIENT INFO */}
        {step === 4 && (
          <div>
            <h2 className="font-serif text-xl text-white mb-1">Your info</h2>
            <p className="text-neutral-500 text-sm mb-6">No account needed. Just your name and number.</p>

            {/* BOOKING SUMMARY */}
            <div className="bg-[#1a1a1a] border border-neutral-800 rounded-xl p-4 mb-6 space-y-2">
              <div className="text-xs font-semibold tracking-widest uppercase text-neutral-500 mb-3">Booking Summary</div>
              <div className="flex justify-between text-sm">
                <span className="text-neutral-400">Barber</span>
                <span className="text-white">{selectedBarber?.barber_name || selectedBarber?.alias || 'Any Available'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-neutral-400">Service</span>
                <span className="text-white">{selectedService?.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-neutral-400">Date</span>
                <span className="text-white">{new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-neutral-400">Time</span>
                <span className="text-white">{selectedTime}</span>
              </div>
              <div className="flex justify-between text-sm border-t border-neutral-700 pt-2 mt-2">
                <span className="text-neutral-400">Total</span>
                <span className="text-amber-500 font-mono font-semibold">${selectedService?.price}</span>
              </div>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-2">Full Name *</label>
                <input type="text" value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Your name"
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-amber-500 transition-colors" />
              </div>
              <div>
                <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-2">Phone Number *</label>
                <input type="tel" value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder="(555) 000-0000"
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-amber-500 transition-colors" />
              </div>
              <div>
                <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-2">Email (optional)</label>
                <input type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="For confirmation email"
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-amber-500 transition-colors" />
              </div>
              <div>
                <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-2">Notes (optional)</label>
                <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any requests or info for your barber"
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-amber-500 transition-colors" />
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep(3)} className="text-sm text-neutral-500 hover:text-white transition-colors">← Back</button>
              <button onClick={handleBook} disabled={submitting || !clientName || !clientPhone}
                className="ml-auto bg-amber-500 hover:bg-amber-400 text-black font-semibold px-8 py-3 rounded-lg text-sm transition-colors disabled:opacity-50">
                {submitting ? 'Booking...' : 'Confirm Booking'}
              </button>
            </div>

            <p className="text-neutral-600 text-xs text-center mt-4">Powered by ChairOS</p>
          </div>
        )}
      </div>
    </div>
  )
}