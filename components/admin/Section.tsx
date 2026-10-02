'use client'

import type { ReactNode } from 'react'

// The extensible building block of the mission-control page. Every section
// (vitals, customers, product, growth, …) renders inside one of these, so a
// future metric — push adoption, App Store downloads — slots in as a new
// <Section> with zero restructuring.
export default function Section({
  id,
  eyebrow,
  title,
  blurb,
  children,
  action,
}: {
  id: string
  eyebrow?: string
  title: string
  blurb?: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <section id={id} aria-label={title} className="scroll-mt-28">
      <div className="flex items-end justify-between gap-3 mb-3">
        <div>
          {eyebrow && (
            <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-charcoal-500 mb-1">
              {eyebrow}
            </div>
          )}
          <h2 className="font-serif text-xl text-charcoal-100">{title}</h2>
          {blurb && <p className="text-xs text-charcoal-500 mt-1 max-w-xl">{blurb}</p>}
        </div>
        {action}
      </div>
      <div className="rounded-2xl border border-charcoal-800 bg-charcoal-900 p-4 md:p-5">
        {children}
      </div>
    </section>
  )
}
