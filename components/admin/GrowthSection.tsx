'use client'

import Sparkline from './Sparkline'
import type { MetricsData, PulseData } from './types'

// Growth: are more people finding ChairOS and actually using it? 14-day
// sparklines plus the vertical mix.
export default function GrowthSection({
  metrics,
  pulse,
}: {
  metrics: MetricsData
  pulse: PulseData
}) {
  const signups = pulse.trends.signupsDaily.map(d => d.count)
  const appts = pulse.trends.appointmentsDaily.map(d => d.count)
  const signupsTotal = signups.reduce((a, b) => a + b, 0)
  const apptsTotal = appts.reduce((a, b) => a + b, 0)
  const verticals = Object.entries(metrics.verticalBreakdown).sort((a, b) => b[1] - a[1])
  const verticalTotal = verticals.reduce((a, [, c]) => a + c, 0)

  return (
    <div className="grid md:grid-cols-2 gap-3">
      <div className="rounded-xl border border-charcoal-800 bg-charcoal-950/60 p-4">
        <div className="flex items-baseline justify-between mb-1">
          <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-charcoal-500">
            Signups · 14 days
          </div>
          <div className="font-serif text-2xl text-charcoal-100">{signupsTotal}</div>
        </div>
        <Sparkline data={signups} />
        <p className="text-[11px] text-charcoal-600 mt-1">
          {metrics.newSignups} this month · {metrics.newSignupsWeek} this week
        </p>
      </div>

      <div className="rounded-xl border border-charcoal-800 bg-charcoal-950/60 p-4">
        <div className="flex items-baseline justify-between mb-1">
          <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-charcoal-500">
            Bookings · 14 days
          </div>
          <div className="font-serif text-2xl text-charcoal-100">{apptsTotal}</div>
        </div>
        <Sparkline data={appts} stroke="#5B7DD4" />
        <p className="text-[11px] text-charcoal-600 mt-1">
          {metrics.appointmentsWeek} this week · {metrics.appointmentsMonth} this month
        </p>
      </div>

      <div className="rounded-xl border border-charcoal-800 bg-charcoal-950/60 p-4 md:col-span-2">
        <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-charcoal-500 mb-3">
          Shops by vertical
        </div>
        {verticals.length === 0 ? (
          <p className="text-xs text-charcoal-500">No active shops yet.</p>
        ) : (
          <div className="space-y-2.5">
            {verticals.map(([v, c]) => (
              <div key={v}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-charcoal-300 capitalize">{v}</span>
                  <span className="font-serif text-charcoal-100">{c}</span>
                </div>
                <div className="h-1.5 rounded-full bg-charcoal-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#7A8C3A]"
                    style={{ width: `${verticalTotal > 0 ? Math.max(4, (c / verticalTotal) * 100) : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
