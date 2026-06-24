'use client'
import { useState } from 'react'

interface Brief {
  headline: string
  one_thing: string
}

export default function AIInsightStrip({ brief }: { brief: Brief | null }) {
  const [expanded, setExpanded] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  if (!brief) return (
    <div className="bg-warm-100 border border-warm-200 rounded-xl px-5 py-4 mb-4 flex items-center gap-3">
      <div className="w-1.5 h-1.5 rounded-full bg-charcoal-400 flex-shrink-0" />
      <div className="text-sm text-charcoal-500">No AI insights yet — check back after more activity.</div>
    </div>
  )

  return (
    <div className="bg-od-green/5 border border-od-green/20 rounded-xl p-5 mb-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-od-green animate-pulse flex-shrink-0" />
            <span className="text-[10px] font-bold tracking-widest uppercase text-od-green">AI Insight</span>
          </div>
          <div className="text-sm font-semibold text-charcoal-900 leading-snug">{brief.headline}</div>
          {expanded && (
            <div className="mt-2 text-sm text-charcoal-600 leading-relaxed">{brief.one_thing}</div>
          )}
        </div>
        <button onClick={() => setDismissed(true)} className="text-charcoal-400 hover:text-charcoal-600 flex-shrink-0 p-0.5">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <button onClick={() => setExpanded(!expanded)} className="mt-2 text-xs text-od-green hover:underline font-medium">
        {expanded ? 'Show less ↑' : 'What should I do → '}
      </button>
    </div>
  )
}
