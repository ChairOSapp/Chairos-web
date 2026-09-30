'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useVerticalLabels } from '@/lib/VerticalContext'

interface Service {
  id: string
  name: string
  /** null when the service was created from a preset and no price was ever set */
  price: number | null
  duration_minutes: number
  description: string | null
  active: boolean
  deposit_required: boolean
  buffer_before_minutes: number
  buffer_after_minutes: number
}

const BLANK: Omit<Service, 'id'> = { name: '', price: 0, duration_minutes: 30, description: '', active: true, deposit_required: true, buffer_before_minutes: 0, buffer_after_minutes: 0 }

export default function ServicesEditor({ shopId }: { shopId: string }) {
  const supabase = createClient()
  const { vertical } = useVerticalLabels()
  const depositsApplicable = vertical === 'tattoo' || vertical === 'salon'
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null) // service id or 'new'
  const [form, setForm] = useState<Omit<Service, 'id'>>(BLANK)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  /** true when the service being edited never had a price (preset-created) */
  const [hadNoPrice, setHadNoPrice] = useState(false)

  const missingPriceCount = services.filter(s => s.price == null).length

  useEffect(() => { load() }, [shopId])

  async function load() {
    const { data } = await supabase
      .from('services')
      .select('id, name, price, duration_minutes, description, active, deposit_required, buffer_before_minutes, buffer_after_minutes')
      .eq('shop_id', shopId)
      .order('name')
    setServices(data ?? [])
    setLoading(false)
  }

  function startNew() {
    setForm(BLANK)
    setEditing('new')
    setHadNoPrice(false)
    setError('')
  }

  function startEdit(s: Service) {
    setForm({
      // A service with no price opens the form at 0 with a hint below the
      // price field -- the owner must consciously enter a price (0 = free).
      name: s.name, price: s.price ?? 0, duration_minutes: s.duration_minutes, description: s.description ?? '',
      active: s.active, deposit_required: s.deposit_required,
      buffer_before_minutes: s.buffer_before_minutes, buffer_after_minutes: s.buffer_after_minutes,
    })
    setEditing(s.id)
    setHadNoPrice(s.price == null)
    setError('')
  }

  function cancel() { setEditing(null); setError('') }

  async function save() {
    if (!form.name.trim()) { setError('Name is required'); return }
    if ((form.price ?? 0) < 0) { setError('Price cannot be negative'); return }
    if (form.duration_minutes < 5) { setError('Duration must be at least 5 minutes'); return }
    setSaving(true)
    setError('')

    const payload = {
      shop_id: shopId,
      name: form.name.trim(),
      price: Number(form.price ?? 0),
      duration_minutes: Number(form.duration_minutes),
      description: form.description?.trim() || null,
      active: form.active,
      deposit_required: form.deposit_required,
      buffer_before_minutes: Number(form.buffer_before_minutes) || 0,
      buffer_after_minutes: Number(form.buffer_after_minutes) || 0,
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

      {/* Services missing a price stay visible and actionable: bookings for
          them go through as pay-at-shop, but deposits and checkout are
          blocked until the owner sets one. */}
      {missingPriceCount > 0 && (
        <div className="text-xs text-amber-800 bg-amber-100/70 border border-amber-300 rounded-lg px-3 py-2 mb-3">
          {missingPriceCount} service{missingPriceCount === 1 ? '' : 's'} still need{missingPriceCount === 1 ? 's' : ''} a price.
          Bookings for {missingPriceCount === 1 ? 'it' : 'them'} go through as pay-at-shop — deposits and checkout stay blocked until you set one.
        </div>
      )}

      <div className="space-y-2 mb-4">
        {services.map(s => {
          const needsPrice = s.price == null
          return (
          <div key={s.id} className={`flex items-center justify-between gap-3 p-3 rounded-lg border transition-colors ${needsPrice ? 'bg-amber-50 border-amber-400' : s.active ? 'bg-warm-200 border-warm-300' : 'bg-warm-100 border-warm-200 opacity-60'}`}>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-charcoal-900 truncate">{s.name}</span>
                {needsPrice && <span className="text-xs font-semibold text-amber-800 bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded">Needs a price</span>}
                {!s.active && <span className="text-xs text-charcoal-400 bg-warm-300 px-1.5 py-0.5 rounded">Hidden</span>}
                {depositsApplicable && s.deposit_required && <span className="text-xs text-od-green bg-od-green/10 px-1.5 py-0.5 rounded">Deposit</span>}
              </div>
              <div className="text-xs text-charcoal-500 mt-0.5">
                {needsPrice
                  ? <span className="text-amber-700 font-semibold">Price not set</span>
                  : <>${Number(s.price).toFixed(2)}</>}
                {' '}· {s.duration_minutes} min
                {(s.buffer_before_minutes > 0 || s.buffer_after_minutes > 0) && (
                  <span className="ml-1">· +{s.buffer_before_minutes}/{s.buffer_after_minutes}m buffer</span>
                )}
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
          )
        })}
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
                value={form.price ?? 0}
                onChange={e => setForm(f => ({ ...f, price: parseFloat(e.target.value) || 0 }))}
                className="w-full bg-warm-100 border border-warm-300 rounded-lg px-3 py-2 text-sm text-charcoal-900 outline-none focus:border-od-green transition-colors"
              />
              {hadNoPrice && (
                <p className="text-xs text-amber-700 mt-1">This service has no price yet — enter one above (0 means it&rsquo;s free).</p>
              )}
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
              <label className="block text-xs text-charcoal-400 mb-1">Buffer Before (minutes)</label>
              <input
                type="number"
                min="0"
                step="5"
                value={form.buffer_before_minutes}
                onChange={e => setForm(f => ({ ...f, buffer_before_minutes: parseInt(e.target.value) || 0 }))}
                className="w-full bg-warm-100 border border-warm-300 rounded-lg px-3 py-2 text-sm text-charcoal-900 outline-none focus:border-od-green transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-charcoal-400 mb-1">Buffer After (minutes)</label>
              <input
                type="number"
                min="0"
                step="5"
                value={form.buffer_after_minutes}
                onChange={e => setForm(f => ({ ...f, buffer_after_minutes: parseInt(e.target.value) || 0 }))}
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

          {depositsApplicable && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.deposit_required}
                onChange={e => setForm(f => ({ ...f, deposit_required: e.target.checked }))}
                className="w-4 h-4 accent-od-green"
              />
              <span className="text-sm text-charcoal-500">Require a deposit to book this service</span>
            </label>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={save}
              disabled={saving}
              className="bg-od-green text-white font-semibold px-5 py-2 rounded-lg text-sm hover:bg-od-green-light transition-colors disabled:opacity-50"
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
