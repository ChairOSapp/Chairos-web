'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'

type Tag = { id: string; tag: string }

// Tailwind can't see dynamically-built class strings, so these are
// literal class names picked by a stable hash of the tag text -- every
// occurrence of the same tag across the app gets the same color.
const TAG_COLORS = [
  'bg-od-green/10 text-od-green border-od-green/20',
  'bg-blue-50 text-blue-600 border-blue-200',
  'bg-amber-50 text-amber-600 border-amber-200',
  'bg-purple-50 text-purple-600 border-purple-200',
  'bg-pink-50 text-pink-600 border-pink-200',
  'bg-cyan-50 text-cyan-600 border-cyan-200',
]

export function tagColor(tag: string): string {
  let hash = 0
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) >>> 0
  return TAG_COLORS[hash % TAG_COLORS.length]
}

export default function ClientTags({ clientId, shopId }: { clientId: string; shopId: string }) {
  const supabase = useMemo(() => createClient(), [])
  const [tags, setTags] = useState<Tag[]>([])
  const [shopTags, setShopTags] = useState<string[]>([])
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [{ data: clientTags }, { data: allShopTags }] = await Promise.all([
      supabase.from('client_tags').select('id, tag').eq('client_id', clientId).order('created_at'),
      supabase.from('client_tags').select('tag').eq('shop_id', shopId),
    ])
    setTags(clientTags || [])
    setShopTags([...new Set((allShopTags || []).map(t => t.tag))].sort())
  }, [clientId, shopId, supabase])

  useEffect(() => { load() }, [load])

  async function addTag(raw: string) {
    const tag = raw.trim().toLowerCase()
    if (!tag) return
    if (tags.some(t => t.tag === tag)) { setInput(''); return }
    setSaving(true)
    setError('')
    const { error: insErr } = await supabase.from('client_tags').insert({ client_id: clientId, shop_id: shopId, tag })
    setSaving(false)
    if (insErr) { setError(insErr.message); return }
    setInput('')
    await load()
  }

  async function removeTag(id: string) {
    setTags(prev => prev.filter(t => t.id !== id)) // optimistic
    const { error: delErr } = await supabase.from('client_tags').delete().eq('id', id)
    if (delErr) { setError(delErr.message); await load() }
  }

  const suggestions = shopTags.filter(t =>
    t.includes(input.trim().toLowerCase()) && !tags.some(existing => existing.tag === t)
  ).slice(0, 6)

  return (
    <div className="bg-warm-100 border border-warm-200 rounded-xl p-5">
      <div className="font-serif text-charcoal-900 mb-1">Tags</div>
      <div className="text-xs text-charcoal-500 mb-3">Used to filter your client list and build campaign audiences</div>

      <div className="flex flex-wrap gap-2 mb-3">
        {tags.map(t => (
          <span key={t.id} className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${tagColor(t.tag)}`}>
            {t.tag}
            <button onClick={() => removeTag(t.id)} aria-label={`Remove tag ${t.tag}`} className="hover:opacity-60 transition-opacity leading-none">×</button>
          </span>
        ))}
        {tags.length === 0 && <span className="text-xs text-charcoal-400">No tags yet.</span>}
      </div>

      <div className="relative">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(input) } }}
            placeholder="Add a tag…"
            className="flex-1 bg-warm-200 border border-warm-300 rounded-lg px-3 py-2 text-sm text-charcoal-900 outline-none focus:border-od-green transition-colors"
          />
          <button
            onClick={() => addTag(input)}
            disabled={saving || !input.trim()}
            className="px-4 py-2 bg-od-green hover:bg-od-green-light text-white font-semibold rounded-lg text-xs transition-colors disabled:opacity-50"
          >
            Add
          </button>
        </div>
        {input.trim() && suggestions.length > 0 && (
          <div className="absolute z-10 mt-1 w-full bg-warm-100 border border-warm-300 rounded-lg shadow-lg overflow-hidden">
            {suggestions.map(s => (
              <button
                key={s}
                onClick={() => addTag(s)}
                className="w-full text-left px-3 py-2 text-sm text-charcoal-700 hover:bg-warm-200 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
      {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
    </div>
  )
}
