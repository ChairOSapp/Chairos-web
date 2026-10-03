'use client'
import React, { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import OwnerNav from '@/components/OwnerNav'
import StaffNav from '@/components/StaffNav'
import MobileNav from '@/components/MobileNav'
import { useVerticalLabels } from '@/lib/VerticalContext'
import { tagColor } from '@/components/ClientTags'
import ClientImportModal from '@/components/ClientImportModal'
import {
  tableFeatures,
  coreFeatures,
  rowSortingFeature,
  createSortedRowModel,
  columnFilteringFeature,
  createFilteredRowModel,
  globalFilteringFeature,
  rowPaginationFeature,
  createPaginatedRowModel,
  createColumnHelper,
  flexRender,
  useTable,
  type SortingState,
  type ColumnFiltersState,
  type ColumnDef,
  type FilterFn,
} from '@tanstack/react-table'

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
  tags: string[]
}

const PAGE_SIZE = 25

// TanStack Table v9 feature set, defined once outside the component.
// Sorting, column filtering (tabs + tag), global filtering (search) and
// pagination (load-more) are all driven through this single table instance.
const clientTableFeatures = tableFeatures({
  ...coreFeatures,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  columnFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  globalFilteringFeature,
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
})
type ClientTableFeatures = typeof clientTableFeatures

const columnHelper = createColumnHelper<ClientTableFeatures, ClientRow>()

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

// Search matches name or phone, exactly like the old hand-rolled filter.
const namePhoneFilter: FilterFn<ClientTableFeatures, ClientRow> = (row, _columnId, filterValue) => {
  const q = String(filterValue ?? '').trim().toLowerCase()
  if (!q) return true
  const r = row.original
  return r.name.toLowerCase().includes(q) || (r.phone || '').includes(q)
}

// Tab predicates, mirroring the old tab definitions:
// fading = 30-59 days since visit, cold = 60+ days (either can also be locked).
const tabRangeFilter: FilterFn<ClientTableFeatures, ClientRow> = (row, columnId, filterValue) => {
  const v = row.getValue(columnId) as number | null
  const [min, max] = filterValue as [number, number]
  return v !== null && v >= min && v < max
}
const equalsFilter: FilterFn<ClientTableFeatures, ClientRow> = (row, columnId, filterValue) =>
  row.getValue(columnId) === filterValue
const tagIncludesFilter: FilterFn<ClientTableFeatures, ClientRow> = (row, columnId, filterValue) =>
  (row.getValue(columnId) as string[]).includes(filterValue as string)

export default function ClientsPage() {
  const { staffLabel } = useVerticalLabels()
  const [shop, setShop] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [allAppts, setAllAppts] = useState<any[]>([])
  const [lockMap, setLockMap] = useState<Record<string, { locked: boolean; barber_id: string | null }>>({})
  const [barberMap, setBarberMap] = useState<Record<string, string>>({})
  const [myBarberRow, setMyBarberRow] = useState<{ barber_name: string | null; alias: string | null; color: string | null; photo_url: string | null } | null>(null)
  const [tagMap, setTagMap] = useState<Record<string, string[]>>({})
  const [allTags, setAllTags] = useState<string[]>([])
  const [tagFilter, setTagFilter] = useState<string | null>(null)

  // Reads ?tag= from a link like the CRM insights panel's tag chips.
  // Plain window.location read (not useSearchParams) so this page doesn't
  // need a Suspense boundary just for a one-time initial value.
  useEffect(() => {
    const tag = new URLSearchParams(window.location.search).get('tag')
    if (tag) setTagFilter(tag)
  }, [])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<FilterTab>('all')
  const [sorting, setSorting] = useState<SortingState>([{ id: 'lastVisit', desc: true }])
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: PAGE_SIZE })
  // Tapping a row opens the full client card (detail page); the inline
  // expansion was replaced so the phone flow lands on the real profile.
  const [showImport, setShowImport] = useState(false)
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  function resetPage() {
    setPagination({ pageIndex: 0, pageSize: PAGE_SIZE })
  }

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const [{ data: prof }, { data: shopData }] = await Promise.all([
        supabase.from('profiles').select('id, full_name, role').eq('id', user.id).maybeSingle(),
        supabase.from('shops').select('id, name').eq('owner_id', user.id).maybeSingle(),
      ])
      setProfile(prof)
      // A Solo Chair (role='barber') owns their own one-person shop and
      // manages its client list the same way an owner would; a hired
      // barber (role='barber', no shop of their own) doesn't get a
      // shop-wide client list at all -- send them to their own dashboard.
      if (!shopData) {
        router.push(prof?.role === 'barber' ? '/dashboard/chair' : '/onboarding')
        return
      }
      setShop(shopData)

      const [{ data: appts }, { data: locks }, { data: barbers }, { data: tags }] = await Promise.all([
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
          .select('barber_id, barber_name, alias, color, photo_url')
          .eq('shop_id', shopData.id)
          .eq('active', true),
        supabase.from('client_tags')
          .select('client_id, tag')
          .eq('shop_id', shopData.id),
      ])

      setAllAppts(appts || [])

      const lm: Record<string, { locked: boolean; barber_id: string | null }> = {}
      for (const l of locks || []) {
        if (l.client_id) lm[l.client_id] = { locked: !!l.locked, barber_id: l.barber_id }
      }
      setLockMap(lm)

      const bm: Record<string, string> = {}
      for (const b of barbers || []) {
        if (b.barber_id) bm[b.barber_id] = b.barber_name || b.alias || staffLabel
      }
      setBarberMap(bm)

      if (prof?.role === 'barber') {
        setMyBarberRow((barbers || []).find(b => b.barber_id === user.id) || null)
      }

      const tm: Record<string, string[]> = {}
      for (const t of tags || []) {
        if (!t.client_id) continue
        if (!tm[t.client_id]) tm[t.client_id] = []
        tm[t.client_id].push(t.tag)
      }
      setTagMap(tm)
      setAllTags([...new Set((tags || []).map(t => t.tag))].sort())

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
          tags: tagMap[a.client_id] || [],
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
  }, [allAppts, lockMap, tagMap])

  const counts = useMemo(() => ({
    all: clients.length,
    locked: clients.filter(r => r.locked).length,
    unlocked: clients.filter(r => !r.locked).length,
    fading: clients.filter(r => r.daysSince !== null && r.daysSince >= 30 && r.daysSince < 60).length,
    cold: clients.filter(r => r.daysSince !== null && r.daysSince >= 60).length,
  }), [clients])

  // The old filter tabs + tag chips, expressed as TanStack column filters.
  const columnFilters = useMemo<ColumnFiltersState>(() => {
    const f: ColumnFiltersState = []
    if (tab === 'locked') f.push({ id: 'lock', value: true })
    else if (tab === 'unlocked') f.push({ id: 'lock', value: false })
    else if (tab === 'fading') f.push({ id: 'daysSince', value: [30, 60] as [number, number] })
    else if (tab === 'cold') f.push({ id: 'daysSince', value: [60, Number.POSITIVE_INFINITY] as [number, number] })
    if (tagFilter) f.push({ id: 'tags', value: tagFilter })
    return f
  }, [tab, tagFilter])

  const columns: ColumnDef<ClientTableFeatures, ClientRow, any>[] = useMemo(() => [
    columnHelper.accessor('name', {
      header: 'Client',
      sortFn: (ra, rb, id) => String(ra.getValue(id)).localeCompare(String(rb.getValue(id))),
      cell: ({ row }) => {
        const r = row.original
        return (
          <>
            <div className="font-medium text-charcoal-900">{r.name}</div>
            {r.phone && <div className="text-xs text-charcoal-400 mt-0.5">{r.phone}</div>}
            {r.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {r.tags.map(t => (
                  <span key={t} className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${tagColor(t)}`}>{t}</span>
                ))}
              </div>
            )}
          </>
        )
      },
    }),
    columnHelper.accessor('lastVisit', {
      header: 'Last Visit',
      sortFn: (ra, rb, id) => ((ra.getValue(id) as string | null) || '').localeCompare((rb.getValue(id) as string | null) || ''),
      cell: ({ row }) => (
        <span className="text-charcoal-600 text-xs">
          {row.original.lastVisit ? fmtDate(row.original.lastVisit) : '—'}
        </span>
      ),
    }),
    columnHelper.accessor('daysSince', {
      header: 'Since',
      filterFn: tabRangeFilter,
      sortFn: (ra, rb, id) => ((ra.getValue(id) as number | null) ?? 9999) - ((rb.getValue(id) as number | null) ?? 9999),
      cell: ({ row }) => (
        <span className={`text-xs font-semibold ${dayColor(row.original.daysSince)}`}>
          {daysAgoLabel(row.original.daysSince)}
        </span>
      ),
    }),
    columnHelper.accessor(row => barberMap[row.lastBarberId || ''] || '', {
      id: 'barber',
      header: staffLabel,
      sortFn: (ra, rb, id) => String(ra.getValue(id)).localeCompare(String(rb.getValue(id))),
      cell: ({ getValue }) => (
        <span className="text-charcoal-600 text-xs">{(getValue() as string) || '—'}</span>
      ),
    }),
    columnHelper.accessor('locked', {
      id: 'lock',
      header: 'Lock',
      filterFn: equalsFilter,
      sortFn: (ra, rb, id) => Number(ra.getValue(id)) - Number(rb.getValue(id)),
      cell: ({ row }) => {
        const r = row.original
        const lockedToName = barberMap[r.lockedToBarberId || ''] || '—'
        return r.locked
          ? <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full bg-od-green/10 text-od-green border border-od-green/20">🔒 {lockedToName}</span>
          : <span className="text-[10px] font-bold tracking-widest uppercase text-charcoal-400">Available</span>
      },
    }),
    columnHelper.accessor('totalVisits', {
      id: 'visits',
      header: 'Visits',
      sortFn: (ra, rb, id) => (ra.getValue(id) as number) - (rb.getValue(id) as number),
      cell: ({ row }) => <span className="text-charcoal-600">{row.original.totalVisits}</span>,
    }),
    columnHelper.accessor('totalSpend', {
      id: 'spend',
      header: 'Spend',
      sortFn: (ra, rb, id) => (ra.getValue(id) as number) - (rb.getValue(id) as number),
      cell: ({ row }) => <span className="font-mono text-charcoal-900">${row.original.totalSpend.toFixed(0)}</span>,
    }),
    // Hidden from render: exists only so the tag chip filter has a column to target.
    columnHelper.accessor('tags', {
      id: 'tags',
      enableSorting: false,
      filterFn: tagIncludesFilter,
    }),
    columnHelper.display({
      id: 'chevron',
      enableSorting: false,
      cell: () => (
        <span className="text-charcoal-400 text-center block">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            style={{ transform: 'rotate(-90deg)', margin: '0 auto' }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      ),
    }),
  ], [barberMap, staffLabel])

  const table = useTable({
    features: clientTableFeatures,
    data: clients,
    columns,
    state: { sorting, columnFilters, globalFilter: search, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    globalFilterFn: namePhoneFilter,
    // New column starts descending, clicking again flips; never removes sorting.
    enableSortingRemoval: false,
    // Never collapse an expanded "load more" list on data refresh.
    autoResetPageIndex: false,
  })

  function fmtDate(d: string) {
    return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const initials = shop?.name?.split(' ').map((w: string) => w[0]).join('').substring(0, 2).toUpperCase() || 'CH'

  const TABS: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'locked', label: 'Locked' },
    { key: 'unlocked', label: 'Available' },
    { key: 'fading', label: 'Fading' },
    { key: 'cold', label: 'Gone Cold' },
  ]

  const rows = table.getRowModel().rows
  const filteredCount = table.getFilteredRowModel().rows.length

  if (loading) return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-od-green border-t-transparent animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-warm-50">
      {profile?.role === 'barber' ? (
        <StaffNav
          shopName={shop?.name || ''}
          barberName={myBarberRow?.barber_name || myBarberRow?.alias || profile?.full_name || 'You'}
          color={myBarberRow?.color || '#b8861f'}
          initial={(myBarberRow?.barber_name || myBarberRow?.alias || profile?.full_name || 'S')[0].toUpperCase()}
          photoUrl={myBarberRow?.photo_url || undefined}
          userId={profile?.id}
        />
      ) : (
        <OwnerNav shopName={shop?.name || ''} ownerName={profile?.full_name || ''} initials={initials} userId={profile?.id} />
      )}

      <div className="lg:ml-64">
        <div className="w-full max-w-7xl mx-auto px-4 lg:px-8 pb-24 lg:pb-8">

          <div className="py-6 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500 mb-1">Client Directory</div>
              <h1 className="font-serif text-2xl text-charcoal-900">{clients.length} Clients</h1>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowImport(true)} className="btn-chairos-outline">Import</button>
              <button onClick={() => router.push('/dashboard/clients/locks')} className="btn-chairos-outline">Manage Locks</button>
            </div>
          </div>

          <div className="relative mb-4">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-400 w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="Search by name or phone…"
              value={search}
              onChange={e => { setSearch(e.target.value); resetPage() }}
              className="w-full pl-9 pr-4 py-2.5 bg-warm-100 border border-warm-200 rounded-xl text-sm text-charcoal-900 placeholder-charcoal-400 outline-none focus:border-od-green/60 transition-colors"
            />
          </div>

          <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => { setTab(t.key); resetPage() }}
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

          {allTags.length > 0 && (
            <div className="flex items-center gap-1.5 mb-4 overflow-x-auto pb-1">
              <span className="text-[10px] font-bold tracking-widest uppercase text-charcoal-400 flex-shrink-0">Tag</span>
              {allTags.map(t => (
                <button
                  key={t}
                  onClick={() => { setTagFilter(prev => prev === t ? null : t); resetPage() }}
                  className={`flex-shrink-0 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                    tagFilter === t ? tagColor(t) : 'bg-warm-100 border-warm-200 text-charcoal-500 hover:text-charcoal-900'
                  }`}
                >
                  {t}
                </button>
              ))}
              {tagFilter && (
                <button onClick={() => { setTagFilter(null); resetPage() }} className="flex-shrink-0 text-xs text-charcoal-400 hover:text-charcoal-900 transition-colors">
                  Clear
                </button>
              )}
            </div>
          )}

          <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden">
            {rows.length === 0 ? (
              <div className="p-10 text-center text-charcoal-500 text-sm">
                {search
                  ? 'No clients match your search.'
                  : counts.all === 0
                    ? 'No clients yet. Clients appear here after their first booking or walk-in.'
                    : 'No clients in this view.'}
              </div>
            ) : (
              <div className="overflow-x-auto lg:overflow-visible">
                <table className="w-full text-sm" style={{ minWidth: '680px' }}>
                  <thead>
                    {table.getHeaderGroups().map(hg => (
                      <tr key={hg.id} className="border-b border-warm-200 bg-warm-200/30">
                        {hg.headers.filter(h => h.column.id !== 'tags').map(header => {
                          const sortedDir = header.column.getIsSorted()
                          const canSort = header.column.getCanSort()
                          return (
                            <th
                              key={header.id}
                              onClick={canSort ? e => header.column.getToggleSortingHandler()?.(e) : undefined}
                              className={`px-3 py-2.5 text-left text-[10px] font-bold tracking-widest uppercase select-none whitespace-nowrap ${header.column.id === 'chevron' ? 'w-8' : 'cursor-pointer'} ${sortedDir ? 'text-od-green' : 'text-charcoal-400'}`}
                            >
                              {flexRender(header.column.columnDef.header, header.getContext())}
                              {sortedDir ? (sortedDir === 'asc' ? ' ↑' : ' ↓') : ''}
                            </th>
                          )
                        })}
                      </tr>
                    ))}
                  </thead>
                  <tbody>
                    {rows.map(row => (
                      <tr
                        key={row.id}
                        onClick={() => router.push(`/dashboard/clients/${row.original.clientId}`)}
                        className={`border-b border-warm-200 cursor-pointer hover:bg-warm-200/40 transition-colors ${rowAccent(row.original.daysSince)}`}
                      >
                        {row.getAllCells().filter(c => c.column.id !== 'tags').map(cell => (
                          <td key={cell.id} className="px-3 py-3">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {filteredCount > pagination.pageSize && (
              <div className="px-5 py-4 border-t border-warm-200 text-center">
                <button
                  onClick={() => setPagination(p => ({ ...p, pageSize: p.pageSize + PAGE_SIZE }))}
                  className="text-xs font-semibold text-od-green hover:opacity-80 transition-opacity"
                >
                  Load more · {filteredCount - pagination.pageSize} remaining
                </button>
              </div>
            )}
          </div>

        </div>
      </div>
      <MobileNav />
      {showImport && shop && (
        <ClientImportModal
          shopId={shop.id}
          onClose={() => setShowImport(false)}
          onDone={() => window.location.reload()}
        />
      )}
    </div>
  )
}
