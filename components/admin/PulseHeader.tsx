'use client'

import type { PulseData, PulseStatus } from './types'

const STATUS_META: Record<PulseStatus, { dot: string; ring: string; label: string }> = {
  healthy: { dot: 'bg-green-400', ring: 'border-green-900/60', label: 'Healthy' },
  attention: { dot: 'bg-yellow-400', ring: 'border-yellow-900/60', label: 'Needs attention' },
  critical: { dot: 'bg-red-400', ring: 'border-red-900/60', label: 'Needs you now' },
}

// The 60-second briefing: one-line status + the top 3 things needing action.
// Tapping an action scrolls straight to the action queue.
export default function PulseHeader({ pulse }: { pulse: PulseData }) {
  const meta = STATUS_META[pulse.status]
  const top = pulse.actions.slice(0, 3)
  const generated = new Date(pulse.generatedAt).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })

  return (
    <div className={`rounded-2xl border ${meta.ring} bg-charcoal-900 p-5 md:p-6`}>
      <div className="flex items-center gap-3 mb-2">
        <span className="relative flex h-3 w-3">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-40 ${meta.dot}`} />
          <span className={`relative inline-flex rounded-full h-3 w-3 ${meta.dot}`} />
        </span>
        <span className="text-[11px] font-bold tracking-[0.2em] uppercase text-charcoal-300">
          {meta.label}
        </span>
        <span className="ml-auto text-[11px] text-charcoal-600">Updated {generated}</span>
      </div>

      <p className="font-serif text-2xl md:text-3xl text-charcoal-100 leading-snug">
        {pulse.headline}
      </p>

      {top.length > 0 && (
        <div className="mt-4 space-y-2">
          {top.map((a, i) => (
            <a
              key={a.id}
              href="#action-queue"
              className="flex items-center gap-3 rounded-xl border border-charcoal-800 bg-charcoal-950/60 px-4 py-3 hover:border-charcoal-700 transition-colors"
            >
              <span className="font-serif text-lg text-charcoal-600 w-6">{i + 1}</span>
              <span className="text-sm text-charcoal-200 flex-1">{a.title}</span>
              <span className="text-charcoal-500 text-sm">→</span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
