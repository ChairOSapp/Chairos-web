import { NextResponse } from 'next/server'
import { clearPortalSession } from '@/lib/portalSession'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  clearPortalSession(res)
  return res
}
