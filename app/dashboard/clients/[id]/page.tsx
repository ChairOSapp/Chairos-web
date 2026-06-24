'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import OwnerNav from '@/components/OwnerNav'
import MobileNav from '@/components/MobileNav'

interface Client {
  id: string
  full_name: string | null
  phone: string | null
  email: string | null
  total_visits: number
  last_visit_date: string | null
}

interface ClientLock {
  locked: boolean
  loyalty_protected: boolean
  last_booking_date: string | null
  booking_count: number
  barber_id: string
}

interface Appointment {
  id: string
  date: string
  time: string | null
  price: number
  status: string
  barber_id: string
  services: { name: string } | null
}

interface ShopBarber {
  barber_id: string
  barber_name: string | null
  alias: string | null
  color: string | null
}

export default function ClientProfilePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [profile, setProfile] = useState<any>(null)
  const [shop, setShop] = useState<any>(null)
  const [client, setClient] = useState<Client | null>(null)
  const [lock, setLock] = useState<ClientLock | null>(null)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [shopBarbers, setShopBarbers] = useState<ShopBarber[]>([])
  const [loading, setLoading] = useState(true)
  const [smsSending, setSmsSending] = useState(false)
  const [smsResult, setSmsResult] = useState<'sent' | 'error' | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: prof } = await supabase
        .from('profiles').select('*').eq('id', user.id).maybeSingle()
      setProfile(prof)
      if (prof?.role === 'barber') { router.push('/dashboard/barber'); return }

      const { data: shopData } = await supabase
        .from('shops').select('*').eq('owner_id', user.id).maybeSingle()
      if (!shopData) { setLoading(false); return }
      setShop(shopData)

      const [
        { data: clientData },
        { data: lockData },
        { data: appts },
        { data: barbers },
      ] = await Promise.all([
        supabase.from('clients').select('id, full_name, phone, email, total_visits, last_visit_date').eq('id', id).maybeSingle(),
        supabase.from('client_locks').select('locked, loyalty_protected, last_booking_date, booking_count, barber_id').eq('client_id', id).eq('shop_id', shopData.id).maybeSingle(),
        supabase.from('appointments')
          .select('id, date, time, price, status, barber_id, services(name)')
          .eq('shop_id', shopData.id)
          .eq('client_id', id)
          .order('date', { ascending: false }),
        supabase.from('shop_barbers').select('barber_id, barber_name, alias, color').eq('shop_id', shopData.id),
      ])

      setClient(clientData)
      setLock(lockData)
      setAppointments((appts || []) as unknown as Appointment[])
      setShopBarbers(barbers || [])
      setLoading(false)
    }
    load()
  }, [id])

  async function sendRebookingSMS() {
    if (!client?.phone || !shop) return
    setSmsSending(true)
    setSmsResult(null)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://chairos.cc'
    const bookingLink = `${appUrl}/book/${shop.shop_code}`
    const message = `Hey ${client.full_name?.split(' ')[0] || 'there'}, it's been a while! Book your next appointment at ${bookingLink} — we'd love to see you again.`
    try {
      const res = await fetch('/api/sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: client.phone, message }),
      })
      setSmsResult(res.ok ? 'sent' : 'error')
    } catch {
      setSmsResult('error')
    } finally {
      setSmsSending(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-od-green border-t-transparent animate-spin" />
    </div>
  )

  if (!client) return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center">
      <div className="text-charcoal-500 text-sm">Client not found.</div>
    </div>
  )

  const ownerName = profile?.full_name || shop?.name || 'Owner'
  const initials = ownerName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()

  const daysSince = lock?.last_booking_date
    ? Math.floor((Date.now() - new Date(lock.last_booking_date).getTime()) / (1000 * 60 * 60 * 24))
    : client.last_visit_date
      ? Math.floor((Date.now() - new Date(client.last_visit_date).getTime()) / (1000 * 60 * 60 * 24))
      : null

  const isAtRisk = lock?.locked && daysSince !== null &&
    (lock.loyalty_protected ? daysSince > 300 : daysSince > 60)
  const statusLabel = !lock?.locked ? 'Floating' : isAtRisk ? 'At Risk' : 'Locked'
  const statusColor = !lock?.locked
    ? 'text-charcoal-600 bg-warm-200'
    : isAtRisk
      ? 'text-red-500 bg-red-50'
      : 'text-od-green bg-od-green/10'

  const doneAppts = appointments.filter(a => a.status === 'done')
  const lifetimeSpend = doneAppts.reduce((s, a) => s + (parseFloat(String(a.price)) || 0), 0)
  const totalVisits = doneAppts.length

  const preferredBarber = lock?.barber_id
    ? shopBarbers.find(b => b.barber_id === lock.barber_id)
    : null

  const STATUS_LABELS: Record<string, { label: string; color: string }> = {
    done: { label: 'Done', color: 'text-od-green' },
    noshow: { label: 'No-show', color: 'text-red-400' },
    cancelled: { label: 'Cancelled', color: 'text-charcoal-400' },
    pending: { label: 'Pending', color: 'text-charcoal-500' },
    confirmed: { label: 'Confirmed', color: 'text-charcoal-700' },
  }

  return (
    <div className="min-h-screen bg-warm-50">
      <OwnerNav shopName={shop?.name || ''} ownerName={ownerName} initials={initials} userId={profile?.id} />

      <div className="p-6 max-w-2xl mx-auto pb-24 md:pb-8">

        {/* HEADER */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500 mb-1">Client Profile</div>
            <h1 className="font-serif text-2xl text-charcoal-900">{client.full_name || 'Unknown Client'}</h1>
            {client.phone && <div className="text-sm text-charcoal-500 mt-1">{client.phone}</div>}
            {client.email && <div className="text-xs text-charcoal-400 mt-0.5">{client.email}</div>}
          </div>
          <button onClick={() => router.back()} className="text-xs font-semibold px-3 py-1 rounded-full border border-od-green/40 text-od-green bg-od-green/10 hover:bg-od-green/20 transition-colors">
            ← Back
          </button>
        </div>

        {/* STATUS BADGE + PREFERRED BARBER */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <span className={`text-xs font-bold tracking-widest uppercase px-3 py-1 rounded-full ${statusColor}`}>
            {statusLabel}
          </span>
          {preferredBarber && (
            <span className="text-xs text-charcoal-500">
              Locked to <span className="font-semibold text-charcoal-900">{preferredBarber.barber_name || preferredBarber.alias}</span>
            </span>
          )}
        </div>

        {/* STATS GRID */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-warm-100 border border-warm-200 rounded-xl p-4 text-center">
            <div className="font-serif text-3xl text-charcoal-900 mb-1">${lifetimeSpend.toFixed(0)}</div>
            <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500">Lifetime Spend</div>
          </div>
          <div className="bg-warm-100 border border-warm-200 rounded-xl p-4 text-center">
            <div className="font-serif text-3xl text-charcoal-900 mb-1">{totalVisits}</div>
            <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500">Total Visits</div>
          </div>
          <div className="bg-warm-100 border border-warm-200 rounded-xl p-4 text-center">
            <div className="font-serif text-xl text-charcoal-900 mb-1">
              {client.last_visit_date
                ? new Date(client.last_visit_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                : '—'}
            </div>
            <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500">Last Visit</div>
          </div>
          <div className="bg-warm-100 border border-warm-200 rounded-xl p-4 text-center">
            <div className={`font-serif text-3xl mb-1 ${daysSince !== null && daysSince > 60 ? 'text-red-400' : 'text-charcoal-900'}`}>
              {daysSince !== null ? `${daysSince}d` : '—'}
            </div>
            <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500">Days Since Visit</div>
          </div>
        </div>

        {/* SMS REBOOKING */}
        {client.phone && (
          <div className="bg-warm-100 border border-warm-200 rounded-xl p-5 mb-6">
            <div className="font-serif text-charcoal-900 mb-1">Send Rebooking SMS</div>
            <div className="text-xs text-charcoal-500 mb-4">
              Sends to {client.phone}: "Hey {client.full_name?.split(' ')[0] || 'there'}, it's been a while! Book your next appointment at {`${process.env.NEXT_PUBLIC_APP_URL || 'https://chairos.cc'}/book/${shop?.shop_code}`} — we'd love to see you again."
            </div>
            <button
              onClick={sendRebookingSMS}
              disabled={smsSending || smsResult === 'sent'}
              className="w-full py-3 rounded-xl bg-od-green text-white text-sm font-semibold transition-opacity disabled:opacity-50"
            >
              {smsSending ? 'Sending…' : smsResult === 'sent' ? 'SMS Sent ✓' : smsResult === 'error' ? 'Failed — Tap to Retry' : 'Send Rebooking SMS'}
            </button>
          </div>
        )}

        {/* APPOINTMENT HISTORY */}
        <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-warm-200">
            <div className="font-serif text-charcoal-900">Appointment History</div>
            <div className="text-xs text-charcoal-500 mt-0.5">{appointments.length} total</div>
          </div>
          {appointments.length === 0 ? (
            <div className="p-8 text-center text-charcoal-500 text-sm">No appointment history found.</div>
          ) : (
            <div className="divide-y divide-warm-200">
              {appointments.map(a => {
                const barber = shopBarbers.find(b => b.barber_id === a.barber_id)
                const st = STATUS_LABELS[a.status] || { label: a.status, color: 'text-charcoal-500' }
                return (
                  <div key={a.id} className="px-5 py-3 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-mono text-od-green">
                          {new Date(a.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                        <span className={`text-xs font-semibold ${st.color}`}>{st.label}</span>
                      </div>
                      <div className="text-sm text-charcoal-900">
                        {(a.services as any)?.name || 'Service'}
                        {barber && <span className="text-charcoal-500"> · {barber.barber_name || barber.alias}</span>}
                      </div>
                    </div>
                    <div className="font-mono text-sm font-semibold text-charcoal-900">
                      {a.status === 'done' ? `$${parseFloat(String(a.price)).toFixed(2)}` : '—'}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>
      <MobileNav />
    </div>
  )
}
