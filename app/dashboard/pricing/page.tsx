'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import OwnerNav from '@/components/OwnerNav'
import MobileNav from '@/components/MobileNav'
import { DAY_NAMES, isPromoRule, promoStatus, ruleLabel, type PricingRule } from '@/lib/pricing'

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function ManagePricing() {
  const [shop, setShop] = useState<any>(null)
  const [services, setServices] = useState<any[]>([])
  const [rules, setRules] = useState<PricingRule[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [tab, setTab] = useState<'recurring' | 'promo'>('recurring')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

  const [ruleName, setRuleName] = useState('')
  const [serviceIds, setServiceIds] = useState<string[]>([])
  const [days, setDays] = useState<string[]>([])
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [adjustMode, setAdjustMode] = useState<'percent' | 'flat_price'>('percent')
  const [percentValue, setPercentValue] = useState('')
  const [flatPriceValue, setFlatPriceValue] = useState('')

  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setUserId(user.id)

    const { data: shops } = await supabase
      .from('shops').select('*').eq('owner_id', user.id)
      .order('created_at', { ascending: true }).limit(1)
    const shop = shops?.[0] || null
    if (!shop) { router.push('/onboarding'); return }
    setShop(shop)

    const { data: services } = await supabase
      .from('services').select('id, name, price')
      .eq('shop_id', shop.id).order('name', { ascending: true })
    setServices(services || [])

    const { data: rules } = await supabase
      .from('pricing_rules').select('*')
      .eq('shop_id', shop.id).order('created_at', { ascending: false })
    setRules((rules || []) as PricingRule[])
    setLoading(false)
  }

  function resetForm() {
    setRuleName(''); setServiceIds([]); setDays([]); setStartTime(''); setEndTime('')
    setStartDate(''); setEndDate(''); setAdjustMode('percent'); setPercentValue(''); setFlatPriceValue('')
    setEditingId(null); setError('')
  }

  function toggleService(id: string) {
    setServiceIds(prev => prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id])
  }

  function openCreate(kind: 'recurring' | 'promo') {
    resetForm(); setTab(kind); setShowForm(true)
  }

  function openEdit(r: PricingRule) {
    setEditingId(r.id)
    setRuleName(isPromoRule(r) ? (r.promo_name || '') : r.name)
    setServiceIds(r.service_id ? [r.service_id] : [])
    setDays(r.days_of_week || [])
    setStartTime(r.start_time ? r.start_time.slice(0, 5) : '')
    setEndTime(r.end_time ? r.end_time.slice(0, 5) : '')
    setStartDate(r.start_date || '')
    setEndDate(r.end_date || '')
    if (r.flat_price != null) { setAdjustMode('flat_price'); setFlatPriceValue(String(r.flat_price)); setPercentValue('') }
    else { setAdjustMode('percent'); setPercentValue(String(r.percent_adjustment ?? '')); setFlatPriceValue('') }
    setTab(isPromoRule(r) ? 'promo' : 'recurring')
    setShowForm(true)
  }

  function toggleDay(day: string) {
    setDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day])
  }

  async function handleSave() {
    if (!ruleName.trim()) { setError(tab === 'promo' ? 'Promo name is required' : 'Rule name is required'); return }
    if (tab === 'promo' && (!startDate || !endDate)) { setError('Start and end date are required for a promo'); return }
    if (tab === 'promo' && startDate > endDate) { setError('Start date must be before end date'); return }
    if (adjustMode === 'percent' && !percentValue.trim()) { setError('Enter a percentage adjustment'); return }
    if (adjustMode === 'flat_price' && !flatPriceValue.trim()) { setError('Enter a set price'); return }

    setSaving(true); setError('')

    // getSession() refreshes an expired access token before we use it. Without
    // this, a session that went stale while the tab sat idle sends the old JWT
    // straight to Postgres, which evaluates auth.uid() as null and rejects the
    // owner_id RLS check -- surfacing as an opaque "new row violates row-level
    // security policy" instead of actually saving the rule.
    await supabase.auth.getSession()

    const basePayload = (service_id: string | null): any => ({
      name: tab === 'promo' ? ruleName.trim() : ruleName.trim(),
      promo_name: tab === 'promo' ? ruleName.trim() : null,
      service_id,
      days_of_week: tab === 'recurring' && days.length > 0 ? days : null,
      start_time: tab === 'recurring' && startTime ? startTime : null,
      end_time: tab === 'recurring' && endTime ? endTime : null,
      start_date: tab === 'promo' ? startDate : null,
      end_date: tab === 'promo' ? endDate : null,
      flat_price: adjustMode === 'flat_price' ? parseFloat(flatPriceValue) : null,
      percent_adjustment: adjustMode === 'percent' ? parseFloat(percentValue) : null,
    })

    // "All services" (serviceIds empty) is one row with service_id = null.
    // Specific services are mutually exclusive with "All" in the UI, and
    // pricing_rules only has a single nullable service_id column, so each
    // checked service becomes its own row -- independently editable/
    // toggleable, which is the DB's existing per-service granularity.
    const targetServiceIds: (string | null)[] = serviceIds.length > 0 ? serviceIds : [null]

    async function save() {
      if (editingId) {
        const [first, ...rest] = targetServiceIds
        const { error } = await supabase.from('pricing_rules').update(basePayload(first)).eq('id', editingId)
        if (error || rest.length === 0) return { error }
        return supabase.from('pricing_rules').insert(rest.map(sid => ({ ...basePayload(sid), shop_id: shop.id, active: true })))
      }
      return supabase.from('pricing_rules').insert(targetServiceIds.map(sid => ({ ...basePayload(sid), shop_id: shop.id, active: true })))
    }

    let { error: saveError } = await save()
    if (saveError?.message?.includes('row-level security')) {
      await supabase.auth.refreshSession()
      ;({ error: saveError } = await save())
    }

    if (saveError) { setError(saveError.message); setSaving(false); return }
    const multi = !editingId && targetServiceIds.length > 1
    setSuccess(editingId ? 'Rule updated.' : (tab === 'promo' ? `Promo created${multi ? ` for ${targetServiceIds.length} services` : ''}.` : `Rule added${multi ? ` for ${targetServiceIds.length} services` : ''}.`))
    setTimeout(() => setSuccess(''), 3000)
    resetForm(); setShowForm(false); await loadData(); setSaving(false)
  }

  async function toggleActive(id: string, current: boolean) {
    await supabase.auth.getSession()
    let { error } = await supabase.from('pricing_rules').update({ active: !current }).eq('id', id)
    if (error?.message?.includes('row-level security')) {
      await supabase.auth.refreshSession()
      ;({ error } = await supabase.from('pricing_rules').update({ active: !current }).eq('id', id))
    }
    if (error) { setError(error.message); return }
    await loadData()
  }

  if (loading) return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center">
      <div className="text-od-green text-sm">Loading...</div>
    </div>
  )

  const initials = shop?.name?.split(' ').map((w: string) => w[0]).join('').substring(0, 2).toUpperCase() || 'CH'
  const today = todayStr()
  const recurringRules = rules.filter(r => !isPromoRule(r))
  const promoRules = rules.filter(isPromoRule)
  const serviceName = (id: string | null) => id ? (services.find(s => s.id === id)?.name || 'Unknown service') : 'All services'

  const STATUS_STYLE: Record<string, string> = {
    active: 'bg-green-500/10 text-green-500',
    upcoming: 'bg-blue-500/10 text-blue-500',
    expired: 'bg-warm-200 text-charcoal-500',
  }

  return (
    <div className="min-h-screen bg-warm-50">
      <OwnerNav shopName={shop?.name} ownerName={''} initials={initials} userId={userId || undefined} />

      <div className="p-6 max-w-3xl mx-auto pb-20 md:pb-0">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-serif text-2xl text-charcoal-900 mb-1">Pricing Rules</h1>
            <p className="text-charcoal-500 text-sm">{shop?.name} · {recurringRules.filter(r => r.active).length} recurring · {promoRules.filter(r => r.active).length} promo{promoRules.filter(r => r.active).length === 1 ? '' : 's'}</p>
          </div>
        </div>

        <div className="flex gap-1 bg-warm-200 rounded-lg p-1 mb-6 w-fit">
          {(['recurring', 'promo'] as const).map(t => (
            <button key={t} onClick={() => { setTab(t); setShowForm(false) }}
              className={`px-4 py-2 rounded-md text-xs font-semibold transition-all ${tab === t ? 'bg-warm-300 text-charcoal-900' : 'text-charcoal-500'}`}>
              {t === 'recurring' ? 'Recurring Rules' : 'Promotions'}
            </button>
          ))}
        </div>

        {error && !showForm && <p className="text-red-400 text-sm bg-red-950 border border-red-900 rounded-lg p-3 mb-6">{error}</p>}
        {success && <p className="text-green-400 text-sm bg-green-950 border border-green-900 rounded-lg p-3 mb-6">{success}</p>}

        {!showForm && (
          <button onClick={() => openCreate(tab)}
            className="bg-od-green hover:bg-od-green-light text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors mb-6">
            + {tab === 'recurring' ? 'Add Recurring Rule' : 'Add Promo'}
          </button>
        )}

        {showForm && (
          <div className="bg-warm-100 border border-warm-200 rounded-xl p-6 mb-6">
            {error && <p className="text-red-400 text-sm bg-red-950 border border-red-900 rounded-lg p-3 mb-4">{error}</p>}

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">
                  {tab === 'promo' ? 'Promo Name *' : 'Rule Name *'}
                </label>
                <input value={ruleName} onChange={e => setRuleName(e.target.value)}
                  placeholder={tab === 'promo' ? 'e.g. Fall Special' : 'e.g. Weekend Peak'}
                  className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green" />
              </div>
              <div>
                <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Applies To</label>
                <div className="border border-warm-300 rounded-lg bg-warm-200 max-h-40 overflow-y-auto divide-y divide-warm-300">
                  <label className="flex items-center gap-2 px-4 py-2.5 cursor-pointer">
                    <input type="checkbox" checked={serviceIds.length === 0}
                      onChange={() => setServiceIds([])}
                      className="accent-od-green" />
                    <span className="text-sm font-semibold text-charcoal-900">All services</span>
                  </label>
                  {services.map(s => (
                    <label key={s.id} className="flex items-center gap-2 px-4 py-2.5 cursor-pointer">
                      <input type="checkbox" checked={serviceIds.includes(s.id)}
                        onChange={() => toggleService(s.id)}
                        className="accent-od-green" />
                      <span className="text-sm text-charcoal-900">{s.name}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-charcoal-500 mt-1">
                  {serviceIds.length === 0 ? 'Applies to every service.' : `Applies to ${serviceIds.length} selected service${serviceIds.length === 1 ? '' : 's'}.`}
                </p>
              </div>
            </div>

            {tab === 'recurring' ? (
              <>
                <div className="mb-4">
                  <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Days (blank = every day)</label>
                  <div className="flex gap-2 flex-wrap">
                    {DAY_NAMES.map((d, i) => (
                      <button key={d} type="button" onClick={() => toggleDay(d)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                          days.includes(d) ? 'bg-od-green text-white border-od-green' : 'bg-warm-200 border-warm-300 text-charcoal-500'
                        }`}>
                        {DAY_ABBR[i]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Start Time (blank = open)</label>
                    <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                      className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">End Time (blank = close)</label>
                    <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                      className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green" />
                  </div>
                </div>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Start Date *</label>
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                    className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green" />
                </div>
                <div>
                  <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">End Date *</label>
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                    className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green" />
                </div>
              </div>
            )}

            <div className="mb-4">
              <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Adjustment</label>
              <div className="flex gap-1 bg-warm-200 rounded-lg p-1 mb-3 w-fit">
                {(['percent', 'flat_price'] as const).map(m => (
                  <button key={m} type="button" onClick={() => setAdjustMode(m)}
                    className={`px-4 py-2 rounded-md text-xs font-semibold transition-all ${adjustMode === m ? 'bg-warm-300 text-charcoal-900' : 'text-charcoal-500'}`}>
                    {m === 'percent' ? '% Adjustment' : 'Set Price'}
                  </button>
                ))}
              </div>
              {adjustMode === 'percent' ? (
                <input type="number" step="0.1" value={percentValue} onChange={e => setPercentValue(e.target.value)}
                  placeholder="e.g. -20 for 20% off, 15 for 15% surcharge"
                  className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green" />
              ) : (
                <input type="number" step="0.01" min="0" value={flatPriceValue} onChange={e => setFlatPriceValue(e.target.value)}
                  placeholder="e.g. 40"
                  className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green" />
              )}
            </div>

            <div className="flex gap-3">
              <button onClick={() => { resetForm(); setShowForm(false) }}
                className="px-6 py-2.5 bg-warm-200 border border-warm-300 rounded-lg text-sm text-charcoal-400 hover:text-charcoal-900 transition-colors">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 bg-od-green hover:bg-od-green-light text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50">
                {saving ? 'Saving...' : editingId ? 'Save Changes' : (tab === 'promo' ? 'Create Promo' : 'Add Rule')}
              </button>
            </div>
          </div>
        )}

        <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden">
          {(tab === 'recurring' ? recurringRules : promoRules).length === 0 ? (
            <div className="p-8 text-center text-charcoal-500 text-sm">
              {tab === 'recurring' ? 'No recurring pricing rules yet.' : 'No promos yet. Create one above.'}
            </div>
          ) : (
            <div className="divide-y divide-warm-200">
              {(tab === 'recurring' ? recurringRules : promoRules).map(r => {
                const status = tab === 'promo' ? promoStatus(r, today) : null
                const adjustLabel = r.flat_price != null
                  ? `$${r.flat_price}`
                  : `${r.percent_adjustment! > 0 ? '+' : ''}${r.percent_adjustment}%`
                const windowLabel = tab === 'recurring'
                  ? `${(r.days_of_week && r.days_of_week.length > 0) ? r.days_of_week.map(d => DAY_ABBR[DAY_NAMES.indexOf(d)]).join(', ') : 'Every day'}${r.start_time || r.end_time ? ` · ${r.start_time ? r.start_time.slice(0, 5) : 'open'}–${r.end_time ? r.end_time.slice(0, 5) : 'close'}` : ''}`
                  : `${r.start_date} → ${r.end_date}`
                return (
                  <div key={r.id} className={`px-5 py-4 flex items-center gap-4 ${!r.active ? 'opacity-50' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-charcoal-900">{ruleLabel(r)}</div>
                      <div className="text-xs text-charcoal-500 mt-0.5">{serviceName(r.service_id)} · {windowLabel}</div>
                    </div>
                    <div className="font-mono text-sm text-od-green font-semibold">{adjustLabel}</div>
                    {status && (
                      <div className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[status]}`}>
                        {status[0].toUpperCase() + status.slice(1)}
                      </div>
                    )}
                    <div className={`text-xs font-semibold px-2 py-0.5 rounded-full ${r.active ? 'bg-green-500/10 text-green-500' : 'bg-warm-200 text-charcoal-500'}`}>
                      {r.active ? 'Active' : 'Hidden'}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(r)}
                        className="px-3 py-1.5 bg-warm-200 border border-warm-300 rounded-lg text-xs text-charcoal-400 hover:border-od-green hover:text-od-green transition-colors">
                        Edit
                      </button>
                      <button onClick={() => toggleActive(r.id, r.active)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                          r.active
                            ? 'bg-warm-200 border-warm-300 text-charcoal-400 hover:border-red-500 hover:text-red-400'
                            : 'bg-green-500/10 border-green-500/30 text-green-500'
                        }`}>
                        {r.active ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <MobileNav />
    </div>
  )
}
