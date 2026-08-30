import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { computeRecommendations } from '@/lib/recommendationsEngine'

export async function POST() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cs) { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Whoever owns the shop can check its recommendations -- a Solo Chair
  // (profiles.role='barber') owns their own shop the same way an owner
  // role does, so this is a shop-ownership check, not a role check.
  const { data: shop } = await admin.from('shops').select('id').eq('owner_id', user.id).maybeSingle()
  if (!shop) return NextResponse.json({ error: 'No shop found' }, { status: 404 })

  const recs = await computeRecommendations(admin, shop.id)

  await admin.from('recommendations').delete().eq('shop_id', shop.id)
  if (recs.length > 0) {
    await admin.from('recommendations').insert(recs.map(r => ({ ...r, status: 'active' })))
  }

  const { data: saved } = await admin
    .from('recommendations')
    .select('*')
    .eq('shop_id', shop.id)
    .order('created_at', { ascending: false })

  return NextResponse.json({ recommendations: saved ?? [] })
}
