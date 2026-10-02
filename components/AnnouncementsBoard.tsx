'use client'
import { useEffect, useRef, useState } from 'react'
import AnnouncementsList, { type Announcement } from './AnnouncementsList'

// Shared shop board: owners see this plus the compose box ("Post an update");
// staff see the board read-only. Pinned posts stay on top; everything else
// rolls off after 30 days.
export default function AnnouncementsBoard() {
  const [items, setItems] = useState<Announcement[]>([])
  const [isOwner, setIsOwner] = useState(false)
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')
  const photoRef = useRef<HTMLInputElement>(null)

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

  async function handlePhotoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingPhoto(true)
    setError('')
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('kind', 'announcement')
      const res = await fetch('/api/shop/upload-asset', { method: 'POST', body: form })
      if (res.redirected || !res.headers.get('content-type')?.includes('application/json')) {
        setError('Your session has expired. Please refresh the page and log in again.')
        return
      }
      const data = await res.json().catch(() => ({ error: 'Upload failed' }))
      if (!res.ok) { setError(data.error || 'Upload failed'); return }
      setPhotoUrl(data.url as string)
    } finally {
      setUploadingPhoto(false)
      if (photoRef.current) photoRef.current.value = ''
    }
  }

  async function post() {
    if (!title.trim() || !body.trim() || posting) return
    setPosting(true)
    setError('')
    try {
      const res = await fetch('/api/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), body: body.trim(), image_url: photoUrl }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Could not post the update'); return }
      setItems(prev => [data.announcement, ...prev.filter(a => a.id !== data.announcement.id)]
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || +new Date(b.created_at) - +new Date(a.created_at)))
      setTitle('')
      setBody('')
      setPhotoUrl(null)
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
    <div>
      {isOwner && (
        <div className="bg-warm-100 border border-warm-200 rounded-xl p-6 mb-6">
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
            placeholder="What's the update? Schedule changes, time off, new policies…"
            rows={3}
            maxLength={2000}
            className="w-full bg-warm-50 border border-warm-300 rounded-lg px-4 py-2.5 text-sm text-charcoal-900 placeholder:text-charcoal-400 mb-3 focus:outline-none focus:border-od-green resize-y"
          />
          {photoUrl ? (
            <div className="mb-3 flex items-center gap-3">
              <img src={photoUrl} alt="" className="w-20 h-20 object-cover rounded-lg border border-warm-200" />
              <button
                onClick={() => setPhotoUrl(null)}
                className="text-xs font-semibold text-red-400 hover:text-red-500 transition-colors">
                Remove photo
              </button>
            </div>
          ) : (
            <div className="mb-3">
              <button
                onClick={() => photoRef.current?.click()}
                disabled={uploadingPhoto}
                className="text-xs font-semibold text-charcoal-500 hover:text-od-green border border-warm-300 rounded-lg px-4 py-2 transition-colors disabled:opacity-50">
                {uploadingPhoto ? 'Uploading…' : 'Add a photo (flyer, notice)'}
              </button>
              <input ref={photoRef} type="file" accept="image/*" onChange={handlePhotoPick} className="hidden" />
            </div>
          )}
          {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
          <button
            onClick={post}
            disabled={posting || !title.trim() || !body.trim()}
            className="bg-od-green hover:bg-od-green-light text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50">
            {posting ? 'Posting…' : 'Post an update'}
          </button>
        </div>
      )}

      <div className="bg-warm-100 border border-warm-200 rounded-xl p-6">
        <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-4">Recent updates</div>
        {loading
          ? <p className="text-sm text-charcoal-500">Loading…</p>
          : items.length === 0 && isOwner
            ? <p className="text-sm text-charcoal-500">No updates yet. Post the first one above.</p>
            : <AnnouncementsList items={items} isOwner={isOwner} onTogglePin={togglePin} onDelete={remove} />}
      </div>
    </div>
  )
}
