'use client'

import type { PulseData } from './types'

// Customer health: the people side of the business. Total clients, how many
// are locked in, how many are drifting away, and whether no-shows are
// getting better or worse.
export default function CustomerHealth({ pulse }: { pulse: PulseData }) {
  const { customers, trends } = pulse
  const lockPct =
    customers.totalClients > 0
      ? Math.round((customers.lockedRelationships / customers.totalClients) * 100)
      : null

  const noShowDelta =
    trends.noShowThisWeek !== null && trends.noShowLastWeek !== null
      ? trends.noShowThisWeek - trends.noShowLastWeek
      : null

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <div className="rounded-xl border border-charcoal-800 bg-charcoal-950/60 p-4">
        <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-charcoal-500 mb-1.5">
          Clients on platform
        </div>
        <div className="font-serif text-3xl text-charcoal-100">
          {customers.totalClients.toLocaleString()}
        </div>
        <div className="text-xs text-charcoal-500 mt-1.5">Across all shops</div>
      </div>

      <div className="rounded-xl border border-charcoal-800 bg-charcoal-950/60 p-4">
        <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-charcoal-500 mb-1.5">
          Locked in
        </div>
        <div className="font-serif text-3xl text-[#8A9A3B]">
          {customers.lockedRelationships.toLocaleString()}
        </div>
        <div className="text-xs text-charcoal-500 mt-1.5">
          {lockPct !== null ? `${lockPct}% of clients have a locked barber` : 'Client Lock relationships'}
        </div>
      </div>

      <div className="rounded-xl border border-charcoal-800 bg-charcoal-950/60 p-4">
        <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-charcoal-500 mb-1.5">
          Drifting away
        </div>
        <div className={`font-serif text-3xl ${customers.atRiskClients > 0 ? 'text-yellow-400' : 'text-charcoal-100'}`}>
          {customers.atRiskClients.toLocaleString()}
        </div>
        <div className="text-xs text-charcoal-500 mt-1.5">
          Haven&apos;t been back — worth a rebooking nudge
        </div>
      </div>

      <div className="rounded-xl border border-charcoal-800 bg-charcoal-950/60 p-4">
        <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-charcoal-500 mb-1.5">
          No-show rate
        </div>
        <div className="font-serif text-3xl text-charcoal-100">
          {trends.noShowThisWeek !== null ? `${trends.noShowThisWeek}%` : '—'}
        </div>
        <div className={`text-xs mt-1.5 ${
          noShowDelta === null ? 'text-charcoal-500'
          : noShowDelta < 0 ? 'text-green-400'
          : noShowDelta > 0 ? 'text-red-400'
          : 'text-charcoal-500'
        }`}>
          {noShowDelta === null
            ? 'Not enough data yet'
            : noShowDelta === 0
              ? 'Flat vs last week'
              : `${noShowDelta > 0 ? '▲' : '▼'} ${Math.abs(noShowDelta).toFixed(1)} pts vs last week`}
        </div>
      </div>
    </div>
  )
}
