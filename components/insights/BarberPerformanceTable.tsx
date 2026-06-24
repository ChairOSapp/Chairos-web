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

interface Tip {
  id: string
  amount: number
  barber_id: string
}

interface ShopBarber {
  barber_id: string
  barber_name: string
  alias: string | null
  commission_rate: number
  compensation_type: string
  color: string | null
}

type SortKey = 'name' | 'cuts' | 'revenue' | 'avgTicket' | 'ghostRate' | 'comeBackRate' | 'tips'
type SortDir = 'asc' | 'desc'

interface Props {
  shopId: string
  period: string
  barbers: ShopBarber[]
  appointments: Appointment[]
  tips: Tip[]
  selfBarberId?: string
}

function ghostColor(rate: number) {
  if (rate < 0.10) return 'text-od-green'
  if (rate < 0.20) return 'text-amber-400'
  return 'text-red-400'
}

function comeBackColor(rate: number) {
  if (rate > 0.60) return 'text-od-green'
  if (rate >= 0.40) return 'text-amber-400'
  return 'text-charcoal-500'
}

export default function BarberPerformanceTable({
  shopId: _shopId,
  period: _period,
  barbers,
  appointments,
  tips,
  selfBarberId,
}: Props) {
  const [sortCol, setSortCol] = useState<SortKey>('revenue')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const rows = useMemo(() => {
    const targetBarbers = selfBarberId
      ? barbers.filter(b => b.barber_id === selfBarberId)
      : barbers

    return targetBarbers.map(b => {
      const bAppts = appointments.filter(a => a.barber_id === b.barber_id)
      const done = bAppts.filter(a => ['done', 'completed'].includes(a.status))
      const noShows = bAppts.filter(a => ['no_show', 'no-show', 'noshow'].includes(a.status))
      const counted = bAppts.filter(a => ['done', 'completed', 'no_show', 'no-show', 'noshow'].includes(a.status))

      const revenue = done.reduce((s, a) => s + (parseFloat(String(a.price)) || 0), 0)
      const tipTotal = tips
        .filter(t => t.barber_id === b.barber_id)
        .reduce((s, t) => s + (parseFloat(String(t.amount)) || 0), 0)
      const cuts = done.length
      const avgTicket = cuts > 0 ? revenue / cuts : 0
      const ghostRate = counted.length > 0 ? noShows.length / counted.length : 0

      // Come-back rate: unique clients with >1 visit / total unique clients
      const clientVisits: Record<string, number> = {}
      for (const a of done) {
        if (!a.client_id) continue
        clientVisits[a.client_id] = (clientVisits[a.client_id] || 0) + 1
      }
      const uniqueClients = Object.keys(clientVisits).length
      const returningClients = Object.values(clientVisits).filter(v => v > 1).length
      const comeBackRate = uniqueClients > 0 ? returningClients / uniqueClients : 0

      return {
        barber_id: b.barber_id,
        name: b.barber_name || b.alias || 'Barber',
        color: b.color || '#4B5320',
        revenue,
        tips: tipTotal,
        cuts,
        avgTicket,
        ghostRate,
        comeBackRate,
        highGhost: ghostRate > 0.20 && counted.length >= 5,
      }
    })
  }, [barbers, appointments, tips, selfBarberId])

  const ghostWarnings = rows.filter(r => r.highGhost)

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const va = a[sortCol] as number | string
      const vb = b[sortCol] as number | string
      if (typeof va === 'string') {
        return sortDir === 'asc' ? va.localeCompare(vb as string) : (vb as string).localeCompare(va)
      }
      return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number)
    })
  }, [rows, sortCol, sortDir])

  function toggleSort(key: SortKey) {
    if (sortCol === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(key)
      setSortDir('desc')
    }
  }

  function TH({ label, k }: { label: string; k: SortKey }) {
    const active = sortCol === k
    return (
      <th
        className={`px-3 py-2.5 text-left text-[10px] font-bold tracking-widest uppercase cursor-pointer select-none whitespace-nowrap ${active ? 'text-od-green' : 'text-charcoal-400'}`}
        onClick={() => toggleSort(k)}
      >
        {label}{active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
      </th>
    )
  }

  if (rows.length === 0) return null

  // Barber self-view: KPI cards
  if (selfBarberId && rows.length === 1) {
    const r = rows[0]
    const kpis = [
      { label: 'Revenue', value: `$${r.revenue.toFixed(0)}` },
      { label: 'Cuts Completed', value: String(r.cuts) },
      { label: 'Ghost Rate', value: `${(r.ghostRate * 100).toFixed(0)}%`, color: ghostColor(r.ghostRate) },
      { label: 'Come-Back Rate', value: `${(r.comeBackRate * 100).toFixed(0)}%`, color: comeBackColor(r.comeBackRate) },
    ]
    return (
      <div className="mb-4">
        <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-3">Your Stats</div>
        <div className="grid grid-cols-2 gap-3">
          {kpis.map((kpi, i) => (
            <div key={i} className="bg-warm-100 border border-warm-200 rounded-xl p-4 text-center">
              <div className={`font-serif text-2xl mb-1 ${kpi.color || 'text-charcoal-900'}`}>{kpi.value}</div>
              <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400">{kpi.label}</div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Owner view: sortable table
  return (
    <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden mb-4">
      <div className="px-5 py-4 border-b border-warm-200">
        <div className="font-serif text-charcoal-900">Barber Performance</div>
        <div className="text-xs text-charcoal-500 mt-0.5">Ghost rate · come-back rate · avg ticket — tap column to sort</div>
      </div>

      {ghostWarnings.length > 0 && (
        <div className="mx-5 mt-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
          {ghostWarnings.map((r, i) => (
            <div key={i} className="text-xs text-amber-800">
              {r.name} has a {(r.ghostRate * 100).toFixed(0)}% ghost rate. Consider a deposit policy for new clients.
            </div>
          ))}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: '560px' }}>
          <thead>
            <tr className="border-b border-warm-200 bg-warm-200/30">
              <TH label="Barber" k="name" />
              <TH label="Revenue" k="revenue" />
              <TH label="Avg Ticket" k="avgTicket" />
              <TH label="Come-Back Rate" k="comeBackRate" />
              <TH label="Ghost Rate" k="ghostRate" />
              <TH label="Tips" k="tips" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr key={i} className="border-b border-warm-200 last:border-0 hover:bg-warm-200/40 transition-colors">
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                      style={{ background: row.color }}
                    >
                      {row.name[0].toUpperCase()}
                    </div>
                    <span className="font-medium text-charcoal-900">{row.name}</span>
                  </div>
                </td>
                <td className="px-3 py-3 font-mono text-charcoal-900">${row.revenue.toFixed(0)}</td>
                <td className="px-3 py-3 font-mono text-charcoal-900">${row.avgTicket.toFixed(0)}</td>
                <td className="px-3 py-3">
                  <span className={`font-semibold ${comeBackColor(row.comeBackRate)}`}>
                    {(row.comeBackRate * 100).toFixed(0)}%
                  </span>
                </td>
                <td className="px-3 py-3">
                  <span className={`font-semibold ${ghostColor(row.ghostRate)}`}>
                    {(row.ghostRate * 100).toFixed(0)}%
                  </span>
                  {row.highGhost && <span className="ml-1 text-[11px]">⚠</span>}
                </td>
                <td className="px-3 py-3 font-mono text-green-400">${row.tips.toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
