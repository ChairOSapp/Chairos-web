'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

interface Service {
  id: string
  name: string
  price: number
  duration_minutes: number
  description: string | null
  active: boolean
}

const BLANK: Omit<Service, 'id'> = { name: '', price: 0, duration_minutes: 30, description: '', active: true }

export default function ServicesEditor({ shopId }: { shopId: string }) {
  const supabase = createClient()
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null) // service id or 'new'
  const [form, setForm] = useState<Omit<Service, 'id'>>(BLANK)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [shopId])

  async function load() {
    const { data } = await supabase
      .from('services')
      .select('id, name, price, duration_minutes, description, active')
      .eq('shop_id', shopId)
      .order('name')
    setServices(data ?? [])
    setLoading(false)
  }

  function startNew() {
    setForm(BLANK)
    setEditing('new')
    setError('')
  }

  function startEdit(s: Service) {
    setForm({ name: s.name, price: s.price, duration_minutes: s.duration_minutes, description: s.description ?? '', active: s.active })
    setEditing(s.id)
    setError('')
  }

  function cancel() { setEditing(null); setError('') }

  async function save() {
    if (!form.name.trim()) { setError('Name is required'); return }
    if (form.price < 0) { setError('Price cannot be negative'); return }
    if (form.duration_minutes < 5) { setError('Duration must be at least 5 minutes'); return }
    setSaving(true)
    setError('')

    const payload = {
      shop_id: shopId,
      name: form.name.trim(),
      price: Number(form.price),
      duration_minutes: Number(form.duration_minutes),
      description: form.description?.trim() || null,
      active: form.active,
    }

    if (editing === 'new') {
      const { error: err } = await supabase.from('services').insert(payload)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const { error: err } = await supabase.from('services').update(payload).eq('id', editing!)
      if (err) { setError(err.message); setSaving(false); return }
    }

    await load()
    setEditing(null)
    setSaving(false)
  }

  async function toggleActive(s: Service) {
    await supabase.from('services').update({ active: !s.active }).eq('id', s.id)
    setServices(prev => prev.map(x => x.id === s.id ? { ...x, active: !x.active } : x))
  }

  async function remove(id: string) {
    if (!confirm('Delete this service? This cannot be undone.')) return
    await supabase.from('services').delete().eq('id', id)
    setServices(prev => prev.filter(x => x.id !== id))
    if (editing === id) setEditing(null)
  }

  if (loading) return <div className="text-xs text-charcoal-500 py-4">Loading services…</div>

  return (
    <div>
      {/* Service list */}
      {services.length === 0 && editing !== 'new' && (
        <p className="text-sm text-charcoal-500 mb-4">No services yet. Add your first one.</p>
      )}

      <div className="space-y-2 mb-4">
        {services.map(s => (
          <div key={s.id} className={`flex items-center justify-between gap-3 p-3 rounded-lg border transition-colors ${s.active ? 'bg-warm-200 border-warm-300' : 'bg-warm-100 border-warm-200 opacity-60'}`}>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-charcoal-900 truncate">{s.name}</span>
                {!s.active && <span className="text-xs text-charcoal-400 bg-warm-300 px-1.5 py-0.5 rounded">Hidden</span>}
              </div>
              <div className="text-xs text-charcoal-500 mt-0.5">
                ${Number(s.price).toFixed(2)} · {s.duration_minutes} min
                {s.description && <span className="ml-1">· {s.description}</span>}
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => toggleActive(s)}
                className="text-xs text-charcoal-400 hover:text-charcoal-700 px-2 py-1 rounded transition-colors"
                title={s.active ? 'Hide' : 'Show'}
              >
                {s.active ? 'Hide' : 'Show'}
              </button>
              <button
                onClick={() => startEdit(s)}
                className="text-xs text-od-green hover:text-od-green-light px-2 py-1 rounded transition-colors"
              >
                Edit
              </button>
              <button
                onClick={() => remove(s.id)}
                className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded transition-colors"
              >
                Del
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Inline form */}
      {editing && (
        <div className="bg-warm-200 border border-warm-300 rounded-xl p-4 mb-4 space-y-3">
          <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-1">
            {editing === 'new' ? 'New Service' : 'Edit Service'}
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-charcoal-400 mb-1">Service Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Fade, Shave, Lineup"
                className="w-full bg-warm-100 border border-warm-300 rounded-lg px-3 py-2 text-sm text-charcoal-900 outline-none focus:border-od-green transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-charcoal-400 mb-1">Price ($) *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={e => setForm(f => ({ ...f, price: parseFloat(e.target.value) || 0 }))}
                className="w-full bg-warm-100 border border-warm-300 rounded-lg px-3 py-2 text-sm text-charcoal-900 outline-none focus:border-od-green transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-charcoal-400 mb-1">Duration (minutes) *</label>
              <input
                type="number"
                min="5"
                step="5"
                value={form.duration_minutes}
                onChange={e => setForm(f => ({ ...f, duration_minutes: parseInt(e.target.value) || 30 }))}
                className="w-full bg-warm-100 border border-warm-300 rounded-lg px-3 py-2 text-sm text-charcoal-900 outline-none focus:border-od-green transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-charcoal-400 mb-1">Description (optional)</label>
              <input
                type="text"
                value={form.description ?? ''}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Short description"
                className="w-full bg-warm-100 border border-warm-300 rounded-lg px-3 py-2 text-sm text-charcoal-900 outline-none focus:border-od-green transition-colors"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.active}
              onChange={e => setForm(f => ({ ...f, active: e.target.checked }))}
              className="w-4 h-4 accent-od-green"
            />
            <span className="text-sm text-charcoal-500">Visible to clients during booking</span>
          </label>

          <div className="flex gap-2 pt-1">
            <button
              onClick={save}
              disabled={saving}
              className="bg-od-green text-black font-semibold px-5 py-2 rounded-lg text-sm hover:bg-od-green-light transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving…' : editing === 'new' ? 'Add Service' : 'Save Changes'}
            </button>
            <button
              onClick={cancel}
              className="text-sm text-charcoal-500 hover:text-charcoal-900 px-4 py-2 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!editing && (
        <button
          onClick={startNew}
          className="text-sm text-od-green hover:text-od-green-light font-semibold transition-colors"
        >
          + Add Service
        </button>
      )}
    </div>
  )
}
