// Shared types for the admin mission-control page.
// New sections (push adoption, App Store stats, …) plug in by adding a card
// to the SECTIONS registry in app/admin/page.tsx — no restructuring needed.

export type HealthStatus = 'healthy' | 'warning' | 'critical'
export type PulseSeverity = 'critical' | 'warning' | 'info'
export type PulseStatus = 'healthy' | 'attention' | 'critical'

export interface PulseAction {
  id: string
  severity: PulseSeverity
  kind: 'trial_ending' | 'past_due' | 'no_hours' | 'no_square' | 'critical_account' | 'error_spike'
  title: string
  why: string
  detail: string
  refId: string | null
  refName: string | null
  // Where tapping this action should land the admin. Kept as data (not a
  // URL) so the page can wire it to tabs/filters without hardcoding routes.
  target: { tab: 'accounts' | 'shops' } | null
}

export interface DayBucket { date: string; count: number }

export interface PulseData {
  status: PulseStatus
  headline: string
  generatedAt: string
  actions: PulseAction[]
  trends: {
    signupsDaily: DayBucket[]
    appointmentsDaily: DayBucket[]
    noShowThisWeek: number | null
    noShowLastWeek: number | null
  }
  customers: {
    totalClients: number
    lockedRelationships: number
    atRiskClients: number
  }
  product: {
    automationFresh: boolean
    notifications7d: number
  }
}

export interface MetricsData {
  mrr: number
  mrrChange: number | null
  activeShops: number
  activeSolo: number
  newSignups: number
  newSignupsWeek: number
  churnedCount: number
  revenueLostToChurn: number
  totalProfiles: number
  paidCount: number
  trialingCount: number
  conversionRate: number | null
  verticalBreakdown: Record<string, number>
  appointmentsWeek: number
  appointmentsMonth: number
  lockedRelationships: number
  recentErrors: {
    status: 'live' | 'pending' | 'error'
    count?: number
    issues?: { title: string; culprit: string; lastSeen: string; count: string }[]
    reason?: string
  }
}

export interface AdminUserRow {
  id: string
  email: string
  full_name: string | null
  role: string | null
  plan_type: string | null
  subscription_status: string | null
  stripe_subscription_id: string | null
  created_at: string
  shop_id: string | null
  shop_name: string | null
  shop_code: string | null
  health: HealthStatus
  health_reasons: string[]
}

export interface AdminShopRow {  id: string
  name: string
  vertical: string | null
  shopCode: string | null
  createdAt: string
  ownerEmail: string | null
  ownerName: string | null
  subscriptionStatus: string | null
  lastActiveAt: string | null
  appointmentCount: number
  revenueTotal: number
  clientCount: number
  lockedCount: number
}

// Platform (infrastructure) health — fed by the Vercel + Supabase APIs via
// /api/admin/infra. Everything is optional: a provider that isn't wired up
// yet reports configured:false and the UI shows setup steps instead of data.
export interface InfraDeployment {
  state: string
  createdAt: string
  commitMessage: string | null
  commitSha: string | null
  url: string | null
  target: string | null
}

export interface InfraData {
  generatedAt: string
  vercel: {
    configured: boolean
    ok: boolean
    error: string | null
    latest: InfraDeployment | null
    lastGood: InfraDeployment | null
    recentFailures: number
  }
  supabase: {
    configured: boolean
    ok: boolean
    error: string | null
    status: string | null
    name: string | null
    region: string | null
  }
  site: {
    ok: boolean
    statusCode: number | null
    latencyMs: number | null
    url: string
    checkedAt: string | null
    error: string | null
  }
}
