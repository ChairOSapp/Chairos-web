'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

const DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']
const CATALOG = [
  { name: 'Precision Haircut', price: 55, duration_minutes: 30, description: 'Clean lines, sharp edges' },
  { name: 'Fade', price: 45, duration_minutes: 30, description: 'Skin fade or taper' },
  { name: 'Cut + Beard Sculpt', price: 65, duration_minutes: 45, description: 'Full cut and beard sculpt' },
  { name: 'Beard Sculpt', price: 40, duration_minutes: 30, description: 'Precision beard shaping' },
  { name: 'Hot Towel Shave', price: 50, duration_minutes: 30, description: '3-step straight razor shave' },
  { name: 'Line-Up / Edge-Up', price: 25, duration_minutes: 15, description: 'Clean edge and line-up' },
  { name: 'Youth Cut', price: 40, duration_minutes: 30, description: 'Precision cut for kids' },
  { name: 'VIP Experience', price: 150, duration_minutes: 75, description: 'Full VIP service' },
]
const BARBER_COLORS = ['#b8861f','#4a7fb5','#3aab6e','#e07850','#9b6db5','#c06060']

export default function Onboarding() {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Step 1 — Shop info
  const [shopName, setShopName] = useState('')
  const [shopAddress, setShopAddress] = useState('')
  const [shopCity, setShopCity] = useState('')
  const [shopPhone, setShopPhone] = useState('')

  // Step 2 — Services
  const [services, setServices] = useState<any[]>([])
  const [selectedCatalog, setSelectedCatalog] = useState<Set<number>>(new Set())
  const [svcMode, setSvcMode] = useState<'catalog'|'custom'>('catalog')
  const [customName, setCustomName] = useState('')
  const [customPrice, setCustomPrice] = useState('')
  const [customDuration, setCustomDuration] = useState('30')
  const [customDesc, setCustomDesc] = useState('')

  // Step 3 — Barbers
  const [barbers, setBarbers] = useState<any[]>([])
  const [barberName, setBarberName] = useState('')
  const [barberAlias, setBarberAlias] = useState('')
  const [compType, setCompType] = useState<'commission'|'booth_rent'>('commission')
  const [commissionRate, setCommissionRate] = useState('70')
  const [tipSplit, setTipSplit] = useState('100')
  const [boothRent, setBoothRent] = useState('')
  const [rentDueDay, setRentDueDay] = useState('monday')
  const [lateFeeRate, setLateFeeRate] = useState('5')
  const [lateFeeInterval, setLateFeeInterval] = useState<'daily'|'weekly'>('daily')

  const router = useRouter()
  const supabase = createClient()

  function toggleCatalog(i: number) {
    const next = new Set(selectedCatalog)
    if (next.has(i)) {
      next.delete(i)
      setServices(services.filter(s => s._idx !== i))
    } else {
      next.add(i)
      const s = CATALOG[i]
      setServices([...services, { ...s, _idx: i }])
    }
    setSelectedCatalog(next)
  }

  function addCustomService() {
    if (!customName || !customPrice) return
    setServices([...services, {
      name: customName,
      price: parseFloat(customPrice),
      duration_minutes: parseInt(customDuration),
      description: customDesc
    }])
    setCustomName(''); setCustomPrice(''); setCustomDesc('')
  }

  function removeService(i: number) {
    const s = services[i]
    if (s._idx !== undefined) {
      const next = new Set(selectedCatalog)
      next.delete(s._idx)
      setSelectedCatalog(next)
    }
    setServices(services.filter((_, idx) => idx !== i))
  }

  function addBarber() {
    if (!barberName) return
    setBarbers([...barbers, {
      name: barberName,
      alias: barberAlias,
      compensation_type: compType,
      commission_rate: compType === 'commission' ? parseFloat(commissionRate) / 100 : null,
      tip_split_rate: parseFloat(tipSplit) / 100,
      booth_rent_amount: compType === 'booth_rent' ? parseFloat(boothRent) : null,
      booth_rent_due_day: compType === 'booth_rent' ? rentDueDay : null,
      late_fee_rate: compType === 'booth_rent' ? parseFloat(lateFeeRate) / 100 : null,
      late_fee_interval: compType === 'booth_rent' ? lateFeeInterval : null,
      color: BARBER_COLORS[barbers.length % BARBER_COLORS.length]
    }])
    setBarberName(''); setBarberAlias('')
  }

  function removeBarber(i: number) {
    setBarbers(barbers.filter((_, idx) => idx !== i))
  }

  async function handleLaunch() {
    setLoading(true)
    setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not logged in')

      // Create shop
      const { data: shop, error: shopErr } = await supabase
        .from('shops')
        .insert({ name: shopName, address: shopAddress, city: shopCity, phone: shopPhone, owner_id: user.id })
        .select()
        .single()
      if (shopErr) throw shopErr

      // Create services
      if (services.length > 0) {
        const { error: svcErr } = await supabase.from('services').insert(
          services.map(s => ({ shop_id: shop.id, name: s.name, price: s.price, duration_minutes: s.duration_minutes, description: s.description }))
        )
        if (svcErr) throw svcErr
      }

      // Create barbers
      for (const b of barbers) {
        const { error: bErr } = await supabase.from('shop_barbers').insert({
          shop_id: shop.id,
          barber_id: user.id,
          alias: b.alias || b.name,
          color: b.color,
          compensation_type: b.compensation_type,
          commission_rate: b.commission_rate,
          tip_split_rate: b.tip_split_rate,
          booth_rent_amount: b.booth_rent_amount,
          booth_rent_due_day: b.booth_rent_due_day,
          late_fee_rate: b.late_fee_rate,
          late_fee_interval: b.late_fee_interval
        })
        if (bErr) throw bErr
      }

      router.push('/dashboard')
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  const stepLabel = ['Shop Info', 'Services', 'Barbers']

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col items-center py-10 px-4">

      {/* HEADER */}
      <div className="text-center mb-8">
        <h1 className="font-serif text-3xl text-amber-500 mb-1">ChairOS</h1>
        <p className="text-neutral-400 text-sm">Let's set up your shop</p>
      </div>

      {/* PROGRESS */}
      <div className="w-full max-w-lg mb-8">
        <div className="flex items-center">
          {stepLabel.map((label, i) => (
            <div key={i} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all
                  ${step > i+1 ? 'bg-green-500 text-white' : step === i+1 ? 'bg-amber-500 text-black' : 'bg-neutral-800 text-neutral-500'}`}>
                  {step > i+1 ? '✓' : i+1}
                </div>
                <div className={`text-xs mt-1 font-medium ${step === i+1 ? 'text-amber-500' : step > i+1 ? 'text-green-500' : 'text-neutral-600'}`}>
                  {label}
                </div>
              </div>
              {i < stepLabel.length-1 && (
                <div className={`flex-1 h-0.5 mx-2 mb-4 transition-all ${step > i+1 ? 'bg-green-500' : 'bg-neutral-800'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-xl p-8">

        {error && <p className="text-red-400 text-sm bg-red-950 border border-red-900 rounded-lg p-3 mb-4">{error}</p>}

        {/* STEP 1 */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h2 className="font-serif text-xl text-white mb-1">Your shop</h2>
              <p className="text-neutral-500 text-sm">This is how clients will find you.</p>
            </div>
            {[
              { label: 'Shop Name', value: shopName, set: setShopName, placeholder: 'e.g. Precision House', required: true },
              { label: 'Phone', value: shopPhone, set: setShopPhone, placeholder: '(555) 000-0000', required: false },
              { label: 'Street Address', value: shopAddress, set: setShopAddress, placeholder: '123 Main St', required: false },
              { label: 'City', value: shopCity, set: setShopCity, placeholder: 'Jacksonville, FL', required: false },
            ].map(f => (
              <div key={f.label}>
                <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-2">{f.label}</label>
                <input value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.placeholder}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-amber-500 transition-colors" />
              </div>
            ))}
            <button onClick={() => { if (!shopName) { setError('Shop name is required'); return }; setError(''); setStep(2) }}
              className="w-full bg-amber-500 hover:bg-amber-400 text-black font-semibold py-3 rounded-lg text-sm mt-4">
              Continue →
            </button>
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div>
            <div className="mb-5">
              <h2 className="font-serif text-xl text-white mb-1">Your services</h2>
              <p className="text-neutral-500 text-sm">Pick from the catalog or add custom services.</p>
            </div>

            {/* Mode tabs */}
            <div className="flex gap-1 bg-neutral-800 rounded-lg p-1 mb-5 w-fit">
              {(['catalog','custom'] as const).map(m => (
                <button key={m} onClick={() => setSvcMode(m)}
                  className={`px-4 py-2 rounded-md text-xs font-semibold capitalize transition-all ${svcMode === m ? 'bg-neutral-700 text-white' : 'text-neutral-500'}`}>
                  {m === 'catalog' ? 'Service Catalog' : 'Custom Service'}
                </button>
              ))}
            </div>

            {/* Catalog */}
            {svcMode === 'catalog' && (
              <div className="grid grid-cols-2 gap-2 mb-4 max-h-64 overflow-y-auto pr-1">
                {CATALOG.map((s, i) => (
                  <div key={i} onClick={() => toggleCatalog(i)}
                    className={`p-3 rounded-lg border cursor-pointer transition-all relative ${selectedCatalog.has(i) ? 'border-amber-500 bg-amber-500/10' : 'border-neutral-700 bg-neutral-800 hover:border-neutral-600'}`}>
                    {selectedCatalog.has(i) && <div className="absolute top-2 right-2 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center text-black text-xs font-bold">✓</div>}
                    <div className="text-sm font-semibold text-white mb-0.5">{s.name}</div>
                    <div className="text-xs text-neutral-400">{s.duration_minutes} mins</div>
                    <div className="text-sm font-semibold text-amber-500 mt-1">${s.price}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Custom */}
            {svcMode === 'custom' && (
              <div className="bg-neutral-800 rounded-lg p-4 mb-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-1.5">Name</label>
                    <input value={customName} onChange={e => setCustomName(e.target.value)} placeholder="Service name"
                      className="w-full bg-neutral-700 border border-neutral-600 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-amber-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-1.5">Price</label>
                    <input value={customPrice} onChange={e => setCustomPrice(e.target.value)} placeholder="$50"
                      className="w-full bg-neutral-700 border border-neutral-600 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-amber-500" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-1.5">Duration (mins)</label>
                    <input value={customDuration} onChange={e => setCustomDuration(e.target.value)} placeholder="30"
                      className="w-full bg-neutral-700 border border-neutral-600 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-amber-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-1.5">Description</label>
                    <input value={customDesc} onChange={e => setCustomDesc(e.target.value)} placeholder="Optional"
                      className="w-full bg-neutral-700 border border-neutral-600 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-amber-500" />
                  </div>
                </div>
                <button onClick={addCustomService}
                  className="w-full border border-dashed border-neutral-600 rounded-lg py-2 text-neutral-400 hover:border-amber-500 hover:text-amber-500 text-sm transition-colors">
                  + Add Service
                </button>
              </div>
            )}

            {/* Added services */}
            {services.length > 0 && (
              <div className="border-t border-neutral-800 pt-4 mb-4">
                <div className="text-xs font-semibold tracking-widest uppercase text-neutral-500 mb-3">
                  Your Services ({services.length})
                </div>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {services.map((s, i) => (
                    <div key={i} className="flex items-center justify-between bg-neutral-800 rounded-lg px-3 py-2">
                      <div>
                        <div className="text-sm font-medium text-white">{s.name}</div>
                        <div className="text-xs text-neutral-400">${s.price} · {s.duration_minutes} mins</div>
                      </div>
                      <button onClick={() => removeService(i)} className="text-neutral-600 hover:text-red-400 transition-colors text-lg leading-none">×</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3 mt-4">
              <button onClick={() => setStep(1)} className="px-6 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-neutral-400 hover:text-white transition-colors">
                Back
              </button>
              <button onClick={() => setStep(3)} className="flex-1 bg-amber-500 hover:bg-amber-400 text-black font-semibold py-3 rounded-lg text-sm">
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <div>
            <div className="mb-5">
              <h2 className="font-serif text-xl text-white mb-1">Your barbers</h2>
              <p className="text-neutral-500 text-sm">Set up each barber and their compensation.</p>
            </div>

            {/* Added barbers */}
            {barbers.length > 0 && (
              <div className="space-y-2 mb-5">
                {barbers.map((b, i) => (
                  <div key={i} className="flex items-center justify-between bg-neutral-800 rounded-lg px-3 py-2.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center font-serif text-sm font-bold"
                        style={{ background: b.color + '22', border: `2px solid ${b.color}`, color: b.color }}>
                        {b.name[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-white">{b.name}</div>
                        <div className="text-xs text-neutral-400">
                          {b.compensation_type === 'commission'
                            ? `${Math.round(b.commission_rate * 100)}% commission · Tips ${Math.round(b.tip_split_rate * 100)}%`
                            : `Booth rent $${b.booth_rent_amount}/wk · Due ${b.booth_rent_due_day}`}
                        </div>
                      </div>
                    </div>
                    <button onClick={() => removeBarber(i)} className="text-neutral-600 hover:text-red-400 transition-colors text-lg leading-none">×</button>
                  </div>
                ))}
              </div>
            )}

            {/* Add barber form */}
            <div className="bg-neutral-800 rounded-lg p-4 space-y-3">
              <div className="text-xs font-semibold tracking-widest uppercase text-neutral-400">Add a Barber</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-neutral-500 mb-1.5">First Name *</label>
                  <input value={barberName} onChange={e => setBarberName(e.target.value)} placeholder="Marcus"
                    className="w-full bg-neutral-700 border border-neutral-600 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-amber-500" />
                </div>
                <div>
                  <label className="block text-xs text-neutral-500 mb-1.5">Alias / Specialty</label>
                  <input value={barberAlias} onChange={e => setBarberAlias(e.target.value)} placeholder="Fade King"
                    className="w-full bg-neutral-700 border border-neutral-600 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-amber-500" />
                </div>
              </div>

              {/* Compensation type */}
              <div>
                <label className="block text-xs text-neutral-500 mb-1.5">Compensation Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['commission','booth_rent'] as const).map(t => (
                    <button key={t} type="button" onClick={() => setCompType(t)}
                      className={`py-2 rounded-lg border text-xs font-semibold transition-colors ${compType === t ? 'bg-amber-500 border-amber-500 text-black' : 'bg-neutral-700 border-neutral-600 text-neutral-400'}`}>
                      {t === 'commission' ? 'Commission' : 'Booth Rent'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Commission fields */}
              {compType === 'commission' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-neutral-500 mb-1.5">Barber Commission %</label>
                    <div className="relative">
                      <input type="number" min="1" max="100" value={commissionRate} onChange={e => setCommissionRate(e.target.value)}
                        className="w-full bg-neutral-700 border border-neutral-600 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-amber-500 pr-8" />
                      <span className="absolute right-3 top-2 text-neutral-400 text-sm">%</span>
                    </div>
                    <div className="text-xs text-neutral-500 mt-1">Shop keeps {100 - parseInt(commissionRate || '0')}%</div>
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-500 mb-1.5">Barber Tip %</label>
                    <div className="relative">
                      <input type="number" min="1" max="100" value={tipSplit} onChange={e => setTipSplit(e.target.value)}
                        className="w-full bg-neutral-700 border border-neutral-600 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-amber-500 pr-8" />
                      <span className="absolute right-3 top-2 text-neutral-400 text-sm">%</span>
                    </div>
                    <div className="text-xs text-neutral-500 mt-1">Default 100% to barber</div>
                  </div>
                </div>
              )}

              {/* Booth rent fields */}
              {compType === 'booth_rent' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-neutral-500 mb-1.5">Weekly Rent $</label>
                      <input type="number" value={boothRent} onChange={e => setBoothRent(e.target.value)} placeholder="150"
                        className="w-full bg-neutral-700 border border-neutral-600 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-amber-500" />
                    </div>
                    <div>
                      <label className="block text-xs text-neutral-500 mb-1.5">Due Every</label>
                      <select value={rentDueDay} onChange={e => setRentDueDay(e.target.value)}
                        className="w-full bg-neutral-700 border border-neutral-600 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-amber-500">
                        {DAYS.map(d => <option key={d} value={d} className="capitalize">{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-neutral-500 mb-1.5">Late Fee %</label>
                      <div className="relative">
                        <input type="number" value={lateFeeRate} onChange={e => setLateFeeRate(e.target.value)} placeholder="5"
                          className="w-full bg-neutral-700 border border-neutral-600 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-amber-500 pr-8" />
                        <span className="absolute right-3 top-2 text-neutral-400 text-sm">%</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-neutral-500 mb-1.5">Applied Per</label>
                      <select value={lateFeeInterval} onChange={e => setLateFeeInterval(e.target.value as any)}
                        className="w-full bg-neutral-700 border border-neutral-600 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-amber-500">
                        <option value="daily">Day</option>
                        <option value="weekly">Week</option>
                      </select>
                    </div>
                  </div>
                  <div className="text-xs text-neutral-500 bg-neutral-700 rounded-lg p-2">
                    Late fee of {lateFeeRate}% will be added per {lateFeeInterval === 'daily' ? 'day' : 'week'} after the due date
                  </div>
                </div>
              )}

              <button onClick={addBarber} disabled={!barberName}
                className="w-full border border-dashed border-neutral-600 rounded-lg py-2 text-neutral-400 hover:border-amber-500 hover:text-amber-500 text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                + Add Barber
              </button>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setStep(2)} className="px-6 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-neutral-400 hover:text-white transition-colors">
                Back
              </button>
              <button onClick={handleLaunch} disabled={loading || !shopName}
                className="flex-1 bg-amber-500 hover:bg-amber-400 text-black font-semibold py-3 rounded-lg text-sm disabled:opacity-50">
                {loading ? 'Setting up your shop...' : 'Launch My Shop →'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}