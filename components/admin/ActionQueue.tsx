'use client'

import type { PulseAction, PulseSeverity } from './types'

const SEVERITY: Record<PulseSeverity, { bar: string; tag: string; tagText: string }> = {
  critical: {
    bar: 'bg-red-400',
    tag: 'bg-red-950/60 border-red-900/60',
    tagText: 'text-red-300',
  },
  warning: {
    bar: 'bg-yellow-400',
    tag: 'bg-yellow-950/40 border-yellow-900/50',
    tagText: 'text-yellow-300',
  },
  info: {
    bar: 'bg-sky-400',
    tag: 'bg-sky-950/40 border-sky-900/50',
    tagText: 'text-sky-300',
  },
}

// "What specifically needs my action today?" Each row says what it is, why
// it matters in plain language, and where to go fix it. onJump hands the
// whole action to the parent, which opens the matching dossier directly.
export default function ActionQueue({
  actions,
  onJump,
}: {
  actions: PulseAction[]
  onJump: (action: PulseAction) => void
}) {
  if (actions.length === 0) {
    return (
      <div className="text-center py-10">
        <div className="font-serif text-4xl text-green-400 mb-2">✓</div>
        <p className="text-charcoal-300 text-sm">Nothing on the list. Enjoy it — it won&apos;t last.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2.5">
      {actions.map(a => {
        const s = SEVERITY[a.severity]
        return (
          <div
            key={a.id}
            className="flex gap-3 rounded-xl border border-charcoal-800 bg-charcoal-950/60 p-4"
          >
            <div className={`w-1 rounded-full flex-shrink-0 ${s.bar}`} aria-hidden />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className={`text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full border ${s.tag} ${s.tagText}`}>
                  {a.severity === 'critical' ? 'Do first' : a.severity === 'warning' ? 'Today' : 'FYI'}
                </span>
                <span className="text-sm font-semibold text-charcoal-100">{a.title}</span>
              </div>
              <p className="text-xs text-charcoal-400 leading-relaxed">{a.why}</p>
              {a.detail && (
                <p className="text-[11px] text-charcoal-600 mt-1.5">{a.detail}</p>
              )}
            </div>
            <button
              onClick={() => onJump(a)}
              className="self-center flex-shrink-0 text-xs font-semibold text-[#8A9A3B] hover:text-[#A8BC4A] border border-od-green/40 bg-od-green/15 hover:bg-od-green/25 rounded-lg px-3 py-2 transition-colors"
            >
              Open →
            </button>
          </div>
        )
      })}
    </div>
  )
}
