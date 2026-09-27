'use client'
import React, { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'

/**
 * Square sales-history sync card. Lives in Settings → Square Payments.
 * Pulls the shop's past Square payments so a new shop has real history
 * (and seeded clients) from day one.
 */
export default function SquareHistorySync({ shopId }: { shopId: string }) {
  const supabase = useMemo(() => createClient(), [])
  const [count, setCount] = useState<number | null>(null)
  const [revenueCents, setRevenueCents] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [justSynced, setJustSynced] = useState<any>(null)

  async function loadSummary() {
    const { data } = await supabase
      .from('square_payment_history')
      .select('amount_cents')
      .eq('shop_id', shopId)
    if (data) {
      setCount(data.length)
      setRevenueCents(data.reduce((s, r: any) => s + (r.amount_cents || 0), 0))
    }
  }

  useEffect(() => { loadSummary() }, [shopId])

  async function handleSync() {
    setSyncing(true); setError(null); setJustSynced(null)
    try {
      const res = await fetch('/api/square/import-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopId, months: 12 }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Sync failed')
      setJustSynced(json)
      await loadSummary()
    } catch (e: any) {
      setError(e.message || 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  const dollars = (c: number) => `$${(c / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`

  return (
    <div className="mt-5 pt-5 border-t border-warm-200">
      <div className="text-sm font-semibold text-charcoal-900 mb-0.5">Past sales history</div>
      <p className="text-xs text-charcoal-500 mb-3">
        Pull your last 12 months of Square sales into ChairOS. Past revenue shows up in your insights,
        and we&apos;ll add any new customers to your client list. Nothing is double-counted with your ChairOS bookings.
      </p>

      {count !== null && count > 0 && (
        <div className="text-xs text-charcoal-700 bg-warm-200/60 border border-warm-300 rounded-lg px-3 py-2 mb-3">
          <span className="font-semibold">{count} past payments</span> · <span className="font-semibold">{dollars(revenueCents)}</span> in history
        </div>
      )}

      {error && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{error}</div>
      )}

      {justSynced && (
        <div className="text-xs text-od-green bg-od-green/10 border border-od-green/20 rounded-lg px-3 py-2 mb-3">
          Synced {justSynced.paymentsSynced} payments ({dollars(justSynced.revenueCents)})
          {justSynced.clientsSeeded > 0 && ` · ${justSynced.clientsSeeded} new clients added`}
        </div>
      )}

      <button
        onClick={handleSync}
        disabled={syncing}
        className="px-4 py-2 rounded-lg bg-od-green text-white text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {syncing ? 'Syncing… this can take a minute' : count ? 'Re-sync past sales' : 'Sync past sales'}
      </button>
    </div>
  )
}
