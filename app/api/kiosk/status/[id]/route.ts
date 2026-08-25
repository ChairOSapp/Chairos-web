import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const admin = getAdmin()

  const { data, error } = await admin.rpc('get_walkin_status', { p_id: id })
  const row = data?.[0]
  if (error || !row) {
    return NextResponse.json({ error: 'Check-in not found' }, { status: 404 })
  }

  return NextResponse.json({
    status: row.status,
    position: row.queue_position,
    shopName: row.shop_name,
  })
}
