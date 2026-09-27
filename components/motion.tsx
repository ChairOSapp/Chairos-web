'use client'

import { motion, useReducedMotion, AnimatePresence } from 'motion/react'
import type { ReactNode, MouseEvent, CSSProperties } from 'react'

// iOS-like ease: quick with a soft landing. Subtle, never bouncy, never slow.
const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1]
const QUICK = { duration: 0.2, ease: EASE_OUT }
const STANDARD = { duration: 0.28, ease: EASE_OUT }

type DivProps = {
  children?: ReactNode
  className?: string
  style?: CSSProperties
  onClick?: (e: MouseEvent<HTMLDivElement>) => void
  onMouseEnter?: (e: MouseEvent<HTMLDivElement>) => void
  onMouseLeave?: (e: MouseEvent<HTMLDivElement>) => void
}

function Plain({ children, className, style, onClick, onMouseEnter, onMouseLeave }: DivProps) {
  return (
    <div className={className} style={style} onClick={onClick} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      {children}
    </div>
  )
}

/** Fade + slight rise on mount. Wrap page content. */
export function PageFade({ children, className }: DivProps) {
  const reduce = useReducedMotion()
  if (reduce) return <Plain className={className}>{children}</Plain>
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STANDARD}
    >
      {children}
    </motion.div>
  )
}

/** Subtle tap feedback for cards / custom buttons that lack tactile response. */
export function Pressable({ children, className, style, onClick, onMouseEnter, onMouseLeave }: DivProps) {
  const reduce = useReducedMotion()
  if (reduce) return <Plain className={className} style={style} onClick={onClick} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>{children}</Plain>
  return (
    <motion.div
      className={className}
      style={style}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}

/** Slide-up for bottom sheets. Wrap the conditional in <AnimatePresence> for exit. */
export function SlideUpSheet({ children, className, onClick }: DivProps) {
  const reduce = useReducedMotion()
  if (reduce) return <Plain className={className} onClick={onClick}>{children}</Plain>
  return (
    <motion.div
      className={className}
      onClick={onClick}
      initial={{ y: '100%' }}
      animate={{ y: '0%' }}
      exit={{ y: '100%' }}
      transition={{ duration: 0.3, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  )
}

/** Fade for modal backdrops. */
export function FadeBackdrop({ children, className, onClick }: DivProps) {
  const reduce = useReducedMotion()
  if (reduce) return <Plain className={className} onClick={onClick}>{children}</Plain>
  return (
    <motion.div
      className={className}
      onClick={onClick}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={QUICK}
    >
      {children}
    </motion.div>
  )
}

/** Fade + scale entrance for modal dialog panels. */
export function ModalPanel({ children, className, onClick }: DivProps) {
  const reduce = useReducedMotion()
  if (reduce) return <Plain className={className} onClick={onClick}>{children}</Plain>
  return (
    <motion.div
      className={className}
      onClick={onClick}
      initial={{ opacity: 0, scale: 0.96, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={STANDARD}
    >
      {children}
    </motion.div>
  )
}

/** Subtle fade + rise for stepped-flow panels (booking funnel). */
export function StepPanel({ children, className }: DivProps) {
  const reduce = useReducedMotion()
  if (reduce) return <Plain className={className}>{children}</Plain>
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  )
}

const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: QUICK },
}

/** Gentle stagger container for lists. Items must be <StaggerItem>. */
export function StaggerList({ children, className }: DivProps) {
  const reduce = useReducedMotion()
  if (reduce) return <Plain className={className}>{children}</Plain>
  return (
    <motion.div className={className} variants={listVariants} initial="hidden" animate="show">
      {children}
    </motion.div>
  )
}

/** Stagger child — wrap each row/card. */
export function StaggerItem({ children, className }: DivProps) {
  const reduce = useReducedMotion()
  if (reduce) return <Plain className={className}>{children}</Plain>
  return (
    <motion.div className={className} variants={itemVariants}>
      {children}
    </motion.div>
  )
}

export { AnimatePresence }
