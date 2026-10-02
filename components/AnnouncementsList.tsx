'use client'
import { useState } from 'react'

export interface Announcement {
  id: string
  title: string
  body: string
  pinned: boolean
  author_name: string | null
  created_at: string
  image_url: string | null
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Read-only list of shop announcements, pinned first then newest.
// Photo (when present) opens full-size on tap, with a save link.
// Owner controls (pin / delete) only render when isOwner is true.
export default function AnnouncementsList({
  items,
  isOwner,
  onTogglePin,
  onDelete,
}: {
  items: Announcement[]
  isOwner?: boolean
  onTogglePin?: (id: string, pinned: boolean) => void
  onDelete?: (id: string) => void
}) {
  const [lightbox, setLightbox] = useState<Announcement | null>(null)

  if (items.length === 0) {
    return <p className="text-sm text-charcoal-500">No updates yet.</p>
  }
  return (
    <div className="space-y-4">
      {items.map(a => (
        <div key={a.id} className="border-b border-warm-200 pb-4 last:border-0 last:pb-0">
          <div className="flex items-center gap-2 mb-1">
            {a.pinned && (
              <span className="text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full bg-od-green/10 text-od-green border border-od-green/20">
                Pinned
              </span>
            )}
            <span className="text-xs text-charcoal-500">
              {a.author_name || 'Owner'} · {fmtDate(a.created_at)}
            </span>
            {isOwner && (
              <span className="ml-auto flex gap-3">
                <button
                  onClick={() => onTogglePin?.(a.id, !a.pinned)}
                  className="text-xs font-semibold text-charcoal-500 hover:text-od-green transition-colors">
                  {a.pinned ? 'Unpin' : 'Pin to top'}
                </button>
                <button
                  onClick={() => { if (window.confirm('Delete this update?')) onDelete?.(a.id) }}
                  className="text-xs font-semibold text-red-400 hover:text-red-500 transition-colors">
                  Delete
                </button>
              </span>
            )}
          </div>
          <div className="font-semibold text-charcoal-900 text-sm">{a.title}</div>
          <p className="text-sm text-charcoal-600 mt-1 whitespace-pre-wrap">{a.body}</p>
          {a.image_url && (
            <button
              onClick={() => setLightbox(a)}
              className="mt-3 block rounded-lg overflow-hidden border border-warm-200 max-w-sm"
              aria-label="View photo full size">
              <img src={a.image_url} alt="" className="w-full max-h-48 object-cover" loading="lazy" />
            </button>
          )}
        </div>
      ))}

      {lightbox?.image_url && (
        <div
          className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}>
          <div className="max-w-3xl w-full" onClick={e => e.stopPropagation()}>
            <img src={lightbox.image_url} alt="" className="w-full max-h-[80vh] object-contain rounded-lg" />
            <div className="flex items-center justify-between mt-3">
              <a
                href={lightbox.image_url}
                download
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-semibold text-white bg-od-green hover:bg-od-green-light px-4 py-2 rounded-lg transition-colors">
                Save photo
              </a>
              <button
                onClick={() => setLightbox(null)}
                className="text-sm font-semibold text-white/80 hover:text-white px-4 py-2 transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
