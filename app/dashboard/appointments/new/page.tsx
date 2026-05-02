'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

const TIMES = [
  '8:00 AM','8:30 AM','9:00 AM','9:30 AM','10:00 AM','10:30 AM',
  '11:00 AM','11:30 AM','12:00 PM','12:30 PM','1:00 PM','1:30 PM',
  '2:00 PM','2:30 PM','3:00 PM','3:30 PM','4:00 PM','4:30 PM',
  '5:00 PM','5:30 PM','6:00 PM','6:30 PM','7:00 PM'
]

export default function NewAppointment() {
  const [shop, setShop] = useState<any>(null)
  const [barbers, setBarbers] = useState<any[]>([])
  const [services, setServices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const [selectedBarber, setSelectedBarber] = useState('')
  const [selectedService, setSelectedService] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [price, setPrice] = useState('')

  const router = useRouter()
  const supabase = createClient()

  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: shops } = await supabase
        .from('shops').select('*').eq('owner_id', user.id)
        .order('created_at', { ascending: true }).limit(1)
      const shop = shops?.[0] || null
      if (!shop) { router.push('/onboarding'); return }
      setShop(shop)

      const { data: barbers } = await supabase
        .from('shop_barbers').select('*')
        .eq('shop_id', shop.id).eq('active', true)
      setBarbers(barbers || [])

      const { data: services } = await supabase
        .from('services').select('*')
        .eq('shop_id', shop.id).eq('active', true)
        .order('price', { ascending: true })
      setServices(services || [])

      setDate(today)
      setLoading(false)
    }
    load()
  }, [])

  function handleServiceChange(serviceId: string) {
    setSelectedService(serviceId)
    const svc = services.find(s => s.id === serviceId)
    if (svc) setPrice(String(svc.price))
  }

  async function handleBook() {
    if (!clientName || !clientPhone || !selectedService || !date || !time) {
      setError('Client name, phone, service, date and time are required')
      return
    }
    setSaving(true); setError('')

    const [t, period] = time.split(' ')
    const [hours, minutes] = t.split(':')
    let h = parseInt(hours)
    if (period === 'PM' && h !== 12) h += 12
    if (period === 'AM' && h === 12) h = 0
    const time24 = `${h.toString().padStart(2,'0')}:${minutes}:00`

    const barber = barbers.find(b => b.id === selectedBarber)

    const { error: bookErr } = await supabase.from('appointments').insert({
      shop_id: shop.id,
      barber_id: barber?.barber_id || null,
      service_id: selectedService,
      client_name: clientName,
      client_phone: clientPhone,
      client_email: clientEmail || null,
      date,
      time: time24,
      price: parseFloat(price),
      status: 'confirmed',
      notes: notes || null
    })

    if (bookErr) { setError(bookErr.message); setSaving(false); return }
    setSuccess(true)
    setSaving(false)
  }

  if (loading) return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
      <div className="text-amber-500 text-sm">Loading...</div>
    </div>
  )

  if (success) return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-8">
          <div className="w-14 h-14 bg-green-500/10 border border-green-500/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <h2 className="font-serif text-xl text-white mb-2">Appointment booked</h2>
          <p className="text-neutral-400 text-sm mb-6">The appointment has been added to today's schedule.</p>
          <div className="flex gap-3">
            <button onClick={() => { setSuccess(false); setClientName(''); setClientPhone(''); setClientEmail(''); setNotes(''); setSelectedBarber(''); setSelectedService(''); setTime(''); setPrice('') }}
              className="flex-1 bg-neutral-800 border border-neutral-700 text-neutral-400 font-semibold py-3 rounded-lg text-sm hover:text-white transition-colors">
              Book Another
            </button>
            <button onClick={() => router.push('/dashboard')}
              className="flex-1 bg-amber-500 hover:bg-amber-400 text-black font-semibold py-3 rounded-lg text-sm transition-colors">
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-neutral-950">
      <header className="bg-neutral-900 border-b border-neutral-800 px-6 h-14 flex items-center justify-between sticky top-0 z-10">
        <span className="font-serif text-amber-500 text-lg">ChairOS</span>
        <button onClick={() => router.push('/dashboard')} className="text-xs text-neutral-500 hover:text-white transition-colors">← Dashboard</button>
      </header>

      <div className="p-6 max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="font-serif text-2xl text-white mb-1">New Appointment</h1>
          <p className="text-neutral-500 text-sm">Book a walk-in or call-in for {shop?.name}</p>
        </div>

        {error && <p className="text-red-400 text-sm bg-red-950 border border-red-900 rounded-lg p-3 mb-6">{error}</p>}

        <div className="space-y-6">

          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
            <div className="text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-4">Client Info</div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-2">Full Name *</label>
                <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Client name"
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-amber-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-2">Phone *</label>
                <input type="tel" value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder="(555) 000-0000"
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-amber-500" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-2">Email (optional)</label>
                <input type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="client@email.com"
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-amber-500" />
              </div>
            </div>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
            <div className="text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-4">Appointment Details</div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-2">Barber</label>
                <select value={selectedBarber} onChange={e => setSelectedBarber(e.target.value)}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-amber-500">
                  <option value="">Any Available</option>
                  {barbers.map(b => (
                    <option key={b.id} value={b.id}>{b.barber_name || b.alias}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-2">Service *</label>
                <select value={selectedService} onChange={e => handleServiceChange(e.target.value)}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-amber-500">
                  <option value="">Select service...</option>
                  {services.map(s => (
                    <option key={s.id} value={s.id}>{s.name} — ${s.price}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-2">Date *</label>
                <input type="date" value={date} min={today} onChange={e => setDate(e.target.value)}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-amber-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-2">Price</label>
                <div className="relative">
                  <span className="absolute left-4 top-3 text-neutral-400 text-sm">$</span>
                  <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="0"
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg pl-8 pr-4 py-3 text-white text-sm outline-none focus:border-amber-500" />
                </div>
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-2">Time *</label>
              <div className="grid grid-cols-5 gap-2">
                {TIMES.map(t => (
                  <button key={t} onClick={() => setTime(t)}
                    className={`py-2 rounded-lg text-xs font-medium transition-all border ${
                      time === t ? 'bg-amber-500 border-amber-500 text-black' : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:border-neutral-500'
                    }`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-2">Notes (optional)</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any notes about this appointment"
                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-amber-500" />
            </div>
          </div>

          <button onClick={handleBook} disabled={saving}
            className="w-full bg-amber-500 hover:bg-amber-400 text-black font-semibold py-3 rounded-lg text-sm transition-colors disabled:opacity-50">
            {saving ? 'Booking...' : 'Book Appointment'}
          </button>
        </div>
      </div>
    </div>
  )
}