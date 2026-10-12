import type { SupabaseClient } from '@supabase/supabase-js'

// Shared campaign audience builder.
//
// This used to live inline in POST /api/campaigns/send — which meant
// SCHEDULED and RECURRING campaigns never got recipients at all: the
// dashboard only calls that route for "send now", and the scheduler
// triggered the send task against an empty recipient table, so the
// campaign was marked sent with zero messages delivered. The scheduler
// now builds the audience at due time through this same code path, so
// manual, once-scheduled, and recurring sends all resolve the audience
// identically (and identically to the preview endpoint, which is
// membership-based for all_clients).

export const MAX_CAMPAIGN_RECIPIENTS = 5000

type AudienceClient = {
  id: string
  full_name: string | null
  phone: string | null
  email: string | null
  sms_consent: boolean | null
  email_consent: boolean | null
}

type CampaignFilters = {
  days?: number
  barber_id?: string
  service?: string
  date?: string
  tag?: string
  client_ids?: unknown
  emails?: unknown[]
  phones?: unknown[]
  [key: string]: unknown
}

export type CampaignLike = {
  id: string
  shop_id: string
  channel: string
  audience_type: string
  audience_filters: CampaignFilters | null
}

// Last-10-digits normalization so a typed "+1 (202) 555-0100" matches a
// stored "2025550100". Used to resolve manual-list entries to client rows.
function normalizePhone(p: string | null | undefined): string {
  const digits = String(p ?? '').replace(/\D/g, '')
  return digits.length >= 10 ? digits.slice(-10) : digits
}

const CLIENT_SELECT = 'id, full_name, phone, email, sms_consent, email_consent'

// PostgREST caps a response at 1,000 rows: audience selectors that scan
// a shop's full appointment history silently computed last-visit maps
// and lapse sets from an arbitrary 1,000-row subset. Page through.
async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
): Promise<T[]> {
  const PAGE = 1000
  const all: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data } = await build(from, from + PAGE - 1)
    const rows = data ?? []
    all.push(...rows)
    if (rows.length < PAGE) return all
  }
}

async function fetchClientsByIds(admin: SupabaseClient, ids: string[]): Promise<AudienceClient[]> {
  const out: AudienceClient[] = []
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await admin.from('clients').select(CLIENT_SELECT).in('id', ids.slice(i, i + 500))
    out.push(...((data ?? []) as AudienceClient[]))
  }
  return out
}

export async function resolveCampaignAudience(
  admin: SupabaseClient,
  campaign: CampaignLike,
): Promise<AudienceClient[]> {
  const needsSms = campaign.channel === 'sms' || campaign.channel === 'both'
  const needsEmail = campaign.channel === 'email' || campaign.channel === 'both'
  const filters = campaign.audience_filters ?? {}
  const consentFilter = (rows: AudienceClient[]) =>
    rows.filter(c => (!needsSms || c.sms_consent) && (!needsEmail || (c.email_consent && c.email)))
  let clients: AudienceClient[] = []

  if (campaign.audience_type === 'all_clients') {
    // Membership-based, matching the preview endpoint exactly — the old
    // send path used clients.shop_id (home shop), so the owner reviewed
    // one list and a different list got sent.
    const memberships = await fetchAll((from, to) => admin
      .from('client_shop_memberships')
      .select('client_id')
      .eq('shop_id', campaign.shop_id)
      .order('client_id', { ascending: true })
      .range(from, to))
    const memberIds = [...new Set(memberships.map(m => (m as { client_id: string }).client_id))]
    if (memberIds.length > 0) {
      clients = consentFilter(await fetchClientsByIds(admin, memberIds))
    }

  } else if (campaign.audience_type === 'lapsed_clients') {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - (filters.days ?? 60))
    const cutoffStr = cutoff.toISOString().split('T')[0]
    const appts = await fetchAll((from, to) => admin
      .from('appointments')
      .select('client_id, date')
      .eq('shop_id', campaign.shop_id)
      .in('status', ['done', 'completed'])
      .not('client_id', 'is', null)
      .order('id', { ascending: true })
      .range(from, to))
    const lastVisit: Record<string, string> = {}
    for (const a of appts as { client_id: string; date: string }[]) {
      if (!lastVisit[a.client_id] || a.date > lastVisit[a.client_id]) lastVisit[a.client_id] = a.date
    }
    const lapsedIds = Object.entries(lastVisit).filter(([, d]) => d < cutoffStr).map(([id]) => id)
    if (lapsedIds.length > 0) {
      clients = consentFilter(await fetchClientsByIds(admin, lapsedIds))
    }

  } else if (campaign.audience_type === 'specific_barber') {
    const appts = await fetchAll((from, to) => admin
      .from('appointments')
      .select('client_id')
      .eq('shop_id', campaign.shop_id)
      .eq('barber_id', filters.barber_id)
      .in('status', ['done', 'completed'])
      .not('client_id', 'is', null)
      .order('id', { ascending: true })
      .range(from, to))
    const ids = [...new Set(appts.map(a => (a as { client_id: string }).client_id))]
    if (ids.length > 0) {
      clients = consentFilter(await fetchClientsByIds(admin, ids))
    }

  } else if (campaign.audience_type === 'specific_service') {
    const appts = await fetchAll((from, to) => admin
      .from('appointments')
      .select('client_id, services(name)')
      .eq('shop_id', campaign.shop_id)
      .in('status', ['done', 'completed'])
      .not('client_id', 'is', null)
      .order('id', { ascending: true })
      .range(from, to))
    const needle = (filters.service ?? '').toLowerCase()
    const ids = [...new Set(
      appts
        .filter(a => ((a as unknown as { services: { name: string } | null }).services?.name ?? '').toLowerCase().includes(needle))
        .map(a => (a as unknown as { client_id: string }).client_id),
    )]
    if (ids.length > 0) {
      clients = consentFilter(await fetchClientsByIds(admin, ids))
    }

  } else if (campaign.audience_type === 'no_booking_since') {
    const recent = await fetchAll((from, to) => admin
      .from('appointments')
      .select('client_id')
      .eq('shop_id', campaign.shop_id)
      .gte('date', filters.date ?? new Date().toISOString().split('T')[0])
      .in('status', ['done', 'completed'])
      .not('client_id', 'is', null)
      .order('id', { ascending: true })
      .range(from, to))
    const recentIds = new Set(recent.map(a => (a as { client_id: string }).client_id))
    const all = await fetchAll((from, to) => admin
      .from('appointments')
      .select('client_id')
      .eq('shop_id', campaign.shop_id)
      .in('status', ['done', 'completed'])
      .not('client_id', 'is', null)
      .order('id', { ascending: true })
      .range(from, to))
    const ids = [...new Set(all.map(a => (a as { client_id: string }).client_id))].filter(id => !recentIds.has(id))
    if (ids.length > 0) {
      clients = consentFilter(await fetchClientsByIds(admin, ids))
    }

  } else if (campaign.audience_type === 'specific_clients') {
    // Client IDs handed over by an insight/opportunity button. Resolve
    // server-side and verify every ID belongs to this shop — never trust
    // the stored list blindly — then consent-filter per channel.
    const ids: string[] = Array.isArray(filters.client_ids)
      ? filters.client_ids.filter((id: unknown) => typeof id === 'string' && id.length > 0)
      : []
    if (ids.length > 0) {
      const { data } = await admin.from('clients').select(CLIENT_SELECT).eq('shop_id', campaign.shop_id).in('id', ids)
      clients = consentFilter((data ?? []) as AudienceClient[])
    }

  } else if (campaign.audience_type === 'manual_list') {
    // Typed-in contacts are resolved against the shop's client list and
    // consent-filtered per channel. Anything not on the client list (no
    // consent record) or opted out is dropped — a typed-in address is
    // not consent.
    const emails: string[] = (filters.emails ?? []).filter(Boolean).map((e: unknown) => String(e).trim().toLowerCase())
    const phones: string[] = (filters.phones ?? []).filter(Boolean).map((p: unknown) => normalizePhone(String(p))).filter(Boolean)
    if (emails.length > 0 || phones.length > 0) {
      const rows = await fetchAll((from, to) => admin
        .from('clients')
        .select(CLIENT_SELECT)
        .eq('shop_id', campaign.shop_id)
        .order('id', { ascending: true })
        .range(from, to)) as AudienceClient[]
      const matched = new Map<string, AudienceClient>()
      for (const e of emails) {
        const hit = rows.find(c => (c.email ?? '').trim().toLowerCase() === e)
        if (hit) matched.set(hit.id, hit)
      }
      for (const p of phones) {
        const hit = rows.find(c => normalizePhone(c.phone) === p)
        if (hit) matched.set(hit.id, hit)
      }
      clients = consentFilter([...matched.values()])
    }

  } else if (campaign.audience_type === 'has_tag') {
    const tag = (filters.tag ?? '').trim().toLowerCase()
    if (tag) {
      const { data: tagged } = await admin.from('client_tags').select('client_id').eq('shop_id', campaign.shop_id).eq('tag', tag)
      const taggedIds = [...new Set((tagged ?? []).map((t: { client_id: string }) => t.client_id))]
      if (taggedIds.length > 0) {
        clients = consentFilter(await fetchClientsByIds(admin, taggedIds))
      }
    }
  }

  return clients
}

// Resolve the audience and insert any missing campaign_recipients rows
// (deduped against rows already present, so a reclaimed retry after a
// partial send never creates a second row per recipient).
export async function buildCampaignRecipients(
  admin: SupabaseClient,
  campaign: CampaignLike,
): Promise<{ audienceSize: number; inserted: number; tooLarge: boolean }> {
  const clients = await resolveCampaignAudience(admin, campaign)
  if (clients.length === 0) return { audienceSize: 0, inserted: 0, tooLarge: false }
  if (clients.length > MAX_CAMPAIGN_RECIPIENTS) {
    return { audienceSize: clients.length, inserted: 0, tooLarge: true }
  }

  const needsSms = campaign.channel === 'sms' || campaign.channel === 'both'
  const needsEmail = campaign.channel === 'email' || campaign.channel === 'both'

  const { data: existingRecipients } = await admin
    .from('campaign_recipients')
    .select('client_id, email, phone')
    .eq('campaign_id', campaign.id)
  const seenRecipients = new Set(
    (existingRecipients ?? []).map(r => `${r.client_id ?? ''}|${r.email ?? ''}|${r.phone ?? ''}`),
  )
  const recipientRows = clients
    .filter(c => !seenRecipients.has(`${c.id ?? ''}|${c.email ?? ''}|${c.phone ?? ''}`))
    .map(c => ({
      campaign_id: campaign.id,
      client_id: c.id ?? null,
      phone: c.phone ?? null,
      email: c.email ?? null,
      sms_status: needsSms ? 'pending' : 'skipped',
      email_status: needsEmail ? 'pending' : 'skipped',
    }))
  if (recipientRows.length > 0) {
    const { error } = await admin.from('campaign_recipients').insert(recipientRows)
    if (error) throw new Error(`recipient insert failed: ${error.message}`)
  }
  return { audienceSize: clients.length, inserted: recipientRows.length, tooLarge: false }
}
