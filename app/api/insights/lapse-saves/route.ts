import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function GET() {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll() } }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createAdmin(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    if (profile?.role !== 'owner') return NextResponse.json({ count: 0 })

    const { data: shop } = await admin
      .from('shops')
      .select('id')
      .eq('owner_id', user.id)
      .maybeSingle()

    if (!shop) return NextResponse.json({ count: 0 })

    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)

    const { data, error } = await admin
      .from('lapse_alerts')
      .select('id')
      .eq('shop_id', shop.id)
      .not('resolved_at', 'is', null)
      .gte('resolved_at', monthStart.toISOString())

    if (error) {
      console.error('[lapse-saves]', error.message)
      return NextResponse.json({ count: 0 })
    }

    return NextResponse.json({ count: data?.length ?? 0 })
  } catch (err: any) {
    console.error('[lapse-saves]', err.message)
    return NextResponse.json({ count: 0 })
  }
}
