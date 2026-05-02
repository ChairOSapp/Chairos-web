'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

const COLORS = ['#b8861f','#4a7fb5','#3aab6e','#e07850','#9b6db5','#c06060']
const DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']

export default function ManageBarbers() {
  const [shop, setShop] = useState<any>(null)
  const [barbers, setBarbers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

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

  useEffect(() => { loadData() }, [])

  async function loadData() {
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
      .eq('shop_id', shop.id).order('joined_at', { ascending: true })
    setBarbers(barbers || [])
    setLoading(false)
  }

  function resetForm() {
    setBarberName(''); setBarberAlias(''); setCompType('commission')
    setCommissionRate('70'); setTipSplit('100'); setBoothRent('')
    setRentDueDay('monday'); setLateFeeRate('5'); setLateFeeInterval('daily')
    setEditingId(null); setError('')
  }

  function openEdit(b: any) {
    setEditingId(b.id)
    setBarberName(b.barber_name || '')
    setBarberAlias(b.alias || '')
    setCompType(b.compensation_type || 'commission')
    setCommissionRate(b.commission_rate ? String(Math.round(b.commission_rate * 100)) : '70')
    setTipSplit(b.tip_split_rate ? String(Math.round(b.tip_split_rate * 100)) : '100')
    setBoothRent(b.booth_rent_amount ? String(b.booth_rent_amount) : '')
    setRentDueDay(b.booth_rent_due_day || 'monday')
    setLateFeeRate(b.late_fee_rate ? String(Math.round(b.late_fee_rate * 100)) : '5')
    setLateFeeInterval(b.late_fee_interval || 'daily')
    setShowForm(true)
  }

  async function handleSave() {
    if (!barberName.trim()) { setError('Name is required'); return }
    setSaving(true); setError('')

    const payload = {
      barber_name: barberName.trim(),
      alias: barberAlias.trim() || barberName.trim(),
      compensation_type: compType,
      commission_rate: compType === 'commission' ? parseFloat(commissionRate) / 100 : null,
      tip_split_rate: parseFloat(tipSplit) / 100,
      booth_rent_amount: compType === 'booth_rent' ? parseFloat(boothRent) : null,
      booth_rent_due_day: compType === 'booth_rent' ? rentDueDay : null,
      late_fee_rate: compType === 'booth_rent' ? parseFloat(lateFeeRate) / 100 : null,
      late_fee_interval: compType === 'booth_rent' ? lateFeeInterval : null,
    }

    if (editingId) {
      await supabase.from('shop_barbers').update(payload).eq('id', editingId)
    } else {
      await supabase.from('shop_barbers').insert({
        ...payload,
        shop_id: shop.id,
        barber_id: null,
        active: true,
        color: COLORS[barbers.length % COLORS.length]
      })
    }

    resetForm(); setShowForm(false); await loadData(); setSaving(false)
  }

  async function toggleActive(id: string, current: boolean) {
    await supabase.from('shop_barbers').update({ active: !current }).eq('id', id)
    await loadData()
  }

  if (loading) return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
      <div className="text-amber-500 text-sm">Loading...</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-neutral-950">
      <header className="bg-neutral-900 border-b border-neutral-800 px-6 h-14 flex items-center justify-between sticky top-0 z-10">
        <span className="font-serif text-amber-500 text-lg">ChairOS</span>
        <button onClick={() => router.push('/dashboard')} className="text-xs text-neutral-500 hover:text-white transition-colors">← Dashboard</button>
      </header>

      <div className="p-6 max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-serif text-2xl text-white mb-1">Manage Barbers</h1>
            <p className="text-neutral-500 text-sm">{shop?.name} · {barbers.filter(b => b.active).length} active</p>
          </div>
          <button
            onClick={() => { resetForm(); setShowForm(!showForm) }}
            className="bg-amber-500 hover:bg-amber-400 text-black font-semibold px-4 py-2 rounded-lg text-sm transition-colors">
            + Add Barber
          </button>
        </div>

        {showForm && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 mb-6">
            <div className="text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-4">
              {editingId ? 'Edit Barber' : 'New Barber'}
            </div>
            {error && <p className="text-red-400 text-sm bg-red-950 border border-red-900 rounded-lg p-3 mb-4">{error}</p>}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-2">First Name *</label>
                <input value={barberName} onChange={e => setBarberName(e.target.value)} placeholder="Marcus"
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-amber-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-2">Alias / Specialty</label>
                <input value={barberAlias} onChange={e => setBarberAlias(e.target.value)} placeholder="Fade King"
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-amber-500" />
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-2">Compensation</label>
              <div className="grid grid-cols-2 gap-2">
                {(['commission','booth_rent'] as const).map(t => (
                  <button key={t} onClick={() => setCompType(t)}
                    className={`py-2 rounded-lg border text-xs font-semibold transition-colors ${compType === t ? 'bg-amber-500 border-amber-500 text-black' : 'bg-neutral-800 border-neutral-700 text-neutral-400'}`}>
                    {t === 'commission' ? 'Commission' : 'Booth Rent'}
                  </button>
                ))}
              </div>
            </div>
            {compType === 'commission' && (
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-2">Barber Commission %</label>
                  <div className="relative">
                    <input type="number" min="1" max="100" value={commissionRate} onChange={e => setCommissionRate(e.target.value)}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-amber-500 pr-8" />
                    <span className="absolute right-3 top-3 text-neutral-400 text-sm">%</span>
                  </div>
                  <div className="text-xs text-neutral-500 mt-1">Shop keeps {100 - parseInt(commissionRate || '0')}%</div>
                </div>
                <div>
                  <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-2">Barber Tip %</label>
                  <div className="relative">
                    <input type="number" min="1" max="100" value={tipSplit} onChange={e => setTipSplit(e.target.value)}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-amber-500 pr-8" />
                    <span className="absolute right-3 top-3 text-neutral-400 text-sm">%</span>
                  </div>
                  <div className="text-xs text-neutral-500 mt-1">Default 100% to barber</div>
                </div>
              </div>
            )}
            {compType === 'booth_rent' && (
              <div className="space-y-4 mb-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-2">Weekly Rent $</label>
                    <input type="number" value={boothRent} onChange={e => setBoothRent(e.target.value)} placeholder="150"
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-amber-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-2">Due Every</label>
                    <select value={rentDueDay} onChange={e => setRentDueDay(e.target.value)}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-amber-500">
                      {DAYS.map(d => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-2">Late Fee %</label>
                    <div className="relative">
                      <input type="number" value={lateFeeRate} onChange={e => setLateFeeRate(e.target.value)} placeholder="5"
                        className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-amber-500 pr-8" />
                      <span className="absolute right-3 top-3 text-neutral-400 text-sm">%</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-2">Applied Per</label>
                    <select value={lateFeeInterval} onChange={e => setLateFeeInterval(e.target.value as any)}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-amber-500">
                      <option value="daily">Day</option>
                      <option value="weekly">Week</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => { resetForm(); setShowForm(false) }}
                className="px-6 py-2.5 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-neutral-400 hover:text-white transition-colors">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 bg-amber-500 hover:bg-amber-400 text-black font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50">
                {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Barber'}
              </button>
            </div>
          </div>
        )}

        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
          {barbers.length === 0 ? (
            <div className="p-8 text-center text-neutral-500 text-sm">No barbers yet. Add your first barber above.</div>
          ) : (
            <div className="divide-y divide-neutral-800">
              {barbers.map((b, i) => (
                <div key={b.id} className={`px-5 py-4 flex items-center gap-4 ${!b.active ? 'opacity-50' : ''}`}>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center font-serif text-sm font-bold flex-shrink-0"
                    style={{ background: (b.color || COLORS[i % COLORS.length]) + '22', border: `2px solid ${b.color || COLORS[i % COLORS.length]}`, color: b.color || COLORS[i % COLORS.length] }}>
                    {(b.barber_name || b.alias || '?')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white">{b.barber_name || b.alias}</div>
                    <div className="text-xs text-neutral-500 mt-0.5">
                      {b.compensation_type === 'commission'
                        ? `${Math.round((b.commission_rate || 0.7) * 100)}% commission · Tips ${Math.round((b.tip_split_rate || 1) * 100)}%`
                        : `Booth rent $${b.booth_rent_amount}/wk · Due ${b.booth_rent_due_day}`}
                    </div>
                  </div>
                  <div className={`text-xs font-semibold px-2 py-0.5 rounded-full ${b.barber_id ? 'bg-green-500/10 text-green-500' : 'bg-neutral-800 text-neutral-500'}`}>
                    {b.barber_id ? 'Linked' : 'Pending'}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(b)}
                      className="px-3 py-1.5 bg-neutral-800 border border-neutral-700 rounded-lg text-xs text-neutral-400 hover:border-amber-500 hover:text-amber-500 transition-colors">
                      Edit
                    </button>
                    <button onClick={() => toggleActive(b.id, b.active)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        b.active
                          ? 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:border-red-500 hover:text-red-400'
                          : 'bg-green-500/10 border-green-500/30 text-green-500'
                      }`}>
                      {b.active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}