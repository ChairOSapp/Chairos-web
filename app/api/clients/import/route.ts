import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function getUserId() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

/** Owner or ACTIVE staff of the shop may import — a deactivated
 *  barber's leftover shop_barbers row must not keep write access to
 *  the client book. */
async function canManageShop(admin: ReturnType<typeof getAdmin>, userId: string, shopId: string) {
  const [{ data: shop }, { data: staff }] = await Promise.all([
    admin.from('shops').select('id').eq('id', shopId).eq('owner_id', userId).maybeSingle(),
    admin.from('shop_barbers').select('id').eq('shop_id', shopId).eq('barber_id', userId).eq('active', true).maybeSingle(),
  ])
  return !!(shop || staff)
}

// Normalize to the canonical 10-digit form the rest of the app stores
// (see lib/waitlistNotify): a CSV "+1 904 555 0123" must dedupe against
// the stored "9045550123", not sail past as an 11-digit stranger and
// create a duplicate client.
const normPhone = (p: string) => {
  const digits = (p || '').replace(/\D/g, '')
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
}

interface ImportRow {
  name?: string
  phone?: string
  email?: string
  notes?: string
}

type CleanRow = {
  name: string | null
  phone: string
  email: string | null
  notes: string | null
}

const CHUNK = 500

function chunked<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * POST /api/clients/import
 * { shopId, rows: [{name, phone, email, notes}], dryRun?, filename? }
 * dryRun=true returns counts without writing. Otherwise imports with
 * dedupe by phone/email, links every client to the shop via
 * client_shop_memberships, and logs the run to client_imports.
 *
 * Batched (2026-10-12): this used to run 3–5 sequential round trips PER
 * ROW, so a 5,000-row import meant ~20,000 queries and routinely died
 * on the serverless timeout halfway through — with the first half
 * already committed and no import log at all. The import now resolves
 * duplicates in bulk, classifies every row in memory, and writes in
 * chunks of 500. Semantics are unchanged (same dedupe order, same
 * blank-fill and notes behavior, same counts); where a bulk write
 * fails, that chunk falls back to per-row writes so one bad row is
 * reported as a row error instead of sinking the whole import.
 */
export async function POST(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { shopId, rows, dryRun, filename } = body as {
    shopId?: string
    rows?: ImportRow[]
    dryRun?: boolean
    filename?: string
  }
  if (!shopId || !Array.isArray(rows)) {
    return NextResponse.json({ error: 'shopId and rows are required' }, { status: 400 })
  }
  if (rows.length > 5000) {
    return NextResponse.json({ error: 'Max 5,000 rows per import' }, { status: 400 })
  }

  const admin = getAdmin()
  if (!(await canManageShop(admin, userId, shopId))) {
    return NextResponse.json({ error: 'Not authorized for this shop' }, { status: 403 })
  }

  // Clean rows: need at least a name or a phone/email.
  const clean: CleanRow[] = rows
    .map(r => ({
      name: (r.name || '').trim() || null,
      phone: normPhone(r.phone || ''),
      email: (r.email || '').trim().toLowerCase() || null,
      notes: (r.notes || '').trim() || null,
    }))
    .filter(r => r.name || r.phone || r.email)

  let imported = 0
  let duplicates = 0
  let errors = 0
  const errorSamples: string[] = []
  const noteError = (e: unknown) => {
    errors++
    if (errorSamples.length < 3) {
      errorSamples.push(e instanceof Error ? e.message : 'Unknown error')
    }
  }

  // ---- Phase 1: bulk-resolve duplicates against existing clients ----
  // Phone match is exact against clients.phone (the same match the
  // find_client_for_booking RPC performs), email match is
  // case-insensitive. Read-only: if this phase fails, nothing has been
  // written and the import can simply be retried.
  const phoneToId = new Map<string, string>()
  const emailToId = new Map<string, string>()
  try {
    const phones = [...new Set(clean.map(r => r.phone).filter(Boolean))]
    for (const part of chunked(phones)) {
      const { data, error } = await admin.from('clients').select('id, phone').in('phone', part)
      if (error) throw error
      for (const c of data ?? []) {
        if (c.phone && !phoneToId.has(c.phone)) phoneToId.set(c.phone, c.id)
      }
    }
    const emails = [...new Set(clean.map(r => r.email).filter((e): e is string => !!e))]
    for (const part of chunked(emails)) {
      const { data, error } = await admin.from('clients').select('id, email').in('email', part)
      if (error) throw error
      for (const c of data ?? []) {
        const key = (c.email ?? '').trim().toLowerCase()
        if (key && !emailToId.has(key)) emailToId.set(key, c.id)
      }
    }
    // Faithfulness fallback: stored emails with mixed case miss the
    // exact bulk match above, so rows that are STILL unresolved get
    // the legacy per-row case-insensitive lookup. In practice this is
    // a handful of rows, not the whole file.
    for (const row of clean) {
      if (!row.email) continue
      if (row.phone && phoneToId.has(row.phone)) continue
      if (emailToId.has(row.email)) continue
      const { data } = await admin
        .from('clients')
        .select('id')
        .ilike('email', row.email)
        .limit(1)
        .maybeSingle()
      if (data?.id) emailToId.set(row.email, data.id)
    }
  } catch {
    return NextResponse.json(
      { error: 'Import failed while checking for duplicates. Nothing was imported — please retry.' },
      { status: 500 }
    )
  }

  // ---- Phase 2: classify every row in memory, in file order ----
  // In-file duplicates resolve against clients created earlier in this
  // same run, exactly as the old sequential loop behaved (its inserts
  // were visible to later rows' lookups).
  const inFilePhone = new Map<string, string>()
  const inFileEmail = new Map<string, string>()
  type NewClient = { id: string; full_name: string | null; phone: string | null; email: string | null }
  const newClients: NewClient[] = []
  const newIds = new Set<string>()
  const linkIds: string[] = [] // membership upserts (existing dups + news)
  const dupTargets: string[] = [] // resolved client id per duplicate row, for recounting
  const notesToInsert: { client_id: string; shop_id: string; author_id: string; body: string }[] = []
  const patchByClient = new Map<string, Record<string, string | null>>()
  const existingFields = new Map<string, { full_name: string | null; phone: string | null; email: string | null }>()

  // Current field values for pre-existing clients (blank-fill source of
  // truth). Fetched once, in bulk, for every client a row resolved to.
  if (!dryRun) {
    const resolvedExisting = new Set<string>()
    for (const row of clean) {
      const id = (row.phone && phoneToId.get(row.phone)) || (row.email && emailToId.get(row.email)) || null
      if (id) resolvedExisting.add(id)
    }
    for (const part of chunked([...resolvedExisting])) {
      const { data } = await admin.from('clients').select('id, full_name, phone, email').in('id', part)
      for (const c of data ?? []) {
        existingFields.set(c.id, { full_name: c.full_name, phone: c.phone, email: c.email })
      }
    }
  }

  for (const row of clean) {
    const resolvedId =
      (row.phone && (phoneToId.get(row.phone) ?? inFilePhone.get(row.phone))) ||
      (row.email && (emailToId.get(row.email) ?? inFileEmail.get(row.email))) ||
      null

    if (resolvedId) {
      duplicates++
      dupTargets.push(resolvedId)
      if (!dryRun) {
        linkIds.push(resolvedId)
        // Fill blanks only, never overwrite — applied against a mutable
        // copy so several duplicate rows for one client compose the
        // same way the sequential loop's re-reads did.
        const fresh = newClients.find(c => c.id === resolvedId)
        if (fresh) {
          if (!fresh.full_name && row.name) fresh.full_name = row.name
          if (!fresh.phone && row.phone) fresh.phone = row.phone
          if (!fresh.email && row.email) fresh.email = row.email
        } else {
          const cur = existingFields.get(resolvedId)
          if (cur) {
            const patch = patchByClient.get(resolvedId) ?? {}
            if (!cur.full_name && row.name) { patch.full_name = row.name; cur.full_name = row.name }
            if (!cur.phone && row.phone) { patch.phone = row.phone; cur.phone = row.phone }
            if (!cur.email && row.email) { patch.email = row.email; cur.email = row.email }
            if (Object.keys(patch).length) patchByClient.set(resolvedId, patch)
          }
        }
        if (row.notes) {
          notesToInsert.push({ client_id: resolvedId, shop_id: shopId, author_id: userId, body: row.notes })
        }
      }
      continue
    }

    imported++
    if (!dryRun) {
      const newId = crypto.randomUUID()
      const fresh: NewClient = {
        id: newId,
        full_name: row.name,
        phone: row.phone || null,
        email: row.email,
      }
      newClients.push(fresh)
      newIds.add(newId)
      linkIds.push(newId)
      if (row.phone) inFilePhone.set(row.phone, newId)
      if (row.email) inFileEmail.set(row.email, newId)
      if (row.notes) {
        notesToInsert.push({ client_id: newId, shop_id: shopId, author_id: userId, body: row.notes })
      }
    }
  }

  // ---- Phase 3: write, in chunks ----
  if (!dryRun) {
    const failedNewIds = new Set<string>()

    // 3a. Insert new clients. A failed chunk falls back to per-row
    // inserts so the bad rows become row errors, not a lost import.
    for (const part of chunked(newClients)) {
      const { error } = await admin.from('clients').insert(
        part.map(c => ({ id: c.id, full_name: c.full_name, phone: c.phone, email: c.email, source: 'csv_import' }))
      )
      if (!error) continue
      for (const c of part) {
        const { error: rowErr } = await admin.from('clients').insert({
          id: c.id, full_name: c.full_name, phone: c.phone, email: c.email, source: 'csv_import',
        })
        if (rowErr) {
          failedNewIds.add(c.id)
          imported--
          noteError(rowErr)
        }
      }
    }

    // Rows counted as duplicates of a new client that failed to insert
    // were not imported at all — recount them as errors, and drop any
    // actions aimed at the missing client.
    if (failedNewIds.size > 0) {
      for (const target of dupTargets) {
        if (failedNewIds.has(target)) {
          duplicates--
          errors++
        }
      }
    }
    const liveLinkIds = [...new Set(linkIds)].filter(id => !failedNewIds.has(id))

    // 3b. Membership links. Same chunk-then-per-row fallback; a failed
    // link for a brand-new client removes the client again (an
    // unlinked client is invisible in the shop's list), while a failed
    // link for an existing client just recounts that row as an error.
    for (const part of chunked(liveLinkIds)) {
      const { error } = await admin.from('client_shop_memberships').upsert(
        part.map(id => ({ client_id: id, shop_id: shopId })),
        { onConflict: 'client_id,shop_id', ignoreDuplicates: true }
      )
      if (!error) continue
      for (const id of part) {
        const { error: rowErr } = await admin.from('client_shop_memberships').upsert(
          { client_id: id, shop_id: shopId },
          { onConflict: 'client_id,shop_id', ignoreDuplicates: true }
        )
        if (!rowErr) continue
        if (newIds.has(id)) {
          await admin.from('clients').delete().eq('id', id)
          failedNewIds.add(id)
          imported--
          // Duplicates of this client (later rows in the file) are
          // unimported too.
          for (const target of dupTargets) {
            if (target === id) { duplicates--; errors++ }
          }
        } else {
          // Count each duplicate row that pointed at this client once.
          let affected = 0
          for (const target of dupTargets) if (target === id) affected++
          if (affected > 0) { duplicates -= affected; errors += affected }
        }
        noteError(rowErr)
      }
    }

    // 3c. Blank-fill patches for pre-existing clients (one update per
    // patched client; results intentionally unchecked, as before).
    const patchEntries = [...patchByClient.entries()].filter(([id]) => !failedNewIds.has(id))
    for (const part of chunked(patchEntries, 25)) {
      await Promise.all(part.map(([id, patch]) => admin.from('clients').update(patch).eq('id', id)))
    }

    // 3d. Notes (failures swallowed, as before — notes are
    // supplementary; a lost note must not fail a row).
    const liveNotes = notesToInsert.filter(n => !failedNewIds.has(n.client_id))
    for (const part of chunked(liveNotes)) {
      await admin.from('client_notes').insert(part).then(() => {}, () => {})
    }

    await admin.from('client_imports').insert({
      shop_id: shopId,
      user_id: userId,
      filename: filename || null,
      source: 'csv',
      total_rows: clean.length,
      imported_count: imported,
      duplicate_count: duplicates,
      error_count: errors,
    })
  }

  return NextResponse.json({
    ok: true,
    dryRun: !!dryRun,
    total: clean.length,
    skipped_empty: rows.length - clean.length,
    imported,
    duplicates,
    errors,
    errorSamples,
  })
}
