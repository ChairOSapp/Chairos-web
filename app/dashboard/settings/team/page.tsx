'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import OwnerNav from '@/components/OwnerNav'
import MobileNav from '@/components/MobileNav'

type Member = {
  id: string
  shop_id: string
  user_id: string
  role: 'owner' | 'admin'
  email?: string | null
  full_name?: string | null
  created_at: string
}

type Seats = {
  included: number
  used: number
  overage: number
  billable: boolean
}

export default function TeamPage() {
  const [shopName, setShopName] = useState('')
  const [members, setMembers] = useState<Member[]>([])
  const [seats, setSeats] = useState<Seats | null>(null)
  const [callerRole, setCallerRole] = useState<string | null>(null)
  const [callerId, setCallerId] = useState<string | null>(null)
  const [planTier, setPlanTier] = useState('standard')
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'owner' | 'admin'>('admin')
  const [inviting, setInviting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [actingId, setActingId] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  async function load() {
    setLoading(true)
    setError('')
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }
    const res = await fetch('/api/shop/members')
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Could not load team')
      setLoading(false)
      return
    }
    setShopName(data.shop?.name || '')
    setMembers(data.members || [])
    setSeats(data.seats || null)
    setCallerRole(data.callerRole || null)
    setCallerId(data.callerId || null)
    setPlanTier(data.shop?.plan_tier || 'standard')
    setLoading(false)
  }

  useEffect(() => {
    // Mount-time data fetch; matches the pattern used across dashboard pages.
    // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
    load()
  }, [])

  async function invite() {
    setInviting(true)
    setError('')
    setNotice('')
    const res = await fetch('/api/shop/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, role }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Invite failed')
    } else {
      setEmail('')
      setMembers((prev) => [
        ...prev,
        { ...data.member, email: data.member.email, full_name: null },
      ])
      setSeats(data.seats)
      if (data.seatNotice) setNotice(data.seatNotice)
      else setNotice('Seat added.')
    }
    setInviting(false)
  }

  async function changeRole(member: Member, newRole: 'owner' | 'admin') {
    if (member.role === newRole) return
    setActingId(member.id)
    setError('')
    const res = await fetch(`/api/shop/members/${member.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Could not change role')
    } else {
      setMembers((prev) =>
        prev.map((m) => (m.id === member.id ? { ...m, role: newRole } : m))
      )
      if (data.seats) setSeats(data.seats)
    }
    setActingId(null)
  }

  async function remove(member: Member) {
    if (
      !window.confirm(
        `Remove ${member.email || 'this person'}'s ${member.role} seat? They will lose dashboard access.`
      )
    )
      return
    setActingId(member.id)
    setError('')
    const res = await fetch(`/api/shop/members/${member.id}`, { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Could not remove')
    } else {
      setMembers((prev) => prev.filter((m) => m.id !== member.id))
      if (data.seats) setSeats(data.seats)
    }
    setActingId(null)
  }

  const isOwner = callerRole === 'owner'
  const initials =
    shopName
      .split(' ')
      .map((w) => w[0])
      .join('')
      .substring(0, 2)
      .toUpperCase() || 'CH'

  return (
    <div className="min-h-screen bg-warm-50">
      <OwnerNav shopName={shopName} ownerName={''} initials={initials} />
      <div className="max-w-2xl mx-auto px-4 py-8 pb-24">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()} className="btn-chairos-outline">
            Back
          </button>
          <h1 className="font-serif text-2xl text-charcoal-900">Team & Seats</h1>
        </div>

        {error && (
          <p className="text-red-400 text-sm bg-red-950 border border-red-900 rounded-lg p-3 mb-4">
            {error}
          </p>
        )}
        {notice && (
          <p className="text-od-green text-sm bg-od-green/10 border border-od-green/30 rounded-lg p-3 mb-4">
            {notice}
          </p>
        )}

        {loading ? (
          <p className="text-charcoal-500 text-sm">Loading team…</p>
        ) : (
          <>
            {/* Seat usage */}
            {seats && (
              <div className="bg-warm-100 border border-warm-200 rounded-xl p-6 mb-4">
                <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-1">
                  Admin Seats
                </div>
                <p className="text-charcoal-700 text-sm mb-1">
                  {seats.used} of {seats.included} included seats in use
                  {planTier === 'school' ? ' (campus package)' : ''}
                </p>
                <p className="text-charcoal-500 text-xs">
                  Your plan includes 1 owner seat
                  {planTier === 'school'
                    ? ' plus 4 more admin seats with the campus package'
                    : ''}
                  . Extra owner/admin seats are billed per seat.
                </p>
                {seats.billable && (
                  <p className="text-amber-600 text-xs mt-2 font-semibold">
                    {seats.overage} seat{seats.overage === 1 ? '' : 's'} over the
                    included count — will be billed once per-seat billing is
                    enabled.
                  </p>
                )}
              </div>
            )}

            {/* Members */}
            <div className="bg-warm-100 border border-warm-200 rounded-xl p-6 mb-4">
              <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-4">
                Seat Holders
              </div>
              <div className="space-y-3">
                {members.map((m) => {
                  const isPrimary = m.id.startsWith('primary-')
                  const isSelf = m.user_id === callerId
                  return (
                    <div
                      key={m.id}
                      className="flex items-center gap-3 bg-warm-200 border border-warm-300 rounded-lg px-4 py-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-charcoal-900 text-sm font-semibold truncate">
                          {m.full_name || m.email || 'Unknown'}
                          {isSelf && (
                            <span className="text-charcoal-400 font-normal"> (you)</span>
                          )}
                        </div>
                        {m.email && m.full_name && (
                          <div className="text-charcoal-500 text-xs truncate">{m.email}</div>
                        )}
                        <div className="text-charcoal-500 text-xs capitalize">
                          {m.role}
                          {isPrimary ? ' · primary' : ''}
                        </div>
                      </div>
                      {isOwner && !isPrimary && !isSelf && (
                        <div className="flex items-center gap-2">
                          <select
                            value={m.role}
                            disabled={actingId === m.id}
                            onChange={(e) =>
                              changeRole(m, e.target.value as 'owner' | 'admin')
                            }
                            className="text-xs bg-warm-100 border border-warm-300 rounded-lg px-2 py-1.5 text-charcoal-900"
                          >
                            <option value="admin">Admin</option>
                            <option value="owner">Owner</option>
                          </select>
                          <button
                            disabled={actingId === m.id}
                            onClick={() => remove(m)}
                            className="text-xs px-3 py-1.5 border border-red-900/40 text-red-400 rounded-lg hover:bg-red-950 transition-colors disabled:opacity-50"
                          >
                            {actingId === m.id ? '…' : 'Remove'}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
                {members.length === 0 && (
                  <p className="text-charcoal-500 text-sm">No seat holders found.</p>
                )}
              </div>
            </div>

            {/* Invite */}
            {isOwner ? (
              <div className="bg-warm-100 border border-warm-200 rounded-xl p-6">
                <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-1">
                  Add Owner / Admin
                </div>
                <p className="text-charcoal-500 text-xs mb-4">
                  They must already have a ChairOS account. Owner seats can manage
                  the shop and other seats; admin seats handle day-to-day work but
                  can&apos;t manage seats or billing. Extra seats beyond your
                  included count are billed per seat.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="teammate@example.com"
                    className="flex-1 bg-warm-200 border border-warm-300 rounded-lg px-4 py-2.5 text-sm text-charcoal-900 placeholder:text-charcoal-400"
                  />
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as 'owner' | 'admin')}
                    className="bg-warm-200 border border-warm-300 rounded-lg px-3 py-2.5 text-sm text-charcoal-900"
                  >
                    <option value="admin">Admin</option>
                    <option value="owner">Owner</option>
                  </select>
                  <button
                    onClick={invite}
                    disabled={inviting || !email.trim()}
                    className="btn-chairos whitespace-nowrap disabled:opacity-50"
                  >
                    {inviting ? 'Adding…' : 'Add Seat'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-warm-100 border border-warm-200 rounded-xl p-6">
                <p className="text-charcoal-500 text-xs">
                  Only owners can add or manage seats. Ask a shop owner to change
                  your role.
                </p>
              </div>
            )}
          </>
        )}
      </div>
      <MobileNav />
    </div>
  )
}
