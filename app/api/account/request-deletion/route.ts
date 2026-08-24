import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { notifySlack } from '@/lib/slack'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { reason } = await req.json().catch(() => ({ reason: null }))

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle()

  const { error } = await admin.from('account_deletion_requests').insert({
    user_id: user.id,
    email: user.email,
    role: profile?.role ?? null,
    reason: reason || null,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // This is a request, not an automatic delete — an owner's account has
  // cascading data (shop, staff, clients, appointments, billing history)
  // that needs a deliberate, reviewed teardown, not a blind cascade delete
  // triggered by anyone who clicks a button.
  await notifySlack(
    `🗑️ Account deletion requested\nEmail: ${user.email}\nRole: ${profile?.role ?? 'unknown'}\nReason: ${reason || '(none given)'}`,
    'account/request-deletion'
  )

  return NextResponse.json({ ok: true })
}
