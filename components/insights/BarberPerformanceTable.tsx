'use client'
import { useState, useMemo } from 'react'

interface Appointment {
  id: string
  date: string
  price: number
  barber_id: string
  status: string
  client_id?: string | null
}

interface ShopBarber {
  barber_id: string
  barber_name: string
  alias: string | null
  commission_rate: number
  compensation_type: string
  color: string | null
}

type SortKey = 'name' | 'cuts' | 'revenue' | 'avgTicket' | 'ghostRate' | 'comeBack'

interface Props {
  appointments: Appointment[]
  shopBarbers: ShopBarber[]
}

export default function BarberPerformanceTable({ appointments, shopBarbers }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('revenue')
  const [sortAsc, setSortAsc] = useState(false)

  const rows = useMemo(() => {
    return shopBarbers.map(b => {
      const bAppts = appointments.filter(a => a.barber_id === b.barber_id)
      const done = bAppts.filter(a => a.status === 'done')
      const noShows = bAppts.filter(a => ['no_show', 'no-show', 'noshow'].includes(a.status))
      const counted = bAppts.filter(a => ['done', 'no_show', 'no-show', 'noshow'].includes(a.status))
      const ghostRate = counted.length > 0 ? noShows.length / counted.length : 0

      const revenue = done.reduce((s, a) => s + (parseFloat(String(a.price)) || 0), 0)
      const avgTicket = done.length > 0 ? revenue / done.length : 0

      // Come-back rate: first-timers who rebooked within 60 days
      const firstVisit: Record<string, number> = {}
      const allVisits: Record<string, number[]> = {}
      for (const a of done) {
        if (!a.client_id) continue
        const t = new Date(a.date + 'T12:00:00').getTime()
        if (firstVisit[a.client_id] === undefined || t < firstVisit[a.client_id]) firstVisit[a.client_id] = t
        if (!allVisits[a.client_id]) allVisits[a.client_id] = []
        allVisits[a.client_id].push(t)
      }
      let firstTimers = 0; let returned = 0
      for (const [cid, ft] of Object.entries(firstVisit)) {
        firstTimers++
        if ((allVisits[cid] || []).some(t => t > ft && t - ft <= 60 * 86400000)) returned++
      }
      const comeBack = firstTimers > 0 ? returned / firstTimers : 0

      return {
        name: b.barber_name || b.alias || 'Barber',
        color: b.color || '#4B5320',
        cuts: done.length,
        revenue,
        avgTicket,
        ghostRate,
        comeBack,
        ghostWarning: ghostRate > 0.2 && counted.length >= 5,
      }
    })
  }, [appointments, shopBarbers])

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const va = a[sortKey] as number | string
      const vb = b[sortKey] as number | string
      if (typeof va === 'string') return sortAsc ? va.localeCompare(vb as string) : (vb as string).localeCompare(va)
      return sortAsc ? (va as number) - (vb as number) : (vb as number) - (va as number)
    })
  }, [rows, sortKey, sortAsc])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(s => !s)
    else { setSortKey(key); setSortAsc(false) }
  }

  function TH({ label, k }: { label: string; k: SortKey }) {
    return (
      <th
        className={`px-3 py-2.5 text-left text-[10px] font-bold tracking-widest uppercase cursor-pointer select-none whitespace-nowrap ${sortKey === k ? 'text-od-green' : 'text-charcoal-400'}`}
        onClick={() => toggleSort(k)}
      >
        {label}{sortKey === k ? (sortAsc ? ' ↑' : ' ↓') : ''}
      </th>
    )
  }

  if (rows.length === 0) return null

  return (
    <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden mb-4">
      <div className="px-5 py-4 border-b border-warm-200">
        <div className="font-serif text-charcoal-900">Barber Performance</div>
        <div className="text-xs text-charcoal-500 mt-0.5">Ghost rate · come-back rate · avg ticket — tap a column to sort</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: '520px' }}>
          <thead>
            <tr className="border-b border-warm-200 bg-warm-200/30">
              <TH label="Barber" k="name" />
              <TH label="Cuts" k="cuts" />
              <TH label="Revenue" k="revenue" />
              <TH label="Avg Ticket" k="avgTicket" />
              <TH label="Ghost Rate" k="ghostRate" />
              <TH label="Come Back" k="comeBack" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr key={i} className="border-b border-warm-200 last:border-0 hover:bg-warm-200/40 transition-colors">
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                      style={{ background: row.color }}>
                      {row.name[0].toUpperCase()}
                    </div>
                    <span className="font-medium text-charcoal-900">{row.name}</span>
                  </div>
                </td>
                <td className="px-3 py-3 text-charcoal-700">{row.cuts}</td>
                <td className="px-3 py-3 font-mono text-charcoal-900">${row.revenue.toFixed(0)}</td>
                <td className="px-3 py-3 font-mono text-charcoal-900">${row.avgTicket.toFixed(0)}</td>
                <td className="px-3 py-3">
                  <span className={`font-semibold ${row.ghostWarning ? 'text-red-400' : 'text-charcoal-600'}`}>
                    {(row.ghostRate * 100).toFixed(0)}%
                  </span>
                  {row.ghostWarning && <span className="ml-1 text-red-400 text-[11px]">⚠</span>}
                </td>
                <td className="px-3 py-3">
                  <span className={`font-semibold ${row.comeBack >= 0.5 ? 'text-green-400' : row.comeBack >= 0.3 ? 'text-amber-400' : 'text-charcoal-500'}`}>
                    {(row.comeBack * 100).toFixed(0)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
