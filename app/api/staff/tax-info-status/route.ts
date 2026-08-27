import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function getRequestUser(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// Existence check only -- deliberately never returns the actual tax info.
// Lets an owner's UI show "this person hasn't filled in their tax info yet"
// without giving the owner a read path into staff_tax_info itself (that
// table has no owner-facing SELECT policy at all; see the migration).
export async function GET(req: NextRequest) {
  const user = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const shopId = req.nextUrl.searchParams.get('shopId')
  const barberId = req.nextUrl.searchParams.get('barberId')
  if (!shopId || !barberId) {
    return NextResponse.json({ error: 'shopId and barberId are required' }, { status: 400 })
  }

  const supabase = getAdminSupabase()

  if (user.id !== barberId) {
    const { data: shop } = await supabase.from('shops').select('owner_id').eq('id', shopId).maybeSingle()
    if (shop?.owner_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const { data: membership } = await supabase
      .from('shop_barbers').select('id').eq('shop_id', shopId).eq('barber_id', barberId).maybeSingle()
    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const { data } = await supabase.from('staff_tax_info').select('id').eq('barber_id', barberId).maybeSingle()
  return NextResponse.json({ hasTaxInfo: !!data })
}
