'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

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

export default function ManageServices() {
  const [shop, setShop] = useState<any>(null)
  const [services, setServices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [mode, setMode] = useState<'catalog'|'custom'>('catalog')

  const [svcName, setSvcName] = useState('')
  const [svcPrice, setSvcPrice] = useState('')
  const [svcDuration, setSvcDuration] = useState('30')
  const [svcDesc, setSvcDesc] = useState('')

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

    const { data: services } = await supabase
      .from('services').select('*')
      .eq('shop_id', shop.id).order('created_at', { ascending: true })
    setServices(services || [])
    setLoading(false)
  }

  function resetForm() {
    setSvcName(''); setSvcPrice(''); setSvcDuration('30'); setSvcDesc('')
    setEditingId(null); setError('')
  }

  function openEdit(s: any) {
    setEditingId(s.id)
    setSvcName(s.name)
    setSvcPrice(String(s.price))
    setSvcDuration(String(s.duration_minutes))
    setSvcDesc(s.description || '')
    setMode('custom')
    setShowForm(true)
  }

  async function addFromCatalog(s: any) {
    const already = services.find(sv => sv.name === s.name)
    if (already) return
    await supabase.from('services').insert({
      shop_id: shop.id,
      name: s.name,
      price: s.price,
      duration_minutes: s.duration_minutes,
      description: s.description,
      active: true
    })
    await loadData()
  }

  async function handleSave() {
    if (!svcName.trim() || !svcPrice) { setError('Name and price are required'); return }
    setSaving(true); setError('')

    const payload = {
      name: svcName.trim(),
      price: parseFloat(svcPrice),
      duration_minutes: parseInt(svcDuration),
      description: svcDesc.trim()
    }

    if (editingId) {
      await supabase.from('services').update(payload).eq('id', editingId)
    } else {
      await supabase.from('services').insert({ ...payload, shop_id: shop.id, active: true })
    }

    resetForm(); setShowForm(false); await loadData(); setSaving(false)
  }

  async function toggleActive(id: string, current: boolean) {
    await supabase.from('services').update({ active: !current }).eq('id', id)
    await loadData()
  }

  if (loading) return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
      <div className="text-amber-500 text-sm">Loading...</div>
    </div>
  )

  const existingNames = services.map(s => s.name)

  return (
    <div className="min-h-screen bg-neutral-950">
      <header className="bg-neutral-900 border-b border-neutral-800 px-6 h-14 flex items-center justify-between sticky top-0 z-10">
        <span className="font-serif text-amber-500 text-lg">ChairOS</span>
        <button onClick={() => router.push('/dashboard')} className="text-xs text-neutral-500 hover:text-white transition-colors">← Dashboard</button>
      </header>

      <div className="p-6 max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-serif text-2xl text-white mb-1">Manage Services</h1>
            <p className="text-neutral-500 text-sm">{shop?.name} · {services.filter(s => s.active).length} active</p>
          </div>
          <button
            onClick={() => { resetForm(); setMode('custom'); setShowForm(!showForm) }}
            className="bg-amber-500 hover:bg-amber-400 text-black font-semibold px-4 py-2 rounded-lg text-sm transition-colors">
            + Add Service
          </button>
        </div>

        {showForm && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 mb-6">
            <div className="flex gap-1 bg-neutral-800 rounded-lg p-1 mb-5 w-fit">
              {(['catalog','custom'] as const).map(m => (
                <button key={m} onClick={() => setMode(m)}
                  className={`px-4 py-2 rounded-md text-xs font-semibold transition-all ${mode === m ? 'bg-neutral-700 text-white' : 'text-neutral-500'}`}>
                  {m === 'catalog' ? 'Service Catalog' : 'Custom Service'}
                </button>
              ))}
            </div>

            {mode === 'catalog' && (
              <div>
                <div className="grid grid-cols-2 gap-3">
                  {CATALOG.map((s, i) => {
                    const added = existingNames.includes(s.name)
                    return (
                      <div key={i}
                        onClick={() => !added && addFromCatalog(s)}
                        className={`p-3 rounded-lg border transition-all relative ${added ? 'border-neutral-700 bg-neutral-800 opacity-40 cursor-not-allowed' : 'border-neutral-700 bg-neutral-800 hover:border-amber-500 cursor-pointer'}`}>
                        {added && <div className="absolute top-2 right-2 text-xs text-green-500 font-bold">✓</div>}
                        <div className="text-sm font-semibold text-white mb-0.5">{s.name}</div>
                        <div className="text-xs text-neutral-400">{s.duration_minutes} mins</div>
                        <div className="text-sm font-semibold text-amber-500 mt-1">${s.price}</div>
                      </div>
                    )
                  })}
                </div>
                <button onClick={() => { resetForm(); setShowForm(false) }}
                  className="mt-4 text-sm text-neutral-500 hover:text-white transition-colors">
                  Close
                </button>
              </div>
            )}

            {mode === 'custom' && (
              <div>
                {error && <p className="text-red-400 text-sm bg-red-950 border border-red-900 rounded-lg p-3 mb-4">{error}</p>}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-2">Service Name *</label>
                    <input value={svcName} onChange={e => setSvcName(e.target.value)} placeholder="e.g. Kids Cut"
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-amber-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-2">Price *</label>
                    <input type="number" value={svcPrice} onChange={e => setSvcPrice(e.target.value)} placeholder="45"
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-amber-500" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-2">Duration (mins)</label>
                    <input type="number" value={svcDuration} onChange={e => setSvcDuration(e.target.value)} placeholder="30"
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-amber-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-2">Description</label>
                    <input value={svcDesc} onChange={e => setSvcDesc(e.target.value)} placeholder="Short description"
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-amber-500" />
                  </div>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => { resetForm(); setShowForm(false) }}
                    className="px-6 py-2.5 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-neutral-400 hover:text-white transition-colors">
                    Cancel
                  </button>
                  <button onClick={handleSave} disabled={saving}
                    className="flex-1 bg-amber-500 hover:bg-amber-400 text-black font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50">
                    {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Service'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
          {services.length === 0 ? (
            <div className="p-8 text-center text-neutral-500 text-sm">No services yet. Add your first service above.</div>
          ) : (
            <div className="divide-y divide-neutral-800">
              {services.map((s) => (
                <div key={s.id} className={`px-5 py-4 flex items-center gap-4 ${!s.active ? 'opacity-50' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white">{s.name}</div>
                    <div className="text-xs text-neutral-500 mt-0.5">{s.description} · {s.duration_minutes} mins</div>
                  </div>
                  <div className="font-mono text-lg text-amber-500 font-semibold">${s.price}</div>
                  <div className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.active ? 'bg-green-500/10 text-green-500' : 'bg-neutral-800 text-neutral-500'}`}>
                    {s.active ? 'Active' : 'Hidden'}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(s)}
                      className="px-3 py-1.5 bg-neutral-800 border border-neutral-700 rounded-lg text-xs text-neutral-400 hover:border-amber-500 hover:text-amber-500 transition-colors">
                      Edit
                    </button>
                    <button onClick={() => toggleActive(s.id, s.active)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        s.active
                          ? 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:border-red-500 hover:text-red-400'
                          : 'bg-green-500/10 border-green-500/30 text-green-500'
                      }`}>
                      {s.active ? 'Hide' : 'Show'}
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