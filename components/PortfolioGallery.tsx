'use client'
import { useState } from 'react'
import Lightbox from 'yet-another-react-lightbox'
import Zoom from 'yet-another-react-lightbox/plugins/zoom'
import Thumbnails from 'yet-another-react-lightbox/plugins/thumbnails'
import 'yet-another-react-lightbox/styles.css'
import 'yet-another-react-lightbox/plugins/thumbnails.css'

export type PortfolioPhoto = {
  id: string
  photo_url: string
  caption: string | null
  barber_name?: string | null
}

// Swipeable, touch-friendly gallery for the public booking page.
// Thumbnails in a grid; tap opens the full lightbox with zoom.
export default function PortfolioGallery({ photos }: { photos: PortfolioPhoto[] }) {
  const [index, setIndex] = useState(-1)

  if (photos.length === 0) return null

  const slides = photos.map((p) => ({
    src: p.photo_url,
    description: [p.caption, p.barber_name].filter(Boolean).join(' · ') || undefined,
  }))

  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {photos.map((p, i) => (
          <button
            key={p.id}
            onClick={() => setIndex(i)}
            className="aspect-square rounded-xl overflow-hidden bg-warm-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-od-green"
            aria-label={p.caption ? `View photo: ${p.caption}` : `View portfolio photo ${i + 1}`}
          >
            <img
              src={p.photo_url}
              alt={p.caption || `Portfolio photo ${i + 1}`}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </button>
        ))}
      </div>
      <Lightbox
        open={index >= 0}
        index={index}
        close={() => setIndex(-1)}
        slides={slides}
        plugins={[Zoom, Thumbnails]}
        // Mobile-first: swipe to navigate is on by default; zoom on pinch/double-tap.
        animation={{ fade: 200 }}
        carousel={{ finite: false }}
        controller={{ closeOnBackdropClick: true }}
        on={{ view: ({ index: next }) => setIndex(next) }}
      />
    </div>
  )
}
