// Shared builder for campaign-builder handoff URLs.
//
// Every campaign entry button (insights, analytics, opportunities) must hand
// the campaign page the exact client list it worked from — not just an
// `intent` string — so the builder can preselect that audience instead of
// defaulting to all_clients.
//
// Shape:
//   /dashboard/campaigns?intent=<prefill>&title=<campaign name>
//     &clientIds=<comma-separated client ids>   (preselects "Chosen clients")
//     &audience=all_clients|specific_barber     (no client list; fixed audience)
//     &barberId=<id>                            (with audience=specific_barber)

export interface CampaignHandoff {
  intent: string
  title?: string
  clientIds?: string[]
  audience?: 'all_clients' | 'specific_barber'
  barberId?: string
}

export function buildCampaignHref(h: CampaignHandoff): string {
  const params = new URLSearchParams()
  if (h.intent) params.set('intent', h.intent)
  if (h.title) params.set('title', h.title)
  const ids = (h.clientIds ?? []).filter(Boolean)
  if (ids.length > 0) params.set('clientIds', ids.join(','))
  if (h.audience) params.set('audience', h.audience)
  if (h.barberId) params.set('barberId', h.barberId)
  return `/dashboard/campaigns?${params.toString()}`
}
