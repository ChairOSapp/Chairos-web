'use client'

import type { MetricsData, PulseData } from './types'

// Product health: is the app itself behaving? Sentry errors surfaced plainly,
// plus whether the background automations (reminders, briefs, sweeps) are
// actually running.
export default function ProductHealth({
  metrics,
  pulse,
}: {
  metrics: MetricsData
  pulse: PulseData
}) {
  const errors = metrics.recentErrors

  return (
    <div className="grid md:grid-cols-2 gap-3">
      <div className="rounded-xl border border-charcoal-800 bg-charcoal-950/60 p-4">
        <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-charcoal-500 mb-2">
          App errors · last 24h
        </div>
        {errors.status === 'pending' && (
          <p className="text-xs text-charcoal-500 leading-relaxed">
            Sentry isn&apos;t wired up yet — once it is, unresolved crashes land here automatically.
          </p>
        )}
        {errors.status === 'error' && (
          <p className="text-xs text-red-400">Couldn&apos;t reach Sentry — {errors.reason}</p>
        )}
        {errors.status === 'live' && errors.count === 0 && (
          <p className="text-sm text-green-400">Clean. No unresolved errors in the last day.</p>
        )}
        {errors.status === 'live' && (errors.count ?? 0) > 0 && (
          <div className="space-y-2.5">
            <p className="text-sm text-red-300 font-semibold">
              {errors.count} unresolved issue{errors.count === 1 ? '' : 's'} — newest first
            </p>
            {errors.issues?.slice(0, 5).map((issue, i) => (
              <div key={i} className="border-t border-charcoal-800 pt-2.5">
                <div className="text-xs text-charcoal-200 font-medium leading-snug">{issue.title}</div>
                <div className="text-[11px] text-charcoal-500 mt-1">
                  {issue.culprit} · {issue.count} events · {new Date(issue.lastSeen).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-charcoal-800 bg-charcoal-950/60 p-4">
        <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-charcoal-500 mb-2">
          Background jobs
        </div>
        <div className="flex items-center gap-2.5 mb-2">
          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${pulse.product.automationFresh ? 'bg-green-400' : 'bg-red-400'}`} />
          <span className="text-sm text-charcoal-200 font-medium">
            {pulse.product.automationFresh
              ? 'Running — activity in the last 24 hours'
              : 'Quiet — nothing ran in the last 24 hours'}
          </span>
        </div>
        <p className="text-xs text-charcoal-500 leading-relaxed">
          Reminders, daily briefs, and sweeps all run through here. If this goes quiet,
          clients stop getting reminded and owners stop getting briefed.
        </p>
        <div className="text-xs text-charcoal-500 mt-3">
          <span className="font-serif text-lg text-charcoal-200">{pulse.product.notifications7d}</span>
          {' '}notifications sent in the last 7 days
        </div>
      </div>
    </div>
  )
}
