'use client'

import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { motion, useReducedMotion } from 'motion/react'

/**
 * ChairOS Tabs — shadcn-style wrapper over Radix Tabs primitives, dressed in
 * ChairOS tokens. Copy-pasted (not npm-installed) per the repo's piecemeal
 * shadcn adoption: we own this file and style it with our own design language.
 *
 * Design language (from app/globals.css and components/ui/Button.tsx):
 * - Active tab is a solid olive pill driven by `--color-primary`
 *   (#4B5320 light / #7A8C3A dark), so dark-mode contrast is handled by the
 *   token, not per-file overrides. Active label is white (near-black in dark
 *   mode, matching Button's primary variant contrast handling).
 * - Inactive tabs are charcoal-500 text on transparent, warming to
 *   charcoal-900 on hover. Warm/olive radius: rounded-lg, text-sm, semibold.
 * - SlidingTabsTrigger glides the active pill between tabs via a shared motion
 *   layoutId, using the repo's iOS-like ease: quick ease-out, subtle, never
 *   bouncy (components/motion.tsx).
 * - Every trigger keeps a 44px minimum touch target.
 * - Radix gives us roving-tabindex arrow-key navigation and tablist semantics
 *   for free; no custom keyboard handling needed.
 *
 * Usage:
 *   <Tabs value={tab} onValueChange={setTab}>
 *     <TabsList aria-label="Sections">
 *       <SlidingTabsTrigger value="today" pillLayoutId="insights-pill">Today</SlidingTabsTrigger>
 *       ...
 *     </TabsList>
 *     <TabsContent value="today">...</TabsContent>
 *   </Tabs>
 */

const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1]

const Tabs = TabsPrimitive.Root

const TabsList = forwardRef<
  ElementRef<typeof TabsPrimitive.List>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(function TabsList({ className = '', ...props }, ref) {
  return (
    <TabsPrimitive.List
      ref={ref}
      className={`flex gap-1 overflow-x-auto ${className}`}
      {...props}
    />
  )
})
TabsList.displayName = 'TabsList'

const TRIGGER_BASE =
  'relative flex-shrink-0 px-4 py-2 min-h-[44px] rounded-lg text-sm font-semibold ' +
  'transition-colors focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-offset-2 focus-visible:ring-[#4B5320] dark:focus-visible:ring-[#7A8C3A] ' +
  'text-charcoal-500 hover:text-charcoal-900 ' +
  'data-[state=active]:text-white dark:data-[state=active]:text-[#141412]'

const TabsTrigger = forwardRef<
  ElementRef<typeof TabsPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(function TabsTrigger({ className = '', ...props }, ref) {
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={`${TRIGGER_BASE} ${className}`}
      {...props}
    />
  )
})
TabsTrigger.displayName = 'TabsTrigger'

/**
 * Trigger with a sliding active pill. Only the active trigger renders the pill
 * (Radix sets data-state="active" on it), and the shared layoutId makes the
 * pill glide from the previously-active tab.
 */
const SlidingTabsTrigger = forwardRef<
  ElementRef<typeof TabsPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & { pillLayoutId: string }
>(function SlidingTabsTrigger({ className = '', children, pillLayoutId, ...props }, ref) {
  const reduceMotion = useReducedMotion()
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={`group ${TRIGGER_BASE} ${className}`}
      {...props}
    >
      <span aria-hidden className="absolute inset-0 hidden group-data-[state=active]:block">
        {reduceMotion ? (
          <span aria-hidden className="absolute inset-0 rounded-lg bg-[var(--color-primary)]" />
        ) : (
          <motion.span
            aria-hidden
            layoutId={pillLayoutId}
            className="absolute inset-0 rounded-lg bg-[var(--color-primary)]"
            transition={{ duration: 0.25, ease: EASE_OUT }}
          />
        )}
      </span>
      <span className="relative z-10">{children}</span>
    </TabsPrimitive.Trigger>
  )
})
SlidingTabsTrigger.displayName = 'SlidingTabsTrigger'

const TabsContent = forwardRef<
  ElementRef<typeof TabsPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(function TabsContent({ className = '', ...props }, ref) {
  return (
    <TabsPrimitive.Content
      ref={ref}
      className={`focus-visible:outline-none ${className}`}
      {...props}
    />
  )
})
TabsContent.displayName = 'TabsContent'

export { Tabs, TabsList, TabsTrigger, SlidingTabsTrigger, TabsContent }
