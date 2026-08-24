'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { withIndefiniteArticle } from '@/lib/VerticalContext'

const DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']

type Vertical = 'barbershop' | 'salon' | 'tattoo'

const VERTICAL_OPTIONS: { value: Vertical; name: string; blurb: string }[] = [
  { value: 'barbershop', name: 'Barbershop', blurb: 'Barbers, fades, and cuts' },
  { value: 'salon', name: 'Salon', blurb: 'Stylists, color, and styling' },
  { value: 'tattoo', name: 'Tattoo Studio', blurb: 'Artists and tattoo sessions' },
]

type Preset = { name: string; duration_minutes: number }

const BARBER_COLORS = ['#b8861f','#4a7fb5','#3aab6e','#e07850','#9b6db5','#c06060']

export default function Onboarding() {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState('')

  const [shopName, setShopName] = useState('')
  const [shopAddress, setShopAddress] = useState('')
  const [shopCity, setShopCity] = useState('')
  const [shopPhone, setShopPhone] = useState('')
  const [vertical, setVertical] = useState<Vertical | null>(null)
  const [verticalMeta, setVerticalMeta] = useState<Record<Vertical, { staff_label: string; staff_label_plural: string }>>({
    barbershop: { staff_label: 'Barber', staff_label_plural: 'Barbers' },
    salon: { staff_label: 'Stylist', staff_label_plural: 'Stylists' },
    tattoo: { staff_label: 'Artist', staff_label_plural: 'Artists' },
  })

  const [presets, setPresets] = useState<Record<Vertical, Preset[]>>({ barbershop: [], salon: [], tattoo: [] })
  const [services, setServices] = useState<any[]>([])
  const [customName, setCustomName] = useState('')
  const [customPrice, setCustomPrice] = useState('')
  const [customDuration, setCustomDuration] = useState('30')
  const [customDesc, setCustomDesc] = useState('')

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

  useEffect(() => {
    async function checkShop() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: shop } = await supabase
        .from('shops')
        .select('id')
        .eq('owner_id', user.id)
        .maybeSingle()
      if (shop) { router.push('/dashboard'); return }
      setChecking(false)
    }
    checkShop()

    async function loadVerticalMeta() {
      const { data } = await supabase.from('vertical_config').select('*')
      if (!data) return
      setVerticalMeta(prev => {
        const next = { ...prev }
        for (const row of data as any[]) {
          next[row.vertical as Vertical] = { staff_label: row.staff_label, staff_label_plural: row.staff_label_plural }
        }
        return next
      })
    }
    loadVerticalMeta()

    async function loadPresets() {
      const { data } = await supabase.from('service_presets').select('vertical, name, duration_minutes').order('sort_order')
      if (!data) return
      const next: Record<Vertical, Preset[]> = { barbershop: [], salon: [], tattoo: [] }
      for (const row of data as any[]) {
        next[row.vertical as Vertical].push({ name: row.name, duration_minutes: row.duration_minutes })
      }
      setPresets(next)
    }
    loadPresets()
  }, [])

  function addCustomService() {
    if (!customName || !customPrice) return
    setServices(prev => [...prev, {
      name: customName,
      price: parseFloat(customPrice),
      duration_minutes: parseInt(customDuration),
      description: customDesc
    }])
    setCustomName(''); setCustomPrice(''); setCustomDesc('')
  }

  function removeService(i: number) {
    setServices(prev => prev.filter((_, idx) => idx !== i))
  }

  function addBarber() {
    if (!barberName.trim()) return
    const newBarber = {
      name: barberName.trim(),
      alias: barberAlias.trim(),
      compensation_type: compType,
      commission_rate: compType === 'commission' ? parseFloat(commissionRate) / 100 : null,
      tip_split_rate: parseFloat(tipSplit) / 100,
      booth_rent_amount: compType === 'booth_rent' ? parseFloat(boothRent) : null,
      booth_rent_due_day: compType === 'booth_rent' ? rentDueDay : null,
      late_fee_rate: compType === 'booth_rent' ? parseFloat(lateFeeRate) / 100 : null,
      late_fee_interval: compType === 'booth_rent' ? lateFeeInterval : null,
      color: BARBER_COLORS[barbers.length % BARBER_COLORS.length]
    }
    setBarbers(prev => [...prev, newBarber])
    setBarberName('')
    setBarberAlias('')
  }

  function removeBarber(i: number) {
    setBarbers(prev => prev.filter((_, idx) => idx !== i))
  }

  async function handleLaunch() {
    setLoading(true)
    setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not logged in')

      const { data: shop, error: shopErr } = await supabase
        .rpc('create_shop_with_services', {
          p_name: shopName,
          p_address: shopAddress,
          p_city: shopCity,
          p_phone: shopPhone,
          p_vertical: vertical,
          p_custom_services: services.map(s => ({ name: s.name, price: s.price, duration_minutes: s.duration_minutes, description: s.description })),
        })
        .single()
      if (shopErr) throw shopErr
      if (!shop) throw new Error('Failed to create shop — please try again.')
      const createdShop = shop as any

      if (barbers.length > 0) {
        const { error: bErr } = await supabase.from('shop_barbers').insert(
          barbers.map(b => ({
            shop_id: createdShop.id,
            barber_id: null,
            barber_name: b.name,
            alias: b.alias || b.name,
            color: b.color,
            compensation_type: b.compensation_type,
            commission_rate: b.commission_rate,
            tip_split_rate: b.tip_split_rate,
            booth_rent_amount: b.booth_rent_amount,
            booth_rent_due_day: b.booth_rent_due_day,
            late_fee_rate: b.late_fee_rate,
            late_fee_interval: b.late_fee_interval
          }))
        )
        if (bErr) throw bErr
      }

      router.push('/subscribe?plan=owner')
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  const activeVertical = vertical || 'barbershop'
  const staffLabel = verticalMeta[activeVertical].staff_label
  const staffLabelPlural = verticalMeta[activeVertical].staff_label_plural

  const stepLabel = ['Shop Info', 'Services', staffLabelPlural]

  if (checking) return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center">
      <div className="text-od-green text-sm">Loading...</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-warm-50 flex flex-col items-center py-10 px-4">
      <div className="text-center mb-8">
        <h1 className="font-serif text-3xl text-od-green mb-1">ChairOS</h1>
        <p className="text-charcoal-400 text-sm">Let's set up your shop</p>
      </div>

      <div className="w-full max-w-lg mb-8">
        <div className="flex items-center">
          {stepLabel.map((label, i) => (
            <div key={i} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all
                  ${step > i+1 ? 'bg-green-500 text-white' : step === i+1 ? 'bg-od-green text-white' : 'bg-warm-200 text-charcoal-500'}`}>
                  {step > i+1 ? '✓' : i+1}
                </div>
                <div className={`text-xs mt-1 font-medium ${step === i+1 ? 'text-od-green' : step > i+1 ? 'text-green-500' : 'text-charcoal-600'}`}>
                  {label}
                </div>
              </div>
              {i < stepLabel.length-1 && (
                <div className={`flex-1 h-0.5 mx-2 mb-4 transition-all ${step > i+1 ? 'bg-green-500' : 'bg-warm-200'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="w-full max-w-lg bg-warm-100 border border-warm-200 rounded-xl p-8">
        {error && <p className="text-red-400 text-sm bg-red-950 border border-red-900 rounded-lg p-3 mb-4">{error}</p>}

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h2 className="font-serif text-xl text-charcoal-900 mb-1">Your shop</h2>
              <p className="text-charcoal-500 text-sm">This is how clients will find you.</p>
            </div>
            <div>
              <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Business Type</label>
              <div className="grid grid-cols-3 gap-2">
                {VERTICAL_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setVertical(opt.value)}
                    className={`text-left p-3 rounded-lg border transition-colors ${
                      vertical === opt.value
                        ? 'bg-od-green/10 border-od-green/50'
                        : 'bg-warm-200 border-warm-300 hover:border-warm-400'
                    }`}
                  >
                    <div className={`font-semibold text-xs mb-0.5 ${vertical === opt.value ? 'text-od-green' : 'text-charcoal-900'}`}>
                      {opt.name}
                    </div>
                    <div className="text-[11px] text-charcoal-500">{opt.blurb}</div>
                  </button>
                ))}
              </div>
            </div>
            {[
              { label: 'Shop Name', value: shopName, set: setShopName, placeholder: 'e.g. Precision House' },
              { label: 'Phone', value: shopPhone, set: setShopPhone, placeholder: '(555) 000-0000' },
              { label: 'Street Address', value: shopAddress, set: setShopAddress, placeholder: '123 Main St' },
              { label: 'City', value: shopCity, set: setShopCity, placeholder: 'Jacksonville, FL' },
            ].map(f => (
              <div key={f.label}>
                <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">{f.label}</label>
                <input value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.placeholder}
                  className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors" />
              </div>
            ))}
            <button onClick={() => {
              if (!vertical) { setError('Please select a business type'); return }
              if (!shopName) { setError('Shop name is required'); return }
              setError(''); setStep(2)
            }}
              className="w-full bg-od-green hover:bg-od-green-light text-white font-semibold py-3 rounded-lg text-sm mt-4">
              Continue →
            </button>
          </div>
        )}

        {step === 2 && (
          <div>
            <div className="mb-5">
              <h2 className="font-serif text-xl text-charcoal-900 mb-1">Your services</h2>
              <p className="text-charcoal-500 text-sm">We'll add these to your shop automatically — set prices anytime from Settings.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-5 max-h-64 overflow-y-auto pr-1">
              {presets[activeVertical].map((s, i) => (
                <div key={i} className="p-3 rounded-lg border border-warm-300 bg-warm-200">
                  <div className="text-sm font-semibold text-charcoal-900 mb-0.5">{s.name}</div>
                  <div className="text-xs text-charcoal-400">{s.duration_minutes} mins · price TBD</div>
                </div>
              ))}
            </div>
            <div className="border-t border-warm-200 pt-4 mb-4">
              <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500 mb-3">
                Add a custom service (optional)
              </div>
              <div className="bg-warm-200 rounded-lg p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-1.5">Name</label>
                    <input value={customName} onChange={e => setCustomName(e.target.value)} placeholder="Service name"
                      className="w-full bg-warm-300 border border-warm-400 rounded-lg px-3 py-2 text-charcoal-900 text-sm outline-none focus:border-od-green" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-1.5">Price</label>
                    <input value={customPrice} onChange={e => setCustomPrice(e.target.value)} placeholder="$50"
                      className="w-full bg-warm-300 border border-warm-400 rounded-lg px-3 py-2 text-charcoal-900 text-sm outline-none focus:border-od-green" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-1.5">Duration (mins)</label>
                    <input value={customDuration} onChange={e => setCustomDuration(e.target.value)} placeholder="30"
                      className="w-full bg-warm-300 border border-warm-400 rounded-lg px-3 py-2 text-charcoal-900 text-sm outline-none focus:border-od-green" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-1.5">Description</label>
                    <input value={customDesc} onChange={e => setCustomDesc(e.target.value)} placeholder="Optional"
                      className="w-full bg-warm-300 border border-warm-400 rounded-lg px-3 py-2 text-charcoal-900 text-sm outline-none focus:border-od-green" />
                  </div>
                </div>
                <button onClick={addCustomService}
                  className="w-full border border-dashed border-warm-400 rounded-lg py-2 text-charcoal-400 hover:border-od-green hover:text-od-green text-sm transition-colors">
                  + Add Service
                </button>
              </div>
            </div>
            {services.length > 0 && (
              <div className="border-t border-warm-200 pt-4 mb-4">
                <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500 mb-3">
                  Your Services ({services.length})
                </div>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {services.map((s, i) => (
                    <div key={i} className="flex items-center justify-between bg-warm-200 rounded-lg px-3 py-2">
                      <div>
                        <div className="text-sm font-medium text-charcoal-900">{s.name}</div>
                        <div className="text-xs text-charcoal-400">${s.price} · {s.duration_minutes} mins</div>
                      </div>
                      <button onClick={() => removeService(i)} className="text-charcoal-600 hover:text-red-400 transition-colors text-lg leading-none">×</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-3 mt-4">
              <button onClick={() => setStep(1)} className="px-6 py-3 bg-warm-200 border border-warm-300 rounded-lg text-sm text-charcoal-400 hover:text-charcoal-900 transition-colors">
                Back
              </button>
              <button onClick={() => setStep(3)} className="flex-1 bg-od-green hover:bg-od-green-light text-white font-semibold py-3 rounded-lg text-sm">
                Continue →
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <div className="mb-5">
              <h2 className="font-serif text-xl text-charcoal-900 mb-1">Your {staffLabelPlural.toLowerCase()}</h2>
              <p className="text-charcoal-500 text-sm">Set up each {staffLabel.toLowerCase()} and their compensation.</p>
            </div>
            {barbers.length > 0 && (
              <div className="space-y-2 mb-5">
                {barbers.map((b, i) => (
                  <div key={i} className="flex items-center justify-between bg-warm-200 rounded-lg px-3 py-2.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center font-serif text-sm font-bold"
                        style={{ background: b.color + '22', border: `2px solid ${b.color}`, color: b.color }}>
                        {b.name[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-charcoal-900">{b.name}</div>
                        <div className="text-xs text-charcoal-400">
                          {b.compensation_type === 'commission'
                            ? `${Math.round(b.commission_rate * 100)}% commission · Tips ${Math.round(b.tip_split_rate * 100)}%`
                            : `Booth rent $${b.booth_rent_amount}/wk · Due ${b.booth_rent_due_day}`}
                        </div>
                      </div>
                    </div>
                    <button onClick={() => removeBarber(i)} className="text-charcoal-600 hover:text-red-400 transition-colors text-lg leading-none">×</button>
                  </div>
                ))}
              </div>
            )}
            <div className="bg-warm-200 rounded-lg p-4 space-y-3">
              <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400">Add {withIndefiniteArticle(staffLabel)}</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-charcoal-500 mb-1.5">First Name *</label>
                  <input value={barberName} onChange={e => setBarberName(e.target.value)} placeholder="Marcus"
                    className="w-full bg-warm-300 border border-warm-400 rounded-lg px-3 py-2 text-charcoal-900 text-sm outline-none focus:border-od-green" />
                </div>
                <div>
                  <label className="block text-xs text-charcoal-500 mb-1.5">Alias / Specialty</label>
                  <input value={barberAlias} onChange={e => setBarberAlias(e.target.value)} placeholder="Fade King"
                    className="w-full bg-warm-300 border border-warm-400 rounded-lg px-3 py-2 text-charcoal-900 text-sm outline-none focus:border-od-green" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-charcoal-500 mb-1.5">Compensation Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['commission','booth_rent'] as const).map(t => (
                    <button key={t} type="button" onClick={() => setCompType(t)}
                      className={`py-2 rounded-lg border text-xs font-semibold transition-colors ${compType === t ? 'bg-od-green border-od-green text-white' : 'bg-warm-300 border-warm-400 text-charcoal-400'}`}>
                      {t === 'commission' ? 'Commission' : 'Booth Rent'}
                    </button>
                  ))}
                </div>
              </div>
              {compType === 'commission' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-charcoal-500 mb-1.5">{staffLabel} Commission %</label>
                    <div className="relative">
                      <input type="number" min="1" max="100" value={commissionRate} onChange={e => setCommissionRate(e.target.value)}
                        className="w-full bg-warm-300 border border-warm-400 rounded-lg px-3 py-2 text-charcoal-900 text-sm outline-none focus:border-od-green pr-8" />
                      <span className="absolute right-3 top-2 text-charcoal-400 text-sm">%</span>
                    </div>
                    <div className="text-xs text-charcoal-500 mt-1">Shop keeps {100 - parseInt(commissionRate || '0')}%</div>
                  </div>
                  <div>
                    <label className="block text-xs text-charcoal-500 mb-1.5">{staffLabel} Tip %</label>
                    <div className="relative">
                      <input type="number" min="1" max="100" value={tipSplit} onChange={e => setTipSplit(e.target.value)}
                        className="w-full bg-warm-300 border border-warm-400 rounded-lg px-3 py-2 text-charcoal-900 text-sm outline-none focus:border-od-green pr-8" />
                      <span className="absolute right-3 top-2 text-charcoal-400 text-sm">%</span>
                    </div>
                    <div className="text-xs text-charcoal-500 mt-1">Default 100% to {staffLabel.toLowerCase()}</div>
                  </div>
                </div>
              )}
              {compType === 'booth_rent' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-charcoal-500 mb-1.5">Weekly Rent $</label>
                      <input type="number" value={boothRent} onChange={e => setBoothRent(e.target.value)} placeholder="150"
                        className="w-full bg-warm-300 border border-warm-400 rounded-lg px-3 py-2 text-charcoal-900 text-sm outline-none focus:border-od-green" />
                    </div>
                    <div>
                      <label className="block text-xs text-charcoal-500 mb-1.5">Due Every</label>
                      <select value={rentDueDay} onChange={e => setRentDueDay(e.target.value)}
                        className="w-full bg-warm-300 border border-warm-400 rounded-lg px-3 py-2 text-charcoal-900 text-sm outline-none focus:border-od-green">
                        {DAYS.map(d => <option key={d} value={d} className="capitalize">{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-charcoal-500 mb-1.5">Late Fee %</label>
                      <div className="relative">
                        <input type="number" value={lateFeeRate} onChange={e => setLateFeeRate(e.target.value)} placeholder="5"
                          className="w-full bg-warm-300 border border-warm-400 rounded-lg px-3 py-2 text-charcoal-900 text-sm outline-none focus:border-od-green pr-8" />
                        <span className="absolute right-3 top-2 text-charcoal-400 text-sm">%</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-charcoal-500 mb-1.5">Applied Per</label>
                      <select value={lateFeeInterval} onChange={e => setLateFeeInterval(e.target.value as any)}
                        className="w-full bg-warm-300 border border-warm-400 rounded-lg px-3 py-2 text-charcoal-900 text-sm outline-none focus:border-od-green">
                        <option value="daily">Day</option>
                        <option value="weekly">Week</option>
                      </select>
                    </div>
                  </div>
                  <div className="text-xs text-charcoal-500 bg-warm-300 rounded-lg p-2">
                    Late fee of {lateFeeRate}% will be added per {lateFeeInterval === 'daily' ? 'day' : 'week'} after the due date
                  </div>
                </div>
              )}
              <button onClick={addBarber} disabled={!barberName}
                className="w-full border border-dashed border-warm-400 rounded-lg py-2 text-charcoal-400 hover:border-od-green hover:text-od-green text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                + Add {staffLabel}
              </button>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setStep(2)} className="px-6 py-3 bg-warm-200 border border-warm-300 rounded-lg text-sm text-charcoal-400 hover:text-charcoal-900 transition-colors">
                Back
              </button>
              <button onClick={handleLaunch} disabled={loading || !shopName}
                className="flex-1 bg-od-green hover:bg-od-green-light text-white font-semibold py-3 rounded-lg text-sm disabled:opacity-50">
                {loading ? 'Setting up your shop...' : 'Launch My Shop →'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}