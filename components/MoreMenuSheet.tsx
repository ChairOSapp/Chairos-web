'use client'
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { useReducedMotion } from 'motion/react'
import { Sheet } from 'react-modal-sheet'

// iOS-like ease, matching components/motion.tsx: quick with a soft landing.
const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1]

/**
 * Native-feeling bottom sheet for the mobile "More" menus.
 * Built on react-modal-sheet: drag the handle (or flick down) to dismiss,
 * tap the backdrop to dismiss, content-sized detent. ChairOS warm/olive
 * tokens are applied through the unstyled container — no new color system.
 */
export default function MoreMenuSheet({
  open,
  onClose,
  children,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
}) {
  const reduceMotion = useReducedMotion()

  // The More button only exists on mobile (md:hidden). If the viewport grows
  // to desktop while the sheet is open, close it rather than leaving a
  // floating sheet with no trigger.
  useEffect(() => {
    if (!open) return
    const mq = window.matchMedia('(min-width: 768px)')
    if (mq.matches) onClose()
    const onChange = (e: MediaQueryListEvent) => { if (e.matches) onClose() }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [open, onClose])

  return (
    <Sheet
      isOpen={open}
      onClose={onClose}
      detent="content"
      tweenConfig={{ ease: EASE_OUT, duration: 0.25 }}
      prefersReducedMotion={!!reduceMotion}
      // Keep the sheet below the Feedback modal (z-70), which opens from
      // inside the More menu — same stacking as the old hand-built sheet.
      style={{ zIndex: 60 }}
    >
      <Sheet.Container
        unstyled
        className="bg-warm-100 dark:bg-[#1E1E1B] border-t border-warm-200 dark:border-[#2A2A26] rounded-t-2xl"
      >
        <Sheet.Header>
          <div className="w-10 h-1 bg-warm-300 dark:bg-[#3A3A34] rounded-full mx-auto mt-3 mb-1 shrink-0" />
        </Sheet.Header>
        <Sheet.Content>
          <div className="px-4 pb-8 pb-safe-sheet">{children}</div>
        </Sheet.Content>
      </Sheet.Container>
      <Sheet.Backdrop onTap={onClose} style={{ backgroundColor: 'rgba(0, 0, 0, 0.4)' }} />
    </Sheet>
  )
}
