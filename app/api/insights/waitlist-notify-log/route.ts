import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

// automation_logs is service-role only (same as lapse_alerts), so the
// owner dashboard's waitlist view reads the notify-outcome history --
// including explicitly-logged "skipped, insufficient notice" entries --
// through this route rather than a direct RLS query. Mirrors
// /api/insights/lapse-saves.
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

    const { data: shop } = await admin.from('shops').select('id').eq('owner_id', user.id).maybeSingle()
    if (!shop) return NextResponse.json({ logs: [] })

    const { data, error } = await admin
      .from('automation_logs')
      .select('id, type, payload, result, created_at')
      .in('type', ['appointment_waitlist_notify', 'appointment_waitlist_expired', 'appointment_waitlist_claimed'])
      .eq('payload->>shopId', shop.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error('[waitlist-notify-log]', error.message)
      return NextResponse.json({ logs: [] })
    }

    return NextResponse.json({ logs: data ?? [] })
  } catch (err: any) {
    console.error('[waitlist-notify-log]', err.message)
    return NextResponse.json({ logs: [] })
  }
}
