import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'
import { deleteShopData } from '@/lib/shopDeletion'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function authorized(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  return !!cronSecret && authHeader === `Bearer ${cronSecret}`
}

// POST /api/admin/retention-cleanup
// Automated data retention per the privacy policy (runs daily via Vercel cron):
// - SMS logs older than 1 year: deleted
// - Audit logs older than 1 year: deleted
// - Cancelled shops past 90-day grace: shop data auto-deleted (signed
//   consent records kept 7 years as legal records)
// - Pending deletion requests: completed (data deleted, request marked done)
// - Signed consent records older than 7 years: deleted (legal hold expired)
//
// Protected by CRON_SECRET. ?dryRun=true reports what would be deleted
// without deleting.
export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runCleanup(req)
}

// Vercel Cron Jobs issue GET requests — same handler, same protection.
export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runCleanup(req)
}

async function runCleanup(req: NextRequest) {
  const admin = getAdmin()
  const dryRun = req.nextUrl.searchParams.get('dryRun') === 'true'
  const results: Record<string, any> = { dryRun }

  // 1. SMS logs older than 1 year
  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
  if (dryRun) {
    const { count } = await admin.from('sms_logs').select('id', { count: 'exact', head: true }).lt('created_at', oneYearAgo.toISOString())
    results.sms_logs_deleted = count || 0
  } else {
    const { count: smsDeleted, error: smsErr } = await admin
      .from('sms_logs')
      .delete({ count: 'exact' })
      .lt('created_at', oneYearAgo.toISOString())
    results.sms_logs_deleted = smsErr ? { error: smsErr.message } : smsDeleted
  }

  // 2. Audit logs older than 1 year
  try {
    if (dryRun) {
      const { count } = await admin.from('audit_logs').select('id', { count: 'exact', head: true }).lt('created_at', oneYearAgo.toISOString())
      results.audit_logs_deleted = count || 0
    } else {
      const { count: auditDeleted, error: auditErr } = await admin
        .from('audit_logs')
        .delete({ count: 'exact' })
        .lt('created_at', oneYearAgo.toISOString())
      results.audit_logs_deleted = auditErr ? { error: auditErr.message } : auditDeleted
    }
  } catch {
    results.audit_logs_deleted = 'table not found, skipped'
  }

  // 3. Cancelled shops past 90-day grace: auto-delete.
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
  const { data: expiredShops } = await admin
    .from('shops')
    .select('id, name, cancelled_at')
    .not('cancelled_at', 'is', null)
    .lt('cancelled_at', ninetyDaysAgo.toISOString())
    .is('deleted_at', null)
  results.cancelled_shops = []
  for (const s of expiredShops || []) {
    const report = await deleteShopData(admin, s.id, { dryRun, reason: 'cancelled_90d' })
    results.cancelled_shops.push({
      id: s.id,
      name: s.name,
      cancelled_at: s.cancelled_at,
      tables: Object.keys(report.deleted).length,
      storageObjects: Object.values(report.storageDeleted).reduce((a: number, b: any) => a + b, 0),
      errors: report.errors,
    })
  }

  // 4. Pending deletion requests: complete them now (policy: within 30 days).
  const { data: pendingRequests } = await admin
    .from('deletion_requests')
    .select('id, shop_id, requested_at')
    .eq('status', 'pending')
  results.deletion_requests = []
  for (const r of pendingRequests || []) {
    const report = await deleteShopData(admin, r.shop_id, { dryRun, reason: 'deletion_request' })
    if (!dryRun && report.errors.length === 0) {
      await admin
        .from('deletion_requests')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', r.id)
    }
    results.deletion_requests.push({
      id: r.id,
      shop_id: r.shop_id,
      requested_at: r.requested_at,
      completed: !dryRun && report.errors.length === 0,
      errors: report.errors,
    })
  }

  // 5. Signed consent records past the 7-year legal hold: delete.
  const sevenYearsAgo = new Date()
  sevenYearsAgo.setFullYear(sevenYearsAgo.getFullYear() - 7)
  try {
    const { data: expired } = await admin
      .from('consent_form_signatures')
      .select('id, signed_pdf_path')
      .lt('created_at', sevenYearsAgo.toISOString())
      .limit(500)
    let pdfsDeleted = 0
    for (const sig of expired || []) {
      if (dryRun) continue
      if (sig.signed_pdf_path) {
        const { error } = await admin.storage.from('consent-signed').remove([sig.signed_pdf_path])
        if (!error) pdfsDeleted++
      }
      await admin.from('consent_form_signatures').delete().eq('id', sig.id)
    }
    results.consent_records_expired = dryRun ? (expired || []).length : { records: (expired || []).length, pdfsDeleted }
  } catch (err) {
    results.consent_records_expired = { error: (err as Error).message }
  }

  logger.info('retention_cleanup', results)
  return NextResponse.json({ ok: true, results })
}
