'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import OwnerNav from '@/components/OwnerNav'
import MobileNav from '@/components/MobileNav'

const SMS_STATUS_COLORS: Record<string, string> = {
  sent: 'text-green-400',
  failed: 'text-red-400',
  pending: 'text-amber-400',
  skipped: 'text-charcoal-500',
}

export default function CampaignDetail() {
  const router = useRouter()
  const { id } = useParams() as { id: string }
  const supabase = createClient()

  const [profile, setProfile] = useState<any>(null)
  const [shop, setShop] = useState<any>(null)
  const [campaign, setCampaign] = useState<any>(null)
  const [recipients, setRecipients] = useState<any[]>([])
  const [runs, setRuns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
      setProfile(prof)

      const { data: s } = await supabase.from('shops').select('*').eq('owner_id', user.id).maybeSingle()
      setShop(s)

      if (!s) { setLoading(false); return }

      const { data: c } = await supabase.from('campaigns').select('*').eq('id', id).eq('shop_id', s.id).maybeSingle()
      if (!c) { router.push('/dashboard/campaigns'); return }
      setCampaign(c)

      const { data: r } = await supabase.from('campaign_recipients').select('*').eq('campaign_id', id).order('created_at', { ascending: false })
      setRecipients(r ?? [])

      const { data: ru } = await supabase.from('campaign_runs').select('*').eq('campaign_id', id).order('run_at', { ascending: false })
      setRuns(ru ?? [])

      setLoading(false)
    }
    load()
  }, [id])

  async function handleCancel() {
    if (!confirm('Cancel this campaign? It will stop sending.')) return
    setCancelling(true)
    await supabase.from('campaigns').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', id)
    setCampaign((c: any) => ({ ...c, status: 'cancelled' }))
    setCancelling(false)
  }

  if (loading) return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center">
      <div className="w-5 h-5 rounded-full border-2 border-od-green border-t-transparent animate-spin" />
    </div>
  )

  if (!campaign) return null

  const pending = recipients.filter(r => r.sms_status === 'pending' || r.email_status === 'pending').length
  const sent = recipients.filter(r => r.sms_status === 'sent' || r.email_status === 'sent').length
  const failed = recipients.filter(r => r.sms_status === 'failed' || r.email_status === 'failed').length

  return (
    <div className="min-h-screen bg-warm-50">
      <OwnerNav
        shopName={shop?.name ?? ''}
        ownerName={profile?.full_name ?? ''}
        initials={(profile?.full_name ?? 'O').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
        userId={profile?.id}
      />

      <div className="max-w-4xl mx-auto px-4 py-6 pb-24 md:pb-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <button onClick={() => router.push('/dashboard/campaigns')} className="btn-chairos-outline mb-2">Campaigns</button>
            <h1 className="font-serif text-2xl text-charcoal-900">{campaign.name}</h1>
            <p className="text-charcoal-500 text-sm mt-1">{campaign.intent}</p>
          </div>
          {campaign.status !== 'cancelled' && campaign.status !== 'sent' && (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="text-sm text-red-400 hover:text-red-300 border border-red-900 bg-red-950 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {cancelling ? 'Cancelling...' : 'Cancel Campaign'}
            </button>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Total Recipients', value: recipients.length },
            { label: 'Sent', value: sent, color: 'text-green-400' },
            { label: 'Failed', value: failed, color: 'text-red-400' },
            { label: 'Pending', value: pending, color: 'text-amber-400' },
          ].map((s, i) => (
            <div key={i} className="bg-warm-100 border border-warm-200 rounded-xl p-4">
              <div className={`text-2xl font-bold font-serif ${s.color ?? 'text-charcoal-900'}`}>{s.value}</div>
              <div className="text-xs text-charcoal-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Recurring runs */}
        {runs.length > 0 && (
          <div className="bg-warm-100 border border-warm-200 rounded-xl p-5 mb-6">
            <h2 className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-3">Campaign Runs</h2>
            <div className="space-y-2">
              {runs.map((run, i) => (
                <div key={i} className="flex items-center justify-between text-sm py-2 border-b border-warm-200 last:border-0">
                  <span className="text-charcoal-500">{new Date(run.run_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  <div className="flex gap-4">
                    <span className="text-green-400">{run.sent_count} sent</span>
                    {run.failed_count > 0 && <span className="text-red-400">{run.failed_count} failed</span>}
                    <span className="text-xs text-charcoal-500 bg-warm-200 px-1.5 py-0.5 rounded">{run.trigger_type}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recipients table */}
        <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden">
          <div className="p-5 border-b border-warm-200">
            <h2 className="text-xs font-semibold tracking-widest uppercase text-charcoal-400">Recipients</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-warm-200">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-charcoal-400 uppercase tracking-wider">Contact</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-charcoal-400 uppercase tracking-wider">SMS</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-charcoal-400 uppercase tracking-wider">Email</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-charcoal-400 uppercase tracking-wider">Sent At</th>
                </tr>
              </thead>
              <tbody>
                {recipients.map((r, i) => (
                  <tr key={i} className="border-b border-warm-200 last:border-0 hover:bg-warm-200/50">
                    <td className="px-5 py-3">
                      <div className="text-charcoal-900">{r.phone ?? r.email ?? '—'}</div>
                      {r.error && <div className="text-xs text-red-400 mt-0.5">{r.error}</div>}
                    </td>
                    <td className={`px-5 py-3 ${SMS_STATUS_COLORS[r.sms_status] ?? 'text-charcoal-500'}`}>
                      {r.sms_status}
                    </td>
                    <td className={`px-5 py-3 ${SMS_STATUS_COLORS[r.email_status] ?? 'text-charcoal-500'}`}>
                      {r.email_status}
                    </td>
                    <td className="px-5 py-3 text-charcoal-500 text-xs">
                      {r.sent_at ? new Date(r.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                  </tr>
                ))}
                {recipients.length === 0 && (
                  <tr><td colSpan={4} className="px-5 py-8 text-center text-charcoal-500 text-sm">No recipients yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <MobileNav />
    </div>
  )
}
