'use client'

import { useMemo } from 'react'

export interface TodayAppt {
  id: string
  date: string
  time: string
  price: number | string | null
  client_name: string
  status: string
  barber_id: string
  services: { name: string } | null
}

interface BarberRate {
  barber_id: string
  commission_rate: number
  compensation_type: string
  barber_name: string
  alias: string | null
}

interface Props {
  appts: TodayAppt[]
  tipsToday: number
  barbers: BarberRate[]
  /** when set, scope to this barber (chair view); otherwise shop-wide */
  scopeBarberId?: string | null
  staffLabel: string
}

const DONE = new Set(['done', 'completed'])
const DEAD = new Set(['cancelled', 'canceled', 'noshow', 'no_show'])

function money(n: number) {
  return `$${n.toFixed(n < 100 ? 2 : 0)}`
}

export default function TodaySection({ appts, tipsToday, barbers, scopeBarberId, staffLabel }: Props) {
  const scoped = useMemo(
    () => (scopeBarberId ? appts.filter(a => a.barber_id === scopeBarberId) : appts),
    [appts, scopeBarberId]
  )

  const rateFor = (barberId: string) => {
    const b = barbers.find(x => x.barber_id === barberId)
    if (!b) return 1
    return b.compensation_type === 'commission' ? (b.commission_rate || 0.7) : 1
  }

  const live = useMemo(() => scoped.filter(a => !DEAD.has(a.status)), [scoped])
  const doneCount = scoped.filter(a => DONE.has(a.status)).length
  const upcoming = useMemo(
    () => live.filter(a => !DONE.has(a.status)).sort((a, b) => (a.time || '').localeCompare(b.time || '')),
    [live]
  )

  const servicesToday = live.reduce((s, a) => s + (parseFloat(String(a.price)) || 0), 0)
  const takeHome = live.reduce((s, a) => s + (parseFloat(String(a.price)) || 0) * rateFor(a.barber_id), 0)

  const nowHM = (() => {
    const n = new Date()
    return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`
  })()
  const nextUp = upcoming.find(a => (a.time || '').slice(0, 5) >= nowHM) || upcoming[0] || null

  return (
    <section id="today" className="bg-warm-100 border border-warm-200 rounded-2xl overflow-hidden mb-4 scroll-mt-24">
      <div className="px-5 py-4 border-b border-warm-200">
        <div className="font-serif text-charcoal-900">Today</div>
        <div className="text-xs text-charcoal-500 mt-0.5">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </div>
      </div>

      <div className="px-5 py-4 border-b border-warm-200">
        <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500 mb-1">
          Expected take-home
        </div>
        <div className="font-serif text-4xl text-charcoal-900 leading-none mb-2">
          {money(takeHome + tipsToday)}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-charcoal-500">
          <span>{money(servicesToday)} in services</span>
          <span>{money(tipsToday)} tips so far</span>
          <span>{live.length} booking{live.length === 1 ? '' : 's'} · {doneCount} done</span>
        </div>
        {nextUp && (
          <div className="mt-3 bg-od-green/5 border border-od-green/20 rounded-lg px-3 py-2.5">
            <div className="text-[10px] font-bold tracking-widest uppercase text-od-green mb-0.5">Next up</div>
            <div className="text-sm text-charcoal-900">
              <span className="font-mono font-semibold">{nextUp.time?.slice(0, 5)}</span>
              {' · '}{nextUp.client_name}
              <span className="text-charcoal-500"> — {(nextUp.services as any)?.name || 'Service'}</span>
            </div>
          </div>
        )}
      </div>

      {upcoming.length > 0 ? (
        <div className="divide-y divide-warm-200">
          {upcoming.map(a => (
            <div key={a.id} className="px-5 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-od-green">{a.time?.slice(0, 5)}</span>
                  <span className="text-sm font-semibold text-charcoal-900 truncate">{a.client_name}</span>
                </div>
                <div className="text-xs text-charcoal-500 mt-0.5">
                  {(a.services as any)?.name || 'Service'}
                  {!scopeBarberId && (() => {
                    const b = barbers.find(x => x.barber_id === a.barber_id)
                    const n = b?.barber_name || b?.alias
                    return n ? ` · ${n}` : ''
                  })()}
                </div>
              </div>
              <div className="font-mono text-sm font-semibold text-charcoal-900 flex-shrink-0">
                {money(parseFloat(String(a.price)) || 0)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-5 py-6 text-center text-sm text-charcoal-500">
          {live.length > 0
            ? 'All done for today — nice work.'
            : `Nothing booked today yet.${scopeBarberId ? '' : ` Openings are money sitting on the table.`}`}
        </div>
      )}
    </section>
  )
}
