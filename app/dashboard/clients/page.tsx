'use client'
import React, { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import OwnerNav from '@/components/OwnerNav'
import MobileNav from '@/components/MobileNav'

type SortKey = 'name' | 'lastVisit' | 'daysSince' | 'barber' | 'lock' | 'visits' | 'spend'
type SortDir = 'asc' | 'desc'
type FilterTab = 'all' | 'locked' | 'unlocked' | 'fading' | 'cold'

interface ClientRow {
  clientId: string
  name: string
  phone: string | null
  lastVisit: string | null
  daysSince: number | null
  lastBarberId: string | null
  totalVisits: number
  totalSpend: number
  locked: boolean
  lockedToBarberId: string | null
  appts: { date: string; price: number; barber_id: string | null }[]
}

function daysAgoLabel(days: number | null) {
  if (days === null) return '—'
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days}d ago`
}

function dayColor(days: number | null) {
  if (days === null) return 'text-charcoal-400'
  if (days < 30) return 'text-green-500'
  if (days < 60) return 'text-amber-500'
  return 'text-red-400'
}

function rowAccent(days: number | null) {
  if (days === null) return ''
  if (days < 30) return 'border-l-2 border-l-green-500/40'
  if (days < 60) return 'border-l-2 border-l-amber-500/40'
  return 'border-l-2 border-l-red-400/40'
}

export default function ClientsPage() {
  const [shop, setShop] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [allAppts, setAllAppts] = useState<any[]>([])
  const [lockMap, setLockMap] = useState<Record<string, { locked: boolean; barber_id: string | null }>>({})
  const [barberMap, setBarberMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<FilterTab>('all')
  const [sortKey, setSortKey] = useState<SortKey>('lastVisit')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const [{ data: prof }, { data: shopData }] = await Promise.all([
        supabase.from('profiles').select('id, full_name, role').eq('id', user.id).maybeSingle(),
        supabase.from('shops').select('id, name').eq('owner_id', user.id).maybeSingle(),
      ])
      setProfile(prof)
      if (prof?.role === 'barber') { router.push('/dashboard/barber'); return }
      if (!shopData) { router.push('/onboarding'); return }
      setShop(shopData)

      const [{ data: appts }, { data: locks }, { data: barbers }] = await Promise.all([
        supabase.from('appointments')
          .select('id, date, price, barber_id, client_id, client_name, client_phone')
          .eq('shop_id', shopData.id)
          .eq('status', 'done')
          .not('client_id', 'is', null)
          .order('date', { ascending: false }),
        supabase.from('client_locks')
          .select('client_id, locked, barber_id')
          .eq('shop_id', shopData.id),
        supabase.from('shop_barbers')
          .select('barber_id, barber_name, alias')
          .eq('shop_id', shopData.id)
          .eq('active', true),
      ])

      setAllAppts(appts || [])

      const lm: Record<string, { locked: boolean; barber_id: string | null }> = {}
      for (const l of locks || []) {
        if (l.client_id) lm[l.client_id] = { locked: !!l.locked, barber_id: l.barber_id }
      }
      setLockMap(lm)

      const bm: Record<string, string> = {}
      for (const b of barbers || []) {
        if (b.barber_id) bm[b.barber_id] = b.barber_name || b.alias || 'Barber'
      }
      setBarberMap(bm)
      setLoading(false)
    }
    load()
  }, [supabase, router])

  const clients = useMemo<ClientRow[]>(() => {
    const map: Record<string, ClientRow> = {}
    for (const a of allAppts) {
      if (!a.client_id) continue
      if (!map[a.client_id]) {
        map[a.client_id] = {
          clientId: a.client_id,
          name: a.client_name || 'Unknown',
          phone: a.client_phone || null,
          lastVisit: null,
          daysSince: null,
          lastBarberId: null,
          totalVisits: 0,
          totalSpend: 0,
          locked: false,
          lockedToBarberId: null,
          appts: [],
        }
      }
      const row = map[a.client_id]
      const price = parseFloat(String(a.price)) || 0
      row.appts.push({ date: a.date, price, barber_id: a.barber_id })
      row.totalVisits++
      row.totalSpend += price
      if (!row.lastVisit || a.date > row.lastVisit) {
        row.lastVisit = a.date
        row.lastBarberId = a.barber_id
      }
    }
    const now = Date.now()
    for (const row of Object.values(map)) {
      if (row.lastVisit) {
        row.daysSince = Math.floor((now - new Date(row.lastVisit + 'T12:00:00').getTime()) / 86400000)
      }
      const lock = lockMap[row.clientId]
      if (lock?.locked) {
        row.locked = true
        row.lockedToBarberId = lock.barber_id
      }
    }
    return Object.values(map)
  }, [allAppts, lockMap])

  const counts = useMemo(() => ({
    all: clients.length,
    locked: clients.filter(r => r.locked).length,
    unlocked: clients.filter(r => !r.locked).length,
    fading: clients.filter(r => r.daysSince !== null && r.daysSince >= 30 && r.daysSince < 60).length,
    cold: clients.filter(r => r.daysSince !== null && r.daysSince >= 60).length,
  }), [clients])

  const filtered = useMemo(() => {
    let rows = clients
    const q = search.trim().toLowerCase()
    if (q) rows = rows.filter(r => r.name.toLowerCase().includes(q) || (r.phone || '').includes(q))
    if (tab === 'locked') rows = rows.filter(r => r.locked)
    else if (tab === 'unlocked') rows = rows.filter(r => !r.locked)
    else if (tab === 'fading') rows = rows.filter(r => r.daysSince !== null && r.daysSince >= 30 && r.daysSince < 60)
    else if (tab === 'cold') rows = rows.filter(r => r.daysSince !== null && r.daysSince >= 60)
    return rows
  }, [clients, search, tab])

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    let va: any, vb: any
    if (sortKey === 'name') { va = a.name; vb = b.name }
    else if (sortKey === 'lastVisit') { va = a.lastVisit || ''; vb = b.lastVisit || '' }
    else if (sortKey === 'daysSince') { va = a.daysSince ?? 9999; vb = b.daysSince ?? 9999 }
    else if (sortKey === 'barber') { va = barberMap[a.lastBarberId || ''] || ''; vb = barberMap[b.lastBarberId || ''] || '' }
    else if (sortKey === 'lock') { va = a.locked ? 1 : 0; vb = b.locked ? 1 : 0 }
    else if (sortKey === 'visits') { va = a.totalVisits; vb = b.totalVisits }
    else { va = a.totalSpend; vb = b.totalSpend }
    if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
    return sortDir === 'asc' ? va - vb : vb - va
  }), [filtered, sortKey, sortDir, barberMap])

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir('desc') }
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function fmtDate(d: string) {
    return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const PAGE_SIZE = 25
  const initials = shop?.name?.split(' ').map((w: string) => w[0]).join('').substring(0, 2).toUpperCase() || 'CH'

  const TABS: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'locked', label: 'Locked' },
    { key: 'unlocked', label: 'Available' },
    { key: 'fading', label: 'Fading' },
    { key: 'cold', label: 'Gone Cold' },
  ]

  function TH({ label, k }: { label: string; k: SortKey }) {
    const active = sortKey === k
    return (
      <th
        onClick={() => toggleSort(k)}
        className={`px-3 py-2.5 text-left text-[10px] font-bold tracking-widest uppercase cursor-pointer select-none whitespace-nowrap ${active ? 'text-od-green' : 'text-charcoal-400'}`}
      >
        {label}{active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
      </th>
    )
  }

  if (loading) return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-od-green border-t-transparent animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-warm-50">
      <OwnerNav shopName={shop?.name || ''} ownerName={profile?.full_name || ''} initials={initials} userId={profile?.id} />

      <div className="lg:ml-64">
        <div className="w-full max-w-7xl mx-auto px-4 lg:px-8 pb-24 lg:pb-8">

          <div className="py-6 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500 mb-1">Client Directory</div>
              <h1 className="font-serif text-2xl text-charcoal-900">{clients.length} Clients</h1>
            </div>
            <button
              onClick={() => router.push('/dashboard/clients/locks')}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-warm-300 text-charcoal-500 hover:text-charcoal-900 hover:border-warm-400 transition-colors"
            >
              Manage Locks →
            </button>
          </div>

          <div className="relative mb-4">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-400 w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="Search by name or phone…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="w-full pl-9 pr-4 py-2.5 bg-warm-100 border border-warm-200 rounded-xl text-sm text-charcoal-900 placeholder-charcoal-400 outline-none focus:border-od-green/60 transition-colors"
            />
          </div>

          <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => { setTab(t.key); setPage(1) }}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  tab === t.key
                    ? 'bg-od-green text-white'
                    : 'bg-warm-100 border border-warm-200 text-charcoal-500 hover:text-charcoal-900'
                }`}
              >
                {t.label} <span className={tab === t.key ? 'opacity-75' : 'text-charcoal-400'}>({counts[t.key]})</span>
              </button>
            ))}
          </div>

          <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden">
            {sorted.length === 0 ? (
              <div className="p-10 text-center text-charcoal-500 text-sm">
                {search ? 'No clients match your search.' : 'No clients in this view.'}
              </div>
            ) : (
              <div className="overflow-x-auto lg:overflow-visible">
                <table className="w-full text-sm" style={{ minWidth: '680px' }}>
                  <thead>
                    <tr className="border-b border-warm-200 bg-warm-200/30">
                      <TH label="Client" k="name" />
                      <TH label="Last Visit" k="lastVisit" />
                      <TH label="Since" k="daysSince" />
                      <TH label="Barber" k="barber" />
                      <TH label="Lock" k="lock" />
                      <TH label="Visits" k="visits" />
                      <TH label="Spend" k="spend" />
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.slice(0, page * PAGE_SIZE).map(row => {
                      const isExpanded = expanded.has(row.clientId)
                      const lastBarberName = barberMap[row.lastBarberId || ''] || '—'
                      const lockedToName = barberMap[row.lockedToBarberId || ''] || '—'
                      return (
                        <React.Fragment key={row.clientId}>
                          <tr
                            onClick={() => toggleExpand(row.clientId)}
                            className={`border-b border-warm-200 cursor-pointer hover:bg-warm-200/40 transition-colors ${rowAccent(row.daysSince)}`}
                          >
                            <td className="px-3 py-3">
                              <div className="font-medium text-charcoal-900">{row.name}</div>
                              {row.phone && <div className="text-xs text-charcoal-400 mt-0.5">{row.phone}</div>}
                            </td>
                            <td className="px-3 py-3 text-charcoal-600 text-xs">{row.lastVisit ? fmtDate(row.lastVisit) : '—'}</td>
                            <td className="px-3 py-3">
                              <span className={`text-xs font-semibold ${dayColor(row.daysSince)}`}>{daysAgoLabel(row.daysSince)}</span>
                            </td>
                            <td className="px-3 py-3 text-charcoal-600 text-xs">{lastBarberName}</td>
                            <td className="px-3 py-3">
                              {row.locked
                                ? <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full bg-od-green/10 text-od-green border border-od-green/20">🔒 {lockedToName}</span>
                                : <span className="text-[10px] font-bold tracking-widest uppercase text-charcoal-400">Available</span>
                              }
                            </td>
                            <td className="px-3 py-3 text-charcoal-600">{row.totalVisits}</td>
                            <td className="px-3 py-3 font-mono text-charcoal-900">${row.totalSpend.toFixed(0)}</td>
                            <td className="px-3 py-3 text-charcoal-400 text-center">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                                style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                                <polyline points="6 9 12 15 18 9" />
                              </svg>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="border-b border-warm-200">
                              <td colSpan={8} className="px-4 py-3 bg-warm-200/20">
                                <div className="text-[10px] font-bold tracking-widest uppercase text-charcoal-400 mb-2">Appointment History</div>
                                <div className="divide-y divide-warm-200/60">
                                  {row.appts.slice(0, 20).map((a, i) => (
                                    <div key={i} className="flex items-center gap-6 py-1.5 text-xs text-charcoal-600">
                                      <span className="text-charcoal-400 w-28 flex-shrink-0">{fmtDate(a.date)}</span>
                                      <span className="font-mono">${a.price.toFixed(0)}</span>
                                      <span className="text-charcoal-400">{barberMap[a.barber_id || ''] || '—'}</span>
                                    </div>
                                  ))}
                                  {row.appts.length > 20 && (
                                    <div className="py-1.5 text-xs text-charcoal-400">+{row.appts.length - 20} more visits</div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {sorted.length > page * PAGE_SIZE && (
              <div className="px-5 py-4 border-t border-warm-200 text-center">
                <button
                  onClick={() => setPage(p => p + 1)}
                  className="text-xs font-semibold text-od-green hover:opacity-80 transition-opacity"
                >
                  Load more · {sorted.length - page * PAGE_SIZE} remaining
                </button>
              </div>
            )}
          </div>

        </div>
      </div>
      <MobileNav />
    </div>
  )
}
