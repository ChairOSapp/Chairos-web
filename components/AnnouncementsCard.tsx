'use client'
import { useEffect, useState } from 'react'
import AnnouncementsList, { type Announcement } from './AnnouncementsList'

// Staff home read-only card: shows the shop's announcements.
// Owners manage them under Shop Settings > Announcements.
// Renders nothing when there are no announcements.
export default function AnnouncementsCard() {
  const [items, setItems] = useState<Announcement[] | null>(null)

  useEffect(() => {
    fetch('/api/announcements')
      .then(r => r.json())
      .then(d => setItems(d.announcements || []))
      .catch(() => setItems([]))
  }, [])

  if (!items || items.length === 0) return null

  return (
    <div className="bg-warm-100 border border-warm-200 rounded-xl p-5 mb-6">
      <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-4">Shop updates</div>
      <AnnouncementsList items={items} />
    </div>
  )
}
