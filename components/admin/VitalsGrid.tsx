'use client'

import type { MetricsData } from './types'

function Vital({
  label,
  value,
  sub,
  subTone = 'text-charcoal-500',
}: {
  label: string
  value: string
  sub?: string
  subTone?: string
}) {
  return (
    <div className="rounded-xl border border-charcoal-800 bg-charcoal-950/60 p-4">
      <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-charcoal-500 mb-1.5">
        {label}
      </div>
      <div className="font-serif text-3xl text-charcoal-100">{value}</div>
      {sub && <div className={`text-xs mt-1.5 ${subTone}`}>{sub}</div>}
    </div>
  )
}

// Business vitals: point numbers with week/month context so Thomas sees
// direction, not just a snapshot.
export default function VitalsGrid({ metrics }: { metrics: MetricsData }) {
  const mrrDelta =
    metrics.mrrChange === null
      ? null
      : `${metrics.mrrChange >= 0 ? '▲' : '▼'} ${Math.abs(metrics.mrrChange).toFixed(1)}% vs last month`

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Vital
        label="MRR"
        value={`$${metrics.mrr.toLocaleString()}`}
        sub={mrrDelta ?? 'First month of data'}
        subTone={
          metrics.mrrChange === null
            ? 'text-charcoal-500'
            : metrics.mrrChange >= 0
              ? 'text-green-400'
              : 'text-red-400'
        }
      />
      <Vital
        label="Paying customers"
        value={String(metrics.activeShops + metrics.activeSolo)}
        sub={`${metrics.activeShops} shops · ${metrics.activeSolo} solo`}
      />
      <Vital
        label="Trial → paid"
        value={
          metrics.conversionRate !== null
            ? `${metrics.conversionRate.toFixed(0)}%`
            : '—'
        }
        sub={`${metrics.trialingCount} trialing · ${metrics.paidCount} paid`}
      />
      <Vital
        label="Churned this month"
        value={String(metrics.churnedCount)}
        sub={
          metrics.churnedCount > 0
            ? `$${metrics.revenueLostToChurn}/mo walked out the door`
            : 'Nobody left this month'
        }
        subTone={metrics.churnedCount > 0 ? 'text-red-400' : 'text-charcoal-500'}
      />
    </div>
  )
}
