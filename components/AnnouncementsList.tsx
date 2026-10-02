'use client'

export interface Announcement {
  id: string
  title: string
  body: string
  pinned: boolean
  author_name: string | null
  created_at: string
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Read-only list of shop announcements, pinned first then newest.
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
        </div>
      ))}
    </div>
  )
}
