import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// POST /api/admin/retention-cleanup
// Automated data retention per the privacy policy:
// - SMS logs older than 1 year: deleted
// - Audit logs older than 1 year: deleted
// - Cancelled shops past 90-day grace: flagged for manual review (not auto-deleted)
//
// Protected by CRON_SECRET. Call on a schedule (e.g. daily).
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = getAdmin()
  const results: Record<string, any> = {}

  // 1. SMS logs older than 1 year
  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
  const { count: smsDeleted, error: smsErr } = await admin
    .from('sms_logs')
    .delete({ count: 'exact' })
    .lt('created_at', oneYearAgo.toISOString())
  results.sms_logs_deleted = smsErr ? { error: smsErr.message } : smsDeleted

  // 2. Audit logs older than 1 year (if table exists)
  try {
    const { count: auditDeleted, error: auditErr } = await admin
      .from('audit_logs')
      .delete({ count: 'exact' })
      .lt('created_at', oneYearAgo.toISOString())
    results.audit_logs_deleted = auditErr ? { error: auditErr.message } : auditDeleted
  } catch {
    results.audit_logs_deleted = 'table not found, skipped'
  }

  // 3. Cancelled shops past 90-day grace: flag for review, don't auto-delete
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
  const { data: expiredShops } = await admin
    .from('shops')
    .select('id, name, cancelled_at')
    .not('cancelled_at', 'is', null)
    .lt('cancelled_at', ninetyDaysAgo.toISOString())
    .is('deleted_at', null)

  results.shops_past_grace = (expiredShops || []).map(s => ({
    id: s.id,
    name: s.name,
    cancelled_at: s.cancelled_at,
  }))
  results.shops_past_grace_note = 'Flagged for manual review. Automatic deletion not yet enabled.'

  // 4. Completed deletion requests older than 30 days: verify they're done
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const { data: overdueRequests } = await admin
    .from('deletion_requests')
    .select('id, shop_id, requested_at')
    .eq('status', 'pending')
    .lt('requested_at', thirtyDaysAgo.toISOString())
  results.overdue_deletion_requests = (overdueRequests || []).length

  logger.info('retention_cleanup', results)

  return NextResponse.json({ ok: true, results })
}
