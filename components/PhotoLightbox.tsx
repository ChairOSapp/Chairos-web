'use client'
import { useEffect } from 'react'

// Shared full-size photo viewer: dark overlay, tap outside or Escape to
// close, Close button at the bottom (reachable one-handed on phones).
// Optional "Save photo" link on the left, and prev/next arrows when there
// are multiple photos to page through.
export default function PhotoLightbox({
  photos,
  index,
  onClose,
  onIndexChange,
  saveHref,
}: {
  photos: string[]
  index: number
  onClose: () => void
  onIndexChange?: (i: number) => void
  saveHref?: string | null
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (photos.length === 0) return null
  const current = photos[((index % photos.length) + photos.length) % photos.length]
  const multi = photos.length > 1 && onIndexChange
  const go = (dir: 1 | -1) => {
    if (!multi) return
    onIndexChange!((((index % photos.length) + photos.length) % photos.length + dir + photos.length) % photos.length)
  }

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}>
      <div className="max-w-3xl w-full" onClick={e => e.stopPropagation()}>
        <img src={current} alt="" className="w-full max-h-[80vh] object-contain rounded-lg" />
        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-2">
            {saveHref && (
              <a
                href={saveHref}
                download
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-semibold text-white bg-od-green hover:bg-od-green-light px-4 py-2 rounded-lg transition-colors">
                Save photo
              </a>
            )}
            {multi && (
              <>
                <button
                  onClick={() => go(-1)}
                  aria-label="Previous photo"
                  className="text-xl font-bold text-white/80 hover:text-white px-3 py-1 rounded-lg transition-colors">
                  &#8249;
                </button>
                <button
                  onClick={() => go(1)}
                  aria-label="Next photo"
                  className="text-xl font-bold text-white/80 hover:text-white px-3 py-1 rounded-lg transition-colors">
                  &#8250;
                </button>
              </>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-sm font-semibold text-white/80 hover:text-white px-4 py-2 transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
