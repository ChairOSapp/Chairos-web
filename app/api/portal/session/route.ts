import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { readPortalSession } from '@/lib/portalSession'
import { resolvePortalClient } from '@/lib/portalData'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(req: NextRequest) {
  const session = readPortalSession(req)
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const admin = getAdmin()
  const portalClient = await resolvePortalClient(admin, session.phone)
  // Never expose the raw Square card ID here — sibling portal/cards only
  // exposes brand/last4 (L-A3).
  const { squareCardId: _omitted, ...safeClient } = portalClient as unknown as Record<string, unknown>
  return NextResponse.json({ client: safeClient })
}
