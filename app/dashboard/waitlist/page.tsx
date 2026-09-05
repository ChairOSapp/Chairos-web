'use client'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import OwnerNav from '@/components/OwnerNav'
import StaffNav from '@/components/StaffNav'
import MobileNav from '@/components/MobileNav'
import { useVerticalLabels } from '@/lib/VerticalContext'

interface WaitlistEntry {
  id: string
  client_name: string
  client_phone: string
  staff_id: string | null
  service_id: string
  desired_date: string
  desired_time: string
  status: 'waiting' | 'notified' | 'claimed' | 'expired' | 'cancelled'
  position: number
  notify_expires_at: string | null
  created_at: string
  services: { name: string } | null
}

interface ShopBarber {
  barber_id: string
  barber_name: string | null
  alias: string | null
}

interface NotifyLog {
  id: string
  type: string
  payload: any
  result: string
  created_at: string
}

const STATUS_BADGE: Record<string, string> = {
  waiting: 'bg-warm-200 text-charcoal-500',
  notified: 'bg-blue-50 text-blue-600 border border-blue-200',
  claimed: 'bg-od-green/10 text-od-green border border-od-green/20',
  expired: 'bg-red-50 text-red-500 border border-red-200',
  cancelled: 'bg-warm-200 text-charcoal-400',
}

function timeDisplay(t: string) {
  const [h, m] = t.slice(0, 5).split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

function dateDisplay(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export default function WaitlistPage() {
  const { staffLabel } = useVerticalLabels()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [authLoading, setAuthLoading] = useState(true)
  const [role, setRole] = useState<'owner' | 'barber' | null>(null)
  const [shop, setShop] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [shopBarbers, setShopBarbers] = useState<ShopBarber[]>([])
  const [entries, setEntries] = useState<WaitlistEntry[]>([])
  const [logs, setLogs] = useState<NotifyLog[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'active' | 'all'>('active')

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
      setProfile(prof)
      const userRole: 'owner' | 'barber' = prof?.role === 'barber' ? 'barber' : 'owner'
      setRole(userRole)

      let shopData: any = null
      if (userRole === 'barber') {
        const { data: myEntry } = await supabase.from('shop_barbers').select('shop_id').eq('barber_id', user.id).eq('active', true).maybeSingle()
        if (myEntry) {
          const { data } = await supabase.from('shops').select('*').eq('id', myEntry.shop_id).maybeSingle()
          shopData = data
        }
      } else {
        const { data } = await supabase.from('shops').select('*').eq('owner_id', user.id).maybeSingle()
        shopData = data
      }
      setShop(shopData)
      setAuthLoading(false)

      if (!shopData) { setLoading(false); return }

      const { data: barbers } = await supabase
        .from('shop_barbers').select('barber_id, barber_name, alias').eq('shop_id', shopData.id).eq('active', true)
      setShopBarbers(barbers || [])

      const { data: waitlistRows } = await supabase
        .from('appointment_waitlist')
        .select('id, client_name, client_phone, staff_id, service_id, desired_date, desired_time, status, position, notify_expires_at, created_at, services(name)')
        .eq('shop_id', shopData.id)
        .order('desired_date', { ascending: true })
        .order('desired_time', { ascending: true })
        .order('created_at', { ascending: true })
      setEntries((waitlistRows || []) as unknown as WaitlistEntry[])

      if (userRole === 'owner') {
        fetch('/api/insights/waitlist-notify-log')
          .then(r => r.json())
          .then(d => setLogs(d.logs || []))
          .catch(() => {})
      }

      setLoading(false)
    }
    load()
  }, [])

  const visibleEntries = entries.filter(e => statusFilter === 'all' || e.status === 'waiting' || e.status === 'notified')
  const isSoloChair = role === 'barber' && shop?.owner_id === profile?.id
  const ownerName = profile?.full_name || shop?.name || 'Owner'
  const initials = ownerName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()

  function staffName(staffId: string | null) {
    if (!staffId) return `Any ${staffLabel}`
    const b = shopBarbers.find(b => b.barber_id === staffId)
    return b?.barber_name || b?.alias || staffLabel
  }

  if (authLoading) return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-od-green border-t-transparent animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-warm-50 pb-20 md:pb-0">
      {isSoloChair || role === 'barber' ? (
        <StaffNav
          shopName={shop?.name || ''}
          barberName={ownerName}
          color="#b8861f"
          initial={ownerName[0]?.toUpperCase() || 'S'}
          userId={profile?.id}
        />
      ) : (
        <OwnerNav shopName={shop?.name || ''} ownerName={ownerName} initials={initials} userId={profile?.id} />
      )}

      <div className="p-6 max-w-3xl mx-auto pb-24 md:pb-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500 mb-1">Waitlist</div>
            <h1 className="font-serif text-2xl text-charcoal-900">Fully-Booked Slot Requests</h1>
          </div>
          <div className="flex gap-1 bg-warm-100 border border-warm-200 rounded-xl p-1">
            {(['active', 'all'] as const).map(f => (
              <button key={f} onClick={() => setStatusFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${statusFilter === f ? 'bg-od-green text-white' : 'text-charcoal-500 hover:text-charcoal-900'}`}>
                {f === 'active' ? 'Active' : 'All'}
              </button>
            ))}
          </div>
        </div>

        {!shop ? (
          <div className="bg-warm-100 border border-warm-200 rounded-xl p-8 text-center text-charcoal-500 text-sm">No shop found for this account.</div>
        ) : loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 rounded-full border-2 border-od-green border-t-transparent animate-spin" />
          </div>
        ) : (
          <>
            <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden mb-6">
              <div className="px-5 py-4 border-b border-warm-200">
                <div className="font-serif text-charcoal-900">Waitlist Entries</div>
                <div className="text-xs text-charcoal-500 mt-0.5">{visibleEntries.length} {statusFilter === 'active' ? 'waiting or notified' : 'total'} — real demand for exact slots that were already booked</div>
              </div>
              {visibleEntries.length === 0 ? (
                <div className="p-8 text-center text-charcoal-500 text-sm">No {statusFilter === 'active' ? 'active ' : ''}waitlist entries.</div>
              ) : (
                <div className="divide-y divide-warm-200 max-h-[32rem] overflow-y-auto">
                  {visibleEntries.map(e => (
                    <div key={e.id} className="px-5 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-mono text-od-green">{dateDisplay(e.desired_date)}</span>
                          <span className="text-xs text-charcoal-500">{timeDisplay(e.desired_time)}</span>
                          <span className={`text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full ${STATUS_BADGE[e.status]}`}>{e.status}</span>
                        </div>
                        <div className="text-sm font-semibold text-charcoal-900 truncate">{e.client_name}</div>
                        <div className="text-xs text-charcoal-500 truncate">
                          {e.services?.name || 'Service'} &middot; {staffName(e.staff_id)} &middot; #{e.position} in line
                        </div>
                      </div>
                      {e.status === 'notified' && e.notify_expires_at && (
                        <div className="text-[10px] text-charcoal-400 flex-shrink-0 text-right">
                          expires<br />{new Date(e.notify_expires_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {role === 'owner' && (
              <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-warm-200">
                  <div className="font-serif text-charcoal-900">Outreach Log</div>
                  <div className="text-xs text-charcoal-500 mt-0.5">Every time a cancellation checked the waitlist — including cancellations skipped for being inside your notice window</div>
                </div>
                {logs.length === 0 ? (
                  <div className="p-8 text-center text-charcoal-500 text-sm">No outreach activity yet.</div>
                ) : (
                  <div className="divide-y divide-warm-200 max-h-96 overflow-y-auto">
                    {logs.map(l => {
                      const skippedNotice = l.result === 'skipped_insufficient_notice'
                      return (
                        <div key={l.id} className="px-5 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <span className={`text-xs font-mono ${skippedNotice ? 'text-amber-600' : 'text-charcoal-900'}`}>
                              {l.result}
                            </span>
                            <span className="text-[10px] text-charcoal-400 flex-shrink-0">{new Date(l.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                          </div>
                          {skippedNotice && (
                            <div className="text-xs text-charcoal-500 mt-1">
                              Cancelled only {l.payload?.hoursUntilStart}h before start — below your {l.payload?.minNoticeHours}h notice window, so no text was sent. This is intentional.
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <MobileNav />
    </div>
  )
}
