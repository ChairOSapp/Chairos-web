'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import OwnerNav from '@/components/OwnerNav'
import MobileNav from '@/components/MobileNav'
import { Suspense } from 'react'

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-warm-200 text-charcoal-500',
  scheduled: 'bg-blue-950 text-blue-400',
  sending: 'bg-amber-950 text-amber-400',
  sent: 'bg-green-950 text-green-400',
  recurring: 'bg-purple-950 text-purple-400',
  cancelled: 'bg-red-950 text-red-400',
}

const AUDIENCE_LABELS: Record<string, string> = {
  all_clients: 'All Clients',
  lapsed_clients: 'Lapsed Clients',
  specific_barber: 'By Barber',
  specific_service: 'By Service',
  no_booking_since: 'No Booking Since',
  manual_list: 'Manual Entry (type emails/phones)',
}

type Campaign = {
  id: string
  name: string
  intent: string
  channel: string
  audience_type: string
  audience_filters: any
  sms_message: string | null
  email_subject: string | null
  email_body: string | null
  ai_generated: boolean
  status: string
  schedule_type: string | null
  scheduled_at: string | null
  recurrence_rule: string | null
  recurrence_end_at: string | null
  recurrence_count: number | null
  sent_count: number
  failed_count: number
  created_at: string
}

function CampaignsInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [profile, setProfile] = useState<any>(null)
  const [shop, setShop] = useState<any>(null)
  const [barbers, setBarbers] = useState<any[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Campaign | null>(null)
  const [builderStep, setBuilderStep] = useState(1)

  // Builder state
  const [name, setName] = useState('')
  const [intent, setIntent] = useState('')
  const [smsMessage, setSmsMessage] = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [aiGenerated, setAiGenerated] = useState(false)
  const [aiCurate, setAiCurate] = useState(false)
  const [audienceType, setAudienceType] = useState('all_clients')
  const [lapsedDays, setLapsedDays] = useState('60')
  const [selectedBarberId, setSelectedBarberId] = useState('')
  const [serviceFilter, setServiceFilter] = useState('')
  const [noBookingSinceDate, setNoBookingSinceDate] = useState('')
  const [manualEmails, setManualEmails] = useState('')
  const [manualPhones, setManualPhones] = useState('')
  const [channel, setChannel] = useState<'sms' | 'email' | 'both'>('sms')
  const [scheduleType, setScheduleType] = useState<'now' | 'once' | 'recurring'>('now')
  const [scheduledAt, setScheduledAt] = useState('')
  const [recurrenceRule, setRecurrenceRule] = useState('weekly')
  const [recurrenceEndType, setRecurrenceEndType] = useState<'date' | 'count'>('count')
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('')
  const [recurrenceCount, setRecurrenceCount] = useState('4')

  const [audiencePreview, setAudiencePreview] = useState<{ count: number; excluded?: number } | null>(null)
  const [generating, setGenerating] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [sending, setSending] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
      setProfile(prof)

      const { data: s } = await supabase.from('shops').select('*').eq('owner_id', user.id).maybeSingle()
      setShop(s)

      if (s) {
        const { data: b } = await supabase.from('shop_barbers').select('*').eq('shop_id', s.id).eq('active', true)
        setBarbers(b ?? [])

        const { data: c } = await supabase.from('campaigns').select('*').eq('shop_id', s.id).order('created_at', { ascending: false })
        setCampaigns(c ?? [])
      }

      setLoading(false)
    }
    load()
  }, [])

  // Pre-fill intent from query param (from analytics page)
  useEffect(() => {
    const preIntent = searchParams.get('intent')
    if (preIntent) {
      setIntent(decodeURIComponent(preIntent))
      setSelected(null)
      setBuilderStep(1)
    }
  }, [searchParams])

  function startNew() {
    setSelected(null)
    setName('')
    setIntent('')
    setSmsMessage('')
    setEmailSubject('')
    setEmailBody('')
    setAiGenerated(false)
    setAiCurate(false)
    setAudienceType('all_clients')
    setLapsedDays('60')
    setSelectedBarberId('')
    setServiceFilter('')
    setNoBookingSinceDate('')
    setManualEmails('')
    setManualPhones('')
    setChannel('sms')
    setScheduleType('now')
    setScheduledAt('')
    setRecurrenceRule('weekly')
    setRecurrenceEndType('count')
    setRecurrenceEndDate('')
    setRecurrenceCount('4')
    setAudiencePreview(null)
    setBuilderStep(1)
    setError('')
    setSuccess('')
  }

  function loadCampaign(c: Campaign) {
    setSelected(c)
    setName(c.name)
    setIntent(c.intent)
    setSmsMessage(c.sms_message ?? '')
    setEmailSubject(c.email_subject ?? '')
    setEmailBody(c.email_body ?? '')
    setAiGenerated(c.ai_generated)
    setChannel(c.channel as any)
    setAudienceType(c.audience_type)
    setScheduleType((c.schedule_type as any) ?? 'now')
    setScheduledAt(c.scheduled_at ?? '')
    setRecurrenceRule(c.recurrence_rule ?? 'weekly')
    setManualEmails((c.audience_filters?.emails ?? []).join('\n'))
    setManualPhones((c.audience_filters?.phones ?? []).join('\n'))
    setAudiencePreview(null)
    setBuilderStep(1)
    setError('')
    setSuccess('')
  }

  async function handleGenerate() {
    if (!intent.trim()) { setError('Enter an intent first'); return }
    setGenerating(true)
    setError('')
    try {
      const res = await fetch('/api/campaigns/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent, channel, audienceType, audienceFilters: buildAudienceFilters(), shopName: shop?.name }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setSmsMessage(data.sms_message ?? '')
      setEmailSubject(data.email_subject ?? '')
      setEmailBody(data.email_body ?? '')
      setAiGenerated(true)
      setBuilderStep(2)
    } catch (e: any) {
      setError(e.message)
    }
    setGenerating(false)
  }

  function buildAudienceFilters() {
    if (audienceType === 'lapsed_clients') return { days: parseInt(lapsedDays) }
    if (audienceType === 'specific_barber') return { barber_id: selectedBarberId }
    if (audienceType === 'specific_service') return { service: serviceFilter }
    if (audienceType === 'no_booking_since') return { date: noBookingSinceDate }
    if (audienceType === 'manual_list') return {
      emails: manualEmails.split('\n').map(s => s.trim()).filter(Boolean),
      phones: manualPhones.split('\n').map(s => s.trim()).filter(Boolean),
    }
    if (aiCurate) return { custom_curate: true }
    return {}
  }

  async function handlePreviewAudience() {
    setPreviewing(true)
    setError('')
    try {
      const res = await fetch('/api/campaigns/audience', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audienceType, audienceFilters: buildAudienceFilters(), channel }),
      })
      const data = await res.json()
      setAudiencePreview({ count: data.count })
    } catch (e: any) {
      setError(e.message)
    }
    setPreviewing(false)
  }

  async function handleSaveDraft() {
    if (!name.trim() || !intent.trim()) { setError('Name and intent are required'); return }
    setSaving(true)
    setError('')
    const payload = {
      shop_id: shop.id,
      name,
      intent,
      channel,
      audience_type: audienceType,
      audience_filters: { ...buildAudienceFilters(), ...(aiCurate ? { custom_curate: true } : {}) },
      sms_message: smsMessage || null,
      email_subject: emailSubject || null,
      email_body: emailBody || null,
      ai_generated: aiGenerated,
      status: 'draft',
      schedule_type: scheduleType,
      scheduled_at: scheduleType !== 'now' && scheduledAt ? scheduledAt : null,
      recurrence_rule: scheduleType === 'recurring' ? recurrenceRule : null,
      recurrence_end_at: scheduleType === 'recurring' && recurrenceEndType === 'date' ? recurrenceEndDate : null,
      recurrence_count: scheduleType === 'recurring' && recurrenceEndType === 'count' ? parseInt(recurrenceCount) : null,
    }
    try {
      if (selected) {
        const { error } = await supabase.from('campaigns').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', selected.id)
        if (error) throw error
      } else {
        const { data: newC, error } = await supabase.from('campaigns').insert(payload).select().maybeSingle()
        if (error) throw error
        setSelected(newC)
      }
      const { data: c } = await supabase.from('campaigns').select('*').eq('shop_id', shop.id).order('created_at', { ascending: false })
      setCampaigns(c ?? [])
      setSuccess('Draft saved.')
    } catch (e: any) {
      setError(e.message)
    }
    setSaving(false)
  }

  async function handleSend() {
    if (!name.trim() || !intent.trim()) { setError('Name and intent are required'); return }
    setSending(true)
    setError('')
    setSuccess('')
    try {
      // Save first if new, then proceed with sending
      let campaignId = selected?.id
      if (!campaignId) {
        const payload = {
          shop_id: shop.id,
          name,
          intent,
          channel,
          audience_type: audienceType,
          audience_filters: { ...buildAudienceFilters(), ...(aiCurate ? { custom_curate: true } : {}) },
          sms_message: smsMessage || null,
          email_subject: emailSubject || null,
          email_body: emailBody || null,
          ai_generated: aiGenerated,
          status: 'draft',
          schedule_type: scheduleType,
          scheduled_at: scheduleType !== 'now' && scheduledAt ? scheduledAt : null,
          recurrence_rule: scheduleType === 'recurring' ? recurrenceRule : null,
          recurrence_end_at: scheduleType === 'recurring' && recurrenceEndType === 'date' ? recurrenceEndDate : null,
          recurrence_count: scheduleType === 'recurring' && recurrenceEndType === 'count' ? parseInt(recurrenceCount) : null,
        }
        const { data: newC, error: saveErr } = await supabase.from('campaigns').insert(payload).select().maybeSingle()
        if (saveErr) throw saveErr
        campaignId = newC!.id
        setSelected(newC)
      }

      // Update status to scheduled if not sending now
      if (scheduleType !== 'now') {
        await supabase.from('campaigns').update({
          status: 'scheduled',
          schedule_type: scheduleType,
          scheduled_at: scheduledAt || null,
          recurrence_rule: scheduleType === 'recurring' ? recurrenceRule : null,
          recurrence_end_at: scheduleType === 'recurring' && recurrenceEndType === 'date' ? recurrenceEndDate : null,
          recurrence_count: scheduleType === 'recurring' && recurrenceEndType === 'count' ? parseInt(recurrenceCount) : null,
          updated_at: new Date().toISOString(),
        }).eq('id', campaignId)
        setSuccess('Campaign scheduled.')
        const { data: c } = await supabase.from('campaigns').select('*').eq('shop_id', shop.id).order('created_at', { ascending: false })
        setCampaigns(c ?? [])
        setSending(false)
        return
      }

      const res = await fetch('/api/campaigns/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setSuccess(`Sending to ${data.recipientCount} recipients.`)
      const { data: c } = await supabase.from('campaigns').select('*').eq('shop_id', shop.id).order('created_at', { ascending: false })
      setCampaigns(c ?? [])
    } catch (e: any) {
      setError(e.message)
    }
    setSending(false)
  }

  const smsCharCount = smsMessage.length
  const smsOver = smsCharCount > 160

  if (loading) return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center">
      <div className="w-5 h-5 rounded-full border-2 border-od-green border-t-transparent animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-warm-50">
      <OwnerNav
        shopName={shop?.name ?? ''}
        ownerName={profile?.full_name ?? ''}
        initials={(profile?.full_name ?? 'O').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
        userId={profile?.id}
      />

      <div className="max-w-7xl mx-auto px-4 py-6 pb-24 md:pb-6 flex gap-6">

        {/* Left — Campaign list */}
        <div className="w-72 flex-shrink-0 hidden md:block">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-serif text-lg text-charcoal-900">Campaigns</h2>
            <button onClick={startNew} className="bg-od-green text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-od-green-light transition-colors">
              + New
            </button>
          </div>
          <div className="space-y-2">
            {campaigns.length === 0 && (
              <p className="text-charcoal-500 text-sm">No campaigns yet. Create one to get started.</p>
            )}
            {campaigns.map(c => (
              <button
                key={c.id}
                onClick={() => loadCampaign(c)}
                className={`w-full text-left p-3 rounded-xl border transition-all ${selected?.id === c.id ? 'bg-od-green/10 border-od-green/40' : 'bg-warm-100 border-warm-200 hover:border-warm-400'}`}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="text-sm font-semibold text-charcoal-900 line-clamp-1">{c.name}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${STATUS_COLORS[c.schedule_type === 'recurring' ? 'recurring' : c.status] ?? STATUS_COLORS.draft}`}>
                    {c.schedule_type === 'recurring' ? 'Recurring' : c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                  </span>
                </div>
                <div className="text-xs text-charcoal-500 line-clamp-1">{c.intent}</div>
                {(c.sent_count > 0 || c.failed_count > 0) && (
                  <div className="flex gap-2 mt-1.5 text-xs">
                    <span className="text-green-400">{c.sent_count} sent</span>
                    {c.failed_count > 0 && <span className="text-red-400">{c.failed_count} failed</span>}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Right — Builder */}
        <div className="flex-1 min-w-0">
          {/* Mobile: list at top */}
          <div className="md:hidden mb-4 flex items-center justify-between">
            <h2 className="font-serif text-lg text-charcoal-900">Campaigns</h2>
            <button onClick={startNew} className="bg-od-green text-white text-xs font-semibold px-3 py-1.5 rounded-lg">+ New</button>
          </div>

          {error && <p className="text-red-400 text-sm bg-red-950 border border-red-900 rounded-lg p-3 mb-4">{error}</p>}
          {success && <p className="text-green-400 text-sm bg-green-950 border border-green-900 rounded-lg p-3 mb-4">{success}</p>}

          <div className="bg-warm-100 border border-warm-200 rounded-xl p-6">
            {/* Step tabs */}
            <div className="flex gap-1 mb-6 flex-wrap">
              {['Intent', 'Message', 'Audience', 'Channel', 'Schedule', 'Review'].map((label, i) => (
                <button
                  key={i}
                  onClick={() => setBuilderStep(i + 1)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${builderStep === i + 1 ? 'bg-od-green text-black' : 'bg-warm-200 text-charcoal-500 hover:bg-warm-300'}`}
                >
                  {i + 1}. {label}
                </button>
              ))}
            </div>

            {/* Step 1 — Intent */}
            {builderStep === 1 && (
              <div>
                <h3 className="font-serif text-xl text-charcoal-900 mb-1">What is this campaign for?</h3>
                <p className="text-charcoal-500 text-sm mb-4">Describe the goal in plain language. AI will write the message.</p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Campaign Name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="e.g. Slow Tuesday Fill"
                      className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Intent</label>
                    <textarea
                      value={intent}
                      onChange={e => setIntent(e.target.value)}
                      rows={3}
                      placeholder="Fill slow Tuesday afternoon slots&#10;Reach clients who haven't booked in 60 days&#10;Promote Marcus's new availability"
                      className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors resize-none"
                    />
                  </div>
                </div>
                <div className="flex justify-end mt-6">
                  <button
                    onClick={handleGenerate}
                    disabled={!intent.trim() || generating}
                    className="bg-od-green text-black font-semibold px-6 py-2.5 rounded-lg text-sm disabled:opacity-50 hover:bg-od-green-light transition-colors"
                  >
                    {generating ? 'Generating...' : 'Generate Message'}
                  </button>
                </div>
              </div>
            )}

            {/* Step 2 — Message */}
            {builderStep === 2 && (
              <div>
                <h3 className="font-serif text-xl text-charcoal-900 mb-1">Your message</h3>
                <p className="text-charcoal-500 text-sm mb-4">AI-generated — edit freely.</p>
                <div className="space-y-5">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-semibold tracking-widest uppercase text-charcoal-400">SMS Message</label>
                      <span className={`text-xs font-mono ${smsOver ? 'text-red-400' : smsCharCount > 140 ? 'text-amber-400' : 'text-charcoal-500'}`}>
                        {smsCharCount}/160
                      </span>
                    </div>
                    <textarea
                      value={smsMessage}
                      onChange={e => setSmsMessage(e.target.value)}
                      rows={3}
                      className={`w-full bg-warm-200 border rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none transition-colors resize-none ${smsOver ? 'border-red-500' : 'border-warm-300 focus:border-od-green'}`}
                    />
                    <p className="text-xs text-charcoal-500 mt-1">"Reply STOP to unsubscribe." will be appended automatically.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Email Subject</label>
                    <input
                      type="text"
                      value={emailSubject}
                      onChange={e => setEmailSubject(e.target.value)}
                      className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Email Body</label>
                    <textarea
                      value={emailBody}
                      onChange={e => setEmailBody(e.target.value)}
                      rows={5}
                      className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors resize-none"
                    />
                  </div>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={aiCurate} onChange={e => setAiCurate(e.target.checked)} className="w-4 h-4 accent-od-green" />
                    <span className="text-sm text-charcoal-500">AI curate each send (regenerate message every recurring send)</span>
                  </label>
                </div>
                <div className="flex gap-3 justify-between mt-6">
                  <button onClick={handleGenerate} disabled={generating} className="text-sm text-od-green hover:text-od-green-light transition-colors disabled:opacity-50">
                    {generating ? 'Regenerating...' : '↻ Regenerate'}
                  </button>
                  <button onClick={() => setBuilderStep(3)} className="bg-od-green text-black font-semibold px-6 py-2.5 rounded-lg text-sm hover:bg-od-green-light transition-colors">
                    Audience
                  </button>
                </div>
              </div>
            )}

            {/* Step 3 — Audience */}
            {builderStep === 3 && (
              <div>
                <h3 className="font-serif text-xl text-charcoal-900 mb-1">Who gets this?</h3>
                <p className="text-charcoal-500 text-sm mb-4">Define your target audience.</p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Audience Type</label>
                    <select
                      value={audienceType}
                      onChange={e => setAudienceType(e.target.value)}
                      className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors"
                    >
                      {Object.entries(AUDIENCE_LABELS).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </div>
                  {audienceType === 'lapsed_clients' && (
                    <div>
                      <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Days Since Last Visit</label>
                      <input type="number" value={lapsedDays} onChange={e => setLapsedDays(e.target.value)} min="1"
                        className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors" />
                    </div>
                  )}
                  {audienceType === 'specific_barber' && (
                    <div>
                      <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Barber</label>
                      <select value={selectedBarberId} onChange={e => setSelectedBarberId(e.target.value)}
                        className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors">
                        <option value="">Select barber</option>
                        {barbers.map(b => <option key={b.barber_id} value={b.barber_id}>{b.barber_name || b.alias}</option>)}
                      </select>
                    </div>
                  )}
                  {audienceType === 'specific_service' && (
                    <div>
                      <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Service Name</label>
                      <input type="text" value={serviceFilter} onChange={e => setServiceFilter(e.target.value)} placeholder="e.g. Fade"
                        className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors" />
                    </div>
                  )}
                  {audienceType === 'no_booking_since' && (
                    <div>
                      <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">No Booking Since</label>
                      <input type="date" value={noBookingSinceDate} onChange={e => setNoBookingSinceDate(e.target.value)}
                        className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors" />
                    </div>
                  )}
                  {audienceType === 'manual_list' && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">
                          Email Addresses <span className="text-charcoal-500 normal-case font-normal">(one per line)</span>
                        </label>
                        <textarea
                          value={manualEmails}
                          onChange={e => setManualEmails(e.target.value)}
                          rows={4}
                          placeholder={"john@example.com\njane@example.com"}
                          className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors resize-none font-mono"
                        />
                        {manualEmails.trim() && (
                          <p className="text-xs text-charcoal-500 mt-1">
                            {manualEmails.split('\n').map(s => s.trim()).filter(Boolean).length} email{manualEmails.split('\n').map(s => s.trim()).filter(Boolean).length !== 1 ? 's' : ''}
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">
                          Phone Numbers <span className="text-charcoal-500 normal-case font-normal">(one per line, include country code)</span>
                        </label>
                        <textarea
                          value={manualPhones}
                          onChange={e => setManualPhones(e.target.value)}
                          rows={4}
                          placeholder={"+12025550100\n+13055550199"}
                          className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors resize-none font-mono"
                        />
                        {manualPhones.trim() && (
                          <p className="text-xs text-charcoal-500 mt-1">
                            {manualPhones.split('\n').map(s => s.trim()).filter(Boolean).length} phone{manualPhones.split('\n').map(s => s.trim()).filter(Boolean).length !== 1 ? 's' : ''}
                          </p>
                        )}
                      </div>
                      {(manualEmails.trim() || manualPhones.trim()) && (
                        <div className="bg-warm-200 border border-warm-300 rounded-lg p-3">
                          <p className="text-sm font-semibold text-charcoal-900">
                            {manualEmails.split('\n').map(s => s.trim()).filter(Boolean).length + manualPhones.split('\n').map(s => s.trim()).filter(Boolean).length} recipients entered
                          </p>
                          <p className="text-xs text-charcoal-500 mt-0.5">Consent checks are skipped for manual entries.</p>
                        </div>
                      )}
                    </div>
                  )}
                  {audienceType !== 'manual_list' && (
                    <>
                      <button onClick={handlePreviewAudience} disabled={previewing}
                        className="text-sm text-od-green hover:text-od-green-light transition-colors disabled:opacity-50">
                        {previewing ? 'Loading...' : '↺ Preview Audience'}
                      </button>
                      {audiencePreview !== null && (
                        <div className="bg-warm-200 border border-warm-300 rounded-lg p-3">
                          <p className="text-sm font-semibold text-charcoal-900">{audiencePreview.count} clients will receive this campaign</p>
                          {audiencePreview.count === 0 && (
                            <p className="text-xs text-amber-400 mt-1">No eligible recipients — check consent settings or adjust filters.</p>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
                <div className="flex gap-3 justify-between mt-6">
                  <button onClick={() => setBuilderStep(2)} className="btn-chairos-outline">Back</button>
                  <button onClick={() => setBuilderStep(4)} className="bg-od-green text-black font-semibold px-6 py-2.5 rounded-lg text-sm hover:bg-od-green-light transition-colors">
                    Channel
                  </button>
                </div>
              </div>
            )}

            {/* Step 4 — Channel */}
            {builderStep === 4 && (
              <div>
                <h3 className="font-serif text-xl text-charcoal-900 mb-1">How will you reach them?</h3>
                <p className="text-charcoal-500 text-sm mb-4">Only clients with appropriate consent will receive messages.</p>
                <div className="flex gap-3">
                  {(['sms', 'email', 'both'] as const).map(c => (
                    <button
                      key={c}
                      onClick={() => setChannel(c)}
                      className={`flex-1 py-4 rounded-xl border-2 text-sm font-semibold transition-all ${channel === c ? 'bg-od-green/10 border-od-green text-od-green' : 'bg-warm-200 border-warm-300 text-charcoal-500 hover:border-warm-400'}`}
                    >
                      {c === 'sms' ? 'SMS Only' : c === 'email' ? 'Email Only' : 'Both'}
                    </button>
                  ))}
                </div>
                {(channel === 'email' || channel === 'both') && (
                  <div className="mt-4 bg-warm-200 border border-warm-300 rounded-lg p-3">
                    <p className="text-xs text-charcoal-500">Emails will be sent from <span className="text-charcoal-900 font-medium">{process.env.NEXT_PUBLIC_RESEND_FROM_EMAIL ?? 'noreply@chairos.cc'}</span></p>
                  </div>
                )}
                <div className="flex gap-3 justify-between mt-6">
                  <button onClick={() => setBuilderStep(3)} className="btn-chairos-outline">Back</button>
                  <button onClick={() => setBuilderStep(5)} className="bg-od-green text-black font-semibold px-6 py-2.5 rounded-lg text-sm hover:bg-od-green-light transition-colors">
                    Schedule
                  </button>
                </div>
              </div>
            )}

            {/* Step 5 — Schedule */}
            {builderStep === 5 && (
              <div>
                <h3 className="font-serif text-xl text-charcoal-900 mb-1">When should this send?</h3>
                <p className="text-charcoal-500 text-sm mb-4">Send now or schedule for later.</p>
                <div className="flex gap-3 mb-6">
                  {(['now', 'once', 'recurring'] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => setScheduleType(s)}
                      className={`flex-1 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${scheduleType === s ? 'bg-od-green/10 border-od-green text-od-green' : 'bg-warm-200 border-warm-300 text-charcoal-500 hover:border-warm-400'}`}
                    >
                      {s === 'now' ? 'Send Now' : s === 'once' ? 'Schedule Once' : 'Recurring'}
                    </button>
                  ))}
                </div>
                {scheduleType === 'once' && (
                  <div>
                    <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Send At</label>
                    <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)}
                      className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors" />
                  </div>
                )}
                {scheduleType === 'recurring' && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">First Send</label>
                      <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)}
                        className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Frequency</label>
                      <div className="flex gap-2">
                        {['weekly', 'biweekly', 'monthly'].map(r => (
                          <button key={r} onClick={() => setRecurrenceRule(r)}
                            className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${recurrenceRule === r ? 'bg-od-green/10 border-od-green text-od-green' : 'bg-warm-200 border-warm-300 text-charcoal-500 hover:border-warm-400'}`}>
                            {r.charAt(0).toUpperCase() + r.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">End After</label>
                      <div className="flex gap-2 mb-3">
                        {(['count', 'date'] as const).map(t => (
                          <button key={t} onClick={() => setRecurrenceEndType(t)}
                            className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${recurrenceEndType === t ? 'bg-od-green/10 border-od-green text-od-green' : 'bg-warm-200 border-warm-300 text-charcoal-500'}`}>
                            {t === 'count' ? 'X sends' : 'A date'}
                          </button>
                        ))}
                      </div>
                      {recurrenceEndType === 'count' && (
                        <input type="number" value={recurrenceCount} onChange={e => setRecurrenceCount(e.target.value)} min="1"
                          placeholder="Number of sends"
                          className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors" />
                      )}
                      {recurrenceEndType === 'date' && (
                        <input type="date" value={recurrenceEndDate} onChange={e => setRecurrenceEndDate(e.target.value)}
                          className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green transition-colors" />
                      )}
                    </div>
                  </div>
                )}
                <div className="flex gap-3 justify-between mt-6">
                  <button onClick={() => setBuilderStep(4)} className="btn-chairos-outline">Back</button>
                  <button onClick={() => setBuilderStep(6)} className="bg-od-green text-black font-semibold px-6 py-2.5 rounded-lg text-sm hover:bg-od-green-light transition-colors">
                    Review
                  </button>
                </div>
              </div>
            )}

            {/* Step 6 — Review */}
            {builderStep === 6 && (
              <div>
                <h3 className="font-serif text-xl text-charcoal-900 mb-1">Review & Send</h3>
                <p className="text-charcoal-500 text-sm mb-4">Confirm everything looks right before sending.</p>
                <div className="bg-warm-200 border border-warm-300 rounded-xl p-4 space-y-3 mb-6">
                  {[
                    { label: 'Name', value: name || '—' },
                    { label: 'Intent', value: intent || '—' },
                    { label: 'Audience', value: AUDIENCE_LABELS[audienceType] },
                    { label: 'Channel', value: channel.toUpperCase() },
                    { label: 'Schedule', value: scheduleType === 'now' ? 'Send Now' : scheduleType === 'once' ? `Once — ${scheduledAt}` : `Recurring ${recurrenceRule}` },
                    ...(audiencePreview !== null ? [{ label: 'Recipients', value: `${audiencePreview.count} clients` }] : []),
                  ].map((row, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-charcoal-400">{row.label}</span>
                      <span className="text-charcoal-900 font-medium">{row.value}</span>
                    </div>
                  ))}
                </div>
                {(channel === 'sms' || channel === 'both') && smsMessage && (
                  <div className="bg-warm-200 border border-warm-300 rounded-xl p-4 mb-4">
                    <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">SMS Preview</div>
                    <p className="text-sm text-charcoal-700 leading-relaxed">{smsMessage}</p>
                    <p className="text-xs text-charcoal-500 mt-1 italic">+ "Reply STOP to unsubscribe."</p>
                  </div>
                )}
                {(channel === 'email' || channel === 'both') && emailSubject && (
                  <div className="bg-warm-200 border border-warm-300 rounded-xl p-4 mb-4">
                    <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Email Preview</div>
                    <p className="text-sm font-semibold text-charcoal-900 mb-1">{emailSubject}</p>
                    <p className="text-sm text-charcoal-700 leading-relaxed">{emailBody}</p>
                  </div>
                )}
                <div className="flex gap-3 justify-between mt-6">
                  <button onClick={() => setBuilderStep(5)} className="btn-chairos-outline">Back</button>
                  <div className="flex gap-2">
                    <button onClick={handleSaveDraft} disabled={saving}
                      className="border border-warm-300 text-charcoal-500 hover:text-charcoal-900 font-semibold px-4 py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50">
                      {saving ? 'Saving...' : 'Save Draft'}
                    </button>
                    <button onClick={handleSend} disabled={sending || !name.trim()}
                      className="bg-od-green text-black font-semibold px-6 py-2.5 rounded-lg text-sm hover:bg-od-green-light transition-colors disabled:opacity-50">
                      {sending ? 'Processing...' : scheduleType === 'now' ? 'Send Now' : 'Schedule Campaign'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <MobileNav />
    </div>
  )
}

export default function CampaignsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-warm-50 flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-od-green border-t-transparent animate-spin" />
      </div>
    }>
      <CampaignsInner />
    </Suspense>
  )
}
