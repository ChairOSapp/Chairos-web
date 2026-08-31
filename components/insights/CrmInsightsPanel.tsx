'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

interface Props {
  shopId: string
}

const SOURCE_LABELS: Record<string, string> = {
  walk_in: 'Walk-in',
  online_booking: 'Online Booking',
  referral: 'Referral',
  campaign: 'Campaign',
  manual: 'Manual',
}

const SOURCE_COLORS: Record<string, string> = {
  walk_in: '#4a7fb5',
  online_booking: '#3aab6e',
  referral: '#9b6db5',
  campaign: '#e07850',
  manual: '#6b7280',
}

function Bar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <div className="w-28 flex-shrink-0 text-xs text-charcoal-600">{label}</div>
      <div className="flex-1 h-2 rounded-full bg-warm-200 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="w-20 flex-shrink-0 text-right text-xs font-mono text-charcoal-900">{count} <span className="text-charcoal-400">({pct}%)</span></div>
    </div>
  )
}

export default function CrmInsightsPanel({ shopId }: Props) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [loading, setLoading] = useState(true)
  const [sourceCounts, setSourceCounts] = useState<Record<string, number>>({})
  const [cancellationCounts, setCancellationCounts] = useState<Record<string, number>>({})
  const [cancelledTotal, setCancelledTotal] = useState(0)
  const [tagCounts, setTagCounts] = useState<{ tag: string; count: number }[]>([])
  const [campaignRows, setCampaignRows] = useState<{
    id: string; name: string; channel: string; sentCount: number; clickCount: number; attributedBookings: number; attributedRevenue: number
  }[]>([])

  useEffect(() => {
    if (!shopId) return
    let cancelled = false

    async function load() {
      setLoading(true)

      const [
        { data: memberships },
        { data: cancelledAppts },
        { data: tags },
        { data: campaigns },
        { data: attributedAppts },
      ] = await Promise.all([
        supabase.from('client_shop_memberships').select('client_id').eq('shop_id', shopId),
        supabase.from('appointments').select('cancellation_reason').eq('shop_id', shopId).eq('status', 'cancelled'),
        supabase.from('client_tags').select('tag').eq('shop_id', shopId),
        supabase.from('campaigns').select('id, name, channel, sent_count').eq('shop_id', shopId),
        supabase.from('appointments').select('campaign_attributed_id, price, status').eq('shop_id', shopId).not('campaign_attributed_id', 'is', null),
      ])

      if (cancelled) return

      // Acquisition source — clients who are members of this shop
      const clientIds = [...new Set((memberships || []).map(m => m.client_id).filter(Boolean))]
      const sc: Record<string, number> = {}
      if (clientIds.length > 0) {
        const { data: clients } = await supabase.from('clients').select('source').in('id', clientIds)
        for (const c of clients || []) {
          const s = c.source || 'manual'
          sc[s] = (sc[s] || 0) + 1
        }
      }
      if (!cancelled) setSourceCounts(sc)

      // Cancellation reasons
      const cc: Record<string, number> = {}
      for (const a of cancelledAppts || []) {
        if (!a.cancellation_reason) continue
        cc[a.cancellation_reason] = (cc[a.cancellation_reason] || 0) + 1
      }
      if (!cancelled) {
        setCancellationCounts(cc)
        setCancelledTotal((cancelledAppts || []).length)
      }

      // Tags
      const tc: Record<string, number> = {}
      for (const t of tags || []) tc[t.tag] = (tc[t.tag] || 0) + 1
      if (!cancelled) {
        setTagCounts(Object.entries(tc).map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count))
      }

      // Campaign attribution / ROI
      if (campaigns && campaigns.length > 0) {
        const campaignIds = campaigns.map(c => c.id)
        const { data: recipients } = await supabase
          .from('campaign_recipients')
          .select('campaign_id, click_count')
          .in('campaign_id', campaignIds)

        const clicksByCampaign: Record<string, number> = {}
        for (const r of recipients || []) {
          clicksByCampaign[r.campaign_id] = (clicksByCampaign[r.campaign_id] || 0) + (r.click_count || 0)
        }

        const bookingsByCampaign: Record<string, number> = {}
        const revenueByCampaign: Record<string, number> = {}
        for (const a of attributedAppts || []) {
          if (!a.campaign_attributed_id) continue
          bookingsByCampaign[a.campaign_attributed_id] = (bookingsByCampaign[a.campaign_attributed_id] || 0) + 1
          if (a.status === 'done') {
            revenueByCampaign[a.campaign_attributed_id] = (revenueByCampaign[a.campaign_attributed_id] || 0) + (parseFloat(String(a.price)) || 0)
          }
        }

        const rows = campaigns
          .map(c => ({
            id: c.id,
            name: c.name,
            channel: c.channel,
            sentCount: c.sent_count || 0,
            clickCount: clicksByCampaign[c.id] || 0,
            attributedBookings: bookingsByCampaign[c.id] || 0,
            attributedRevenue: revenueByCampaign[c.id] || 0,
          }))
          .filter(r => r.sentCount > 0 || r.attributedBookings > 0)
          .sort((a, b) => b.attributedRevenue - a.attributedRevenue)

        if (!cancelled) setCampaignRows(rows)
      } else if (!cancelled) {
        setCampaignRows([])
      }

      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [shopId, supabase])

  const totalClients = Object.values(sourceCounts).reduce((s, n) => s + n, 0)
  const totalCancellationReasons = Object.values(cancellationCounts).reduce((s, n) => s + n, 0)

  if (loading) {
    return (
      <div className="bg-warm-100 border border-warm-200 rounded-xl p-10 flex items-center justify-center mb-6">
        <div className="w-5 h-5 rounded-full border-2 border-od-green border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <>
      {/* ACQUISITION SOURCE */}
      <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-warm-200">
          <div className="font-serif text-charcoal-900">Client Acquisition</div>
          <div className="text-xs text-charcoal-500 mt-0.5">Where your {totalClients} client{totalClients !== 1 ? 's' : ''} came from</div>
        </div>
        <div className="p-5">
          {totalClients === 0 ? (
            <div className="text-center text-charcoal-500 text-sm py-4">No clients yet.</div>
          ) : (
            <div className="space-y-3">
              {Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]).map(([source, count]) => (
                <Bar key={source} label={SOURCE_LABELS[source] || source} count={count} total={totalClients} color={SOURCE_COLORS[source] || '#6b7280'} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* CAMPAIGN ATTRIBUTION / ROI */}
      <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-warm-200">
          <div className="font-serif text-charcoal-900">Campaign Attribution</div>
          <div className="text-xs text-charcoal-500 mt-0.5">Bookings and revenue traced back to a specific campaign send</div>
        </div>
        {campaignRows.length === 0 ? (
          <div className="p-5 text-center text-charcoal-500 text-sm">
            No attributed bookings yet — this fills in once a client books after clicking a campaign link.
          </div>
        ) : (
          <div className="divide-y divide-warm-200">
            {campaignRows.map(c => (
              <div key={c.id} className="px-5 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-charcoal-900 truncate">{c.name}</div>
                  <div className="text-xs text-charcoal-500 mt-0.5">
                    {c.channel.toUpperCase()} · {c.sentCount} sent · {c.clickCount} click{c.clickCount !== 1 ? 's' : ''} · {c.attributedBookings} booking{c.attributedBookings !== 1 ? 's' : ''}
                  </div>
                </div>
                <div className="font-mono text-sm font-semibold text-od-green flex-shrink-0">${c.attributedRevenue.toFixed(0)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CANCELLATION REASONS */}
      <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-warm-200">
          <div className="font-serif text-charcoal-900">Cancellation Reasons</div>
          <div className="text-xs text-charcoal-500 mt-0.5">{cancelledTotal} cancelled appointment{cancelledTotal !== 1 ? 's' : ''} total</div>
        </div>
        <div className="p-5">
          {totalCancellationReasons === 0 ? (
            <div className="text-center text-charcoal-500 text-sm py-4">
              {cancelledTotal > 0 ? 'No reasons recorded for cancelled appointments yet.' : 'No cancellations yet.'}
            </div>
          ) : (
            <div className="space-y-3">
              {Object.entries(cancellationCounts).sort((a, b) => b[1] - a[1]).map(([reason, count]) => (
                <Bar key={reason} label={reason} count={count} total={totalCancellationReasons} color="#c06060" />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* CLIENT TAGS */}
      <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-warm-200">
          <div className="font-serif text-charcoal-900">Client Tags</div>
          <div className="text-xs text-charcoal-500 mt-0.5">Tap a tag to see who's in it</div>
        </div>
        <div className="p-5">
          {tagCounts.length === 0 ? (
            <div className="text-center text-charcoal-500 text-sm py-4">No tags yet — add tags from a client's profile page.</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tagCounts.map(({ tag, count }) => (
                <button
                  key={tag}
                  onClick={() => router.push(`/dashboard/clients?tag=${encodeURIComponent(tag)}`)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border bg-od-green/10 text-od-green border-od-green/20 hover:bg-od-green/20 transition-colors"
                >
                  {tag} <span className="opacity-70">· {count}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
