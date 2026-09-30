import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { timeStrToMinutes, minutesToDisplayTime } from '@/lib/availability'
import { logger } from '@/lib/logger'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// POST /api/kiosk/appointments/lookup -- anonymous lobby tablet: given a
// phone number, list that number's appointments at this shop for today.
// Returns only today's rows (no history), and the actual check-in still
// requires the OTP code, so a phone number alone can't confirm anything.
export async function POST(req: NextRequest) {
  const admin = getAdmin()
  let body: { shopCode?: string; phone?: string; today?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { shopCode, phone, today } = body
  if (!shopCode || !phone) {
    return NextResponse.json({ error: 'shopCode and phone are required' }, { status: 400 })
  }
  const digits = String(phone).replace(/\D/g, '').slice(-10)
  if (digits.length < 10) {
    return NextResponse.json({ error: 'Enter a valid 10-digit phone number' }, { status: 400 })
  }
  const todayStr =
    today && /^\d{4}-\d{2}-\d{2}$/.test(today)
      ? today
      : (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}` })()

  const { data: shop } = await admin
    .from('shops')
    .select('id')
    .eq('shop_code', String(shopCode).toUpperCase())
    .maybeSingle()
  if (!shop) return NextResponse.json({ error: 'Shop not found' }, { status: 404 })

  const { data: appts, error } = await admin
    .from('appointments')
    .select('id, time, status, client_name, client_phone, barber_id, services(name)')
    .eq('shop_id', shop.id)
    .eq('date', todayStr)
    .not('status', 'eq', 'cancelled')
    .order('time', { ascending: true })
  if (error) {
    logger.error('kiosk_appt_lookup_failed', { shopId: shop.id, message: error.message })
    return NextResponse.json({ error: 'Could not look up appointments right now' }, { status: 500 })
  }

  const matches = (appts || []).filter(a =>
    String(a.client_phone || '').replace(/\D/g, '').slice(-10) === digits
  )
  if (matches.length === 0) {
    return NextResponse.json({ appointments: [] })
  }

  const barberIds = [...new Set(matches.map(a => a.barber_id).filter(Boolean))] as string[]
  let barberNames: Record<string, string> = {}
  if (barberIds.length > 0) {
    const { data: barbers } = await admin
      .from('shop_barbers')
      .select('barber_id, barber_name, alias')
      .in('barber_id', barberIds)
    for (const b of barbers || []) {
      barberNames[b.barber_id as string] = (b.barber_name as string) || (b.alias as string) || 'Staff'
    }
  }

  return NextResponse.json({
    appointments: matches.map(a => ({
      id: a.id,
      time: minutesToDisplayTime(timeStrToMinutes(String(a.time).slice(0, 5))),
      clientName: a.client_name,
      serviceName: (a.services as any)?.name ?? null,
      staffName: (a.barber_id ? barberNames[a.barber_id as string] : null) ?? null,
      status: a.status,
    })),
  })
}
