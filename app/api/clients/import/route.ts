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

/** Owner or staff of the shop may import. */
async function canManageShop(admin: ReturnType<typeof getAdmin>, userId: string, shopId: string) {
  const [{ data: shop }, { data: staff }] = await Promise.all([
    admin.from('shops').select('id').eq('id', shopId).eq('owner_id', userId).maybeSingle(),
    admin.from('shop_barbers').select('id').eq('shop_id', shopId).eq('barber_id', userId).maybeSingle(),
  ])
  return !!(shop || staff)
}

const normPhone = (p: string) => (p || '').replace(/\D/g, '')

interface ImportRow {
  name?: string
  phone?: string
  email?: string
  notes?: string
}

/**
 * POST /api/clients/import
 * { shopId, rows: [{name, phone, email, notes}], dryRun?, filename? }
 * dryRun=true returns counts without writing. Otherwise imports with
 * dedupe by phone/email, links every client to the shop via
 * client_shop_memberships, and logs the run to client_imports.
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
  const clean = rows
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

  for (const row of clean) {
    try {
      // Dedupe: existing client by phone (preferred) then email.
      let existingId: string | null = null
      if (row.phone) {
        const { data } = await admin
          .rpc('find_client_for_booking', { p_phone: row.phone, p_shop_id: shopId })
        existingId = (data as any[])?.[0]?.client_id ?? null
      }
      if (!existingId && row.email) {
        const { data } = await admin
          .from('clients')
          .select('id')
          .ilike('email', row.email)
          .limit(1)
          .maybeSingle()
        existingId = (data as any)?.id ?? null
      }

      if (existingId) {
        duplicates++
        if (!dryRun) {
          // Link to this shop; fill in blanks only, never overwrite.
          await admin.from('client_shop_memberships').upsert(
            { client_id: existingId, shop_id: shopId },
            { onConflict: 'client_id,shop_id', ignoreDuplicates: true }
          )
          const patch: Record<string, string | null> = {}
          if (row.name) {
            const { data: cur } = await admin.from('clients').select('full_name, phone, email').eq('id', existingId).maybeSingle()
            if (cur && !cur.full_name) patch.full_name = row.name
            if (cur && !cur.phone && row.phone) patch.phone = row.phone
            if (cur && !cur.email && row.email) patch.email = row.email
            if (Object.keys(patch).length) await admin.from('clients').update(patch).eq('id', existingId)
          }
        }
        continue
      }

      if (dryRun) { imported++; continue }

      const newId = crypto.randomUUID()
      const { error: insErr } = await admin.from('clients').insert({
        id: newId,
        full_name: row.name,
        phone: row.phone || null,
        email: row.email,
        source: 'csv_import',
      })
      if (insErr) throw insErr
      await admin.from('client_shop_memberships').upsert(
        { client_id: newId, shop_id: shopId },
        { onConflict: 'client_id,shop_id', ignoreDuplicates: true }
      )
      if (row.notes) {
        await admin.from('client_notes').insert({
          client_id: newId,
          shop_id: shopId,
          author_id: userId,
          body: row.notes,
        }).then(() => {}, () => {})
      }
      imported++
    } catch (e: any) {
      errors++
      if (errorSamples.length < 3) errorSamples.push(e?.message || 'Unknown error')
    }
  }

  if (!dryRun) {
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
