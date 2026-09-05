'use client'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import OwnerNav from '@/components/OwnerNav'
import MobileNav from '@/components/MobileNav'

interface UnmatchedPayment {
  id: string
  square_payment_id: string
  amount: number
  payment_created_at: string
  candidate_appointment_ids: string[]
  status: 'pending' | 'matched' | 'dismissed'
}

interface CandidateAppt {
  id: string
  date: string
  time: string
  client_name: string
  price: number
  services: { name: string } | null
}

// Owner-facing fallback for Square payments taken directly through the
// owner's own Square app/reader/dashboard that the webhook (see
// handleUnreferencedPayment in app/api/square/webhook/route.ts) couldn't
// confidently auto-match to exactly one appointment. Automatic matching
// is the common case; this exists specifically for when it isn't --
// picking the right appointment here is a real judgment call the owner
// makes, not something ChairOS should guess at.
export default function UnmatchedPaymentsPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [shop, setShop] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [payments, setPayments] = useState<UnmatchedPayment[]>([])
  const [candidatesByPayment, setCandidatesByPayment] = useState<Record<string, CandidateAppt[]>>({})
  const [resolving, setResolving] = useState<string | null>(null)
  const [manualPick, setManualPick] = useState<Record<string, string>>({})

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
      setProfile(prof)
      const { data: shopData } = await supabase.from('shops').select('id, name').eq('owner_id', user.id).maybeSingle()
      setShop(shopData)
      if (!shopData) { setLoading(false); return }

      const { data: rows } = await supabase
        .from('unmatched_square_payments')
        .select('id, square_payment_id, amount, payment_created_at, candidate_appointment_ids, status')
        .eq('shop_id', shopData.id)
        .eq('status', 'pending')
        .order('payment_created_at', { ascending: false })
      setPayments((rows || []) as UnmatchedPayment[])

      const allCandidateIds = Array.from(new Set((rows || []).flatMap(r => r.candidate_appointment_ids || [])))
      if (allCandidateIds.length > 0) {
        const { data: appts } = await supabase
          .from('appointments')
          .select('id, date, time, client_name, price, services(name)')
          .in('id', allCandidateIds)
        const byId: Record<string, CandidateAppt> = {}
        ;((appts || []) as unknown as CandidateAppt[]).forEach(a => { byId[a.id] = a })
        const grouped: Record<string, CandidateAppt[]> = {}
        ;(rows || []).forEach(r => { grouped[r.id] = (r.candidate_appointment_ids || []).map((id: string) => byId[id]).filter(Boolean) })
        setCandidatesByPayment(grouped)
      }

      setLoading(false)
    }
    load()
  }, [])

  async function resolveMatch(paymentRowId: string, squarePaymentId: string, appointmentId: string) {
    setResolving(paymentRowId)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('appointments').update({
        payment_status: 'paid',
        square_payment_id: squarePaymentId,
        status: 'done',
      }).eq('id', appointmentId)
      await supabase.from('unmatched_square_payments').update({
        status: 'matched',
        matched_appointment_id: appointmentId,
        resolved_by: user?.id,
        resolved_at: new Date().toISOString(),
      }).eq('id', paymentRowId)
      setPayments(prev => prev.filter(p => p.id !== paymentRowId))
    } finally {
      setResolving(null)
    }
  }

  async function dismiss(paymentRowId: string) {
    setResolving(paymentRowId)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('unmatched_square_payments').update({
        status: 'dismissed',
        resolved_by: user?.id,
        resolved_at: new Date().toISOString(),
      }).eq('id', paymentRowId)
      setPayments(prev => prev.filter(p => p.id !== paymentRowId))
    } finally {
      setResolving(null)
    }
  }

  const initials = (profile?.full_name || shop?.name || 'O').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()

  if (loading) return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-od-green border-t-transparent animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-warm-50 pb-20 md:pb-0">
      <OwnerNav shopName={shop?.name || ''} ownerName={profile?.full_name || 'Owner'} initials={initials} userId={profile?.id} />
      <div className="p-6 max-w-3xl mx-auto pb-24 md:pb-8">
        <div className="mb-6">
          <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500 mb-1">Square</div>
          <h1 className="font-serif text-2xl text-charcoal-900">Unmatched Payments</h1>
          <p className="text-sm text-charcoal-500 mt-1">Payments taken directly in Square that couldn&apos;t be auto-matched to an appointment.</p>
        </div>

        {!shop ? (
          <div className="bg-warm-100 border border-warm-200 rounded-xl p-8 text-center text-charcoal-500 text-sm">No shop found for this account.</div>
        ) : payments.length === 0 ? (
          <div className="bg-warm-100 border border-warm-200 rounded-xl p-8 text-center text-charcoal-500 text-sm">Nothing to review — every recent Square payment was matched automatically.</div>
        ) : (
          <div className="space-y-4">
            {payments.map(p => {
              const candidates = candidatesByPayment[p.id] || []
              return (
                <div key={p.id} className="bg-warm-100 border border-warm-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="font-serif text-xl text-charcoal-900">${p.amount.toFixed(2)}</div>
                      <div className="text-xs text-charcoal-500">{new Date(p.payment_created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
                    </div>
                    <button onClick={() => dismiss(p.id)} disabled={resolving === p.id}
                      className="text-xs text-charcoal-400 hover:text-red-400 transition-colors disabled:opacity-50">
                      Not appointment-related
                    </button>
                  </div>

                  {candidates.length > 0 ? (
                    <div className="space-y-2">
                      <div className="text-xs text-charcoal-500 mb-1">Possible matches (same amount, nearby date):</div>
                      {candidates.map(c => (
                        <label key={c.id} className="flex items-center gap-2 bg-warm-200 rounded-lg px-3 py-2 cursor-pointer">
                          <input type="radio" name={`pick-${p.id}`} checked={manualPick[p.id] === c.id}
                            onChange={() => setManualPick(prev => ({ ...prev, [p.id]: c.id }))} />
                          <span className="text-sm text-charcoal-900">
                            {c.client_name} — {c.services?.name || 'Service'} — {new Date(c.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${c.price}
                          </span>
                        </label>
                      ))}
                      <button
                        onClick={() => manualPick[p.id] && resolveMatch(p.id, p.square_payment_id, manualPick[p.id])}
                        disabled={!manualPick[p.id] || resolving === p.id}
                        className="mt-2 bg-od-green hover:bg-od-green-light text-white font-semibold px-4 py-2 rounded-lg text-xs transition-colors disabled:opacity-50">
                        {resolving === p.id ? 'Matching…' : 'Confirm Match'}
                      </button>
                    </div>
                  ) : (
                    <div className="text-xs text-charcoal-500">No unpaid appointments matched this amount around this date — likely a retail sale or something outside ChairOS. Dismiss it if that&apos;s the case.</div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <MobileNav />
    </div>
  )
}
