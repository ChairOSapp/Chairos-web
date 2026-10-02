'use client'
import { useEffect, useState } from 'react'
import AnnouncementsList, { type Announcement } from './AnnouncementsList'

// Shop Settings > Announcements tab. Owners post updates for their team;
// staff see the list read-only (the API enforces owner-only writes).
export default function AnnouncementsTab() {
  const [items, setItems] = useState<Announcement[]>([])
  const [isOwner, setIsOwner] = useState(false)
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    try {
      const res = await fetch('/api/announcements')
      const data = await res.json()
      if (res.ok) {
        setItems(data.announcements || [])
        setIsOwner(!!data.isOwner)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function post() {
    if (!title.trim() || !body.trim() || posting) return
    setPosting(true)
    setError('')
    try {
      const res = await fetch('/api/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), body: body.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Could not post the update'); return }
      setItems(prev => [data.announcement, ...prev.filter(a => a.id !== data.announcement.id)]
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || +new Date(b.created_at) - +new Date(a.created_at)))
      setTitle('')
      setBody('')
    } finally {
      setPosting(false)
    }
  }

  async function togglePin(id: string, pinned: boolean) {
    const res = await fetch(`/api/announcements/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned }),
    })
    if (res.ok) {
      setItems(prev => prev
        .map(a => a.id === id ? { ...a, pinned } : a)
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || +new Date(b.created_at) - +new Date(a.created_at)))
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/announcements/${id}`, { method: 'DELETE' })
    if (res.ok) setItems(prev => prev.filter(a => a.id !== id))
  }

  return (
    <div className="bg-warm-100 border border-warm-200 rounded-xl p-6 mb-6">
      <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Announcements</div>
      <p className="text-sm text-charcoal-500 mb-6">
        Post updates for your team — schedule changes, time off, new policies.
        Only you can post; your staff can read.
      </p>

      {isOwner && (
        <div className="mb-8">
          <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-3">Post an update</div>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Title"
            maxLength={120}
            className="w-full bg-warm-50 border border-warm-300 rounded-lg px-4 py-2.5 text-sm text-charcoal-900 placeholder:text-charcoal-400 mb-3 focus:outline-none focus:border-od-green"
          />
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="What's the update?"
            rows={3}
            maxLength={2000}
            className="w-full bg-warm-50 border border-warm-300 rounded-lg px-4 py-2.5 text-sm text-charcoal-900 placeholder:text-charcoal-400 mb-3 focus:outline-none focus:border-od-green resize-y"
          />
          {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
          <button
            onClick={post}
            disabled={posting || !title.trim() || !body.trim()}
            className="bg-od-green hover:bg-od-green-light text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50">
            {posting ? 'Posting…' : 'Post an update'}
          </button>
        </div>
      )}

      <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-4">Recent updates</div>
      {loading
        ? <p className="text-sm text-charcoal-500">Loading…</p>
        : items.length === 0 && isOwner
          ? <p className="text-sm text-charcoal-500">No updates yet. Post the first one above.</p>
          : <AnnouncementsList items={items} isOwner={isOwner} onTogglePin={togglePin} onDelete={remove} />}
    </div>
  )
}
