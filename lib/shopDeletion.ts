import { logger } from '@/lib/logger'

export interface DeletionReport {
  shopId: string
  shopName: string
  dryRun: boolean
  deleted: Record<string, number>
  storageDeleted: Record<string, number>
  errors: string[]
}

/**
 * Permanently delete a shop's data per the privacy policy (cancelled >
 * 90 days, or an approved deletion request). Bear's directive: don't own
 * data forever, don't pay to store it.
 *
 * Deliberately NOT deleted (legal hold):
 * - consent_form_signatures rows + consent-signed storage objects: the
 *   privacy policy promises 7-year retention as legal records.
 * - profiles (user auth accounts) — only shop data goes.
 * - clients shared with other shops — only orphaned client rows go.
 *
 * Tables are deleted referrers-first so FK constraints don't block.
 * Every table delete is best-effort and logged; a failure skips that
 * table but continues (the shop tombstone is only written when the
 * critical tables succeed).
 */

// [table, shopIdColumn] — deleted in this order.
const SHOP_TABLES: [string, string][] = [
  ['campaign_recipients', 'campaign_id'], // special-cased via campaigns
  ['campaign_runs', 'shop_id'],
  ['campaigns', 'shop_id'],
  ['review_responses', 'shop_id'],
  ['deposits', 'shop_id'],
  ['tips', 'shop_id'],
  ['reviews', 'shop_id'],
  ['appointment_waitlist', 'shop_id'],
  ['waitlist', 'shop_id'],
  ['walk_ins', 'shop_id'],
  ['kiosk_queue_public', 'shop_id'],
  ['booking_sessions', 'shop_id'],
  ['appointments', 'shop_id'],
  ['services', 'shop_id'],
  ['service_presets', 'shop_id'],
  ['pricing_rules', 'shop_id'],
  ['shop_barbers', 'shop_id'],
  ['pending_barbers', 'shop_id'],
  ['shop_invites', 'shop_id'],
  ['invites', 'shop_id'],
  ['client_locks', 'shop_id'],
  ['client_notes', 'shop_id'],
  ['client_tags', 'shop_id'],
  ['client_shop_memberships', 'shop_id'],
  ['consent_form_templates', 'shop_id'],
  ['notifications', 'shop_id'],
  ['briefs', 'shop_id'],
  ['recommendations', 'shop_id'],
  ['referral_events', 'shop_id'],
  ['referral_rewards', 'shop_id'],
  ['lapse_alerts', 'shop_id'],
  ['booth_rent_payments', 'shop_id'],
  ['square_accounts', 'shop_id'],
  ['staff_tax_info', 'shop_id'],
  ['kiosk_config', 'shop_id'],
  ['vertical_config', 'shop_id'],
  ['unmatched_square_payments', 'shop_id'],
  ['shop_realtime_pings', 'shop_id'],
  ['automation_logs', 'shop_id'],
  ['audit_events', 'shop_id'],
  ['billing_events', 'shop_id'],
]

// Storage buckets with per-shop prefixes. consent-signed is EXCLUDED
// (7-year legal hold on signed consent PDFs).
const STORAGE_PREFIX_BUCKETS = ['shop-assets', 'consent-templates']

export async function deleteShopData(
  admin: any,
  shopId: string,
  opts: { dryRun: boolean; reason: string }
): Promise<DeletionReport> {
  const report: DeletionReport = {
    shopId,
    shopName: '',
    dryRun: opts.dryRun,
    deleted: {},
    storageDeleted: {},
    errors: [],
  }

  const { data: shop } = await admin.from('shops').select('id, name').eq('id', shopId).maybeSingle()
  if (!shop) {
    report.errors.push('shop not found')
    return report
  }
  report.shopName = shop.name || shopId

  // Capture candidate client IDs BEFORE deletes (memberships/appointments
  // for this shop are removed in the table loop below).
  const candidateClientIds = new Set<string>()
  try {
    const { data: appts } = await admin.from('appointments').select('client_id').eq('shop_id', shopId)
    for (const a of appts || []) if (a.client_id) candidateClientIds.add(a.client_id)
    const { data: memberships } = await admin.from('client_shop_memberships').select('client_id').eq('shop_id', shopId)
    for (const m of memberships || []) if (m.client_id) candidateClientIds.add(m.client_id)
  } catch (err) {
    report.errors.push(`client candidate lookup: ${(err as Error).message}`)
  }

  // campaign_recipients has no shop_id — resolve this shop's campaign ids first.
  let campaignIds: string[] = []
  try {
    const { data: camps } = await admin.from('campaigns').select('id').eq('shop_id', shopId)
    campaignIds = (camps || []).map((c: any) => c.id)
  } catch (err) {
    report.errors.push(`campaign id lookup: ${(err as Error).message}`)
  }

  for (const [table, col] of SHOP_TABLES) {
    try {
      if (opts.dryRun) {
        let count = 0
        if (table === 'campaign_recipients') {
          if (campaignIds.length > 0) {
            const { count: c } = await admin.from(table).select('id', { count: 'exact', head: true }).in('campaign_id', campaignIds)
            count = c || 0
          }
        } else {
          const { count: c } = await admin.from(table).select('id', { count: 'exact', head: true }).eq(col, shopId)
          count = c || 0
        }
        report.deleted[table] = count
        continue
      }
      if (table === 'campaign_recipients') {
        if (campaignIds.length > 0) {
          const { error, count } = await admin.from(table).delete({ count: 'exact' }).in('campaign_id', campaignIds)
          if (error) throw new Error(error.message)
          report.deleted[table] = count || 0
        } else {
          report.deleted[table] = 0
        }
        continue
      }
      const { error, count } = await admin.from(table).delete({ count: 'exact' }).eq(col, shopId)
      if (error) throw new Error(error.message)
      report.deleted[table] = count || 0
    } catch (err) {
      const msg = `${table}: ${(err as Error).message}`
      report.errors.push(msg)
      logger.error('shop_deletion_table_failed', { shopId, table, message: (err as Error).message })
    }
  }

  // Clients: only delete rows orphaned by this shop's removal — no remaining
  // appointments anywhere and no other shop memberships.
  try {
    let orphaned = 0
    for (const clientId of candidateClientIds) {
      const { count: appts } = await admin.from('appointments').select('id', { count: 'exact', head: true }).eq('client_id', clientId)
      const { count: memberships } = await admin.from('client_shop_memberships').select('client_id', { count: 'exact', head: true }).eq('client_id', clientId)
      if ((appts || 0) === 0 && (memberships || 0) === 0) {
        if (!opts.dryRun) {
          const { error } = await admin.from('clients').delete().eq('id', clientId)
          if (error) {
            report.errors.push(`clients:${clientId}: ${error.message}`)
            continue
          }
        }
        orphaned++
      }
    }
    report.deleted['clients_orphaned'] = orphaned
  } catch (err) {
    report.errors.push(`clients: ${(err as Error).message}`)
  }

  // Storage: delete per-shop prefixes (consent-signed excluded — legal hold).
  for (const bucket of STORAGE_PREFIX_BUCKETS) {
    try {
      const { data: objects, error: listErr } = await admin.storage.from(bucket).list(shopId, { limit: 1000 })
      if (listErr) throw new Error(listErr.message)
      const paths = (objects || []).map((o: any) => `${shopId}/${o.name}`)
      if (paths.length === 0) {
        report.storageDeleted[bucket] = 0
        continue
      }
      if (opts.dryRun) {
        report.storageDeleted[bucket] = paths.length
        continue
      }
      const { error: delErr } = await admin.storage.from(bucket).remove(paths)
      if (delErr) throw new Error(delErr.message)
      report.storageDeleted[bucket] = paths.length
    } catch (err) {
      report.errors.push(`storage:${bucket}: ${(err as Error).message}`)
    }
  }

  // Tombstone the shop row (keeps an audit record that deletion happened).
  if (!opts.dryRun && report.errors.length === 0) {
    const { error } = await admin
      .from('shops')
      .update({ deleted_at: new Date().toISOString(), name: 'Deleted shop' })
      .eq('id', shopId)
    if (error) report.errors.push(`shops tombstone: ${error.message}`)
  }

  logger.info('shop_deletion', {
    shopId,
    reason: opts.reason,
    dryRun: opts.dryRun,
    tablesDeleted: Object.keys(report.deleted).length,
    errors: report.errors.length,
  })
  return report
}
