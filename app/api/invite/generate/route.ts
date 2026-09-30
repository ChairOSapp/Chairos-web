import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { getManagedShop, getShopRole } from '@/lib/shopMembers'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Owners AND admins may invite chairs/barbers. Only owners may manage
  // owner/admin seats (see app/api/shop/members).
  const shop = await getManagedShop(admin, user.id)
  if (!shop) return NextResponse.json({ error: 'No shop found' }, { status: 404 })
  const role = await getShopRole(admin, shop.id, user.id)
  if (!role) {
    return NextResponse.json({ error: 'Owner or admin only' }, { status: 403 })
  }

  const { data: invite, error } = await admin
    .from('shop_invites')
    .insert({ shop_id: shop.id })
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ token: invite.token })
}
