import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { computeAvailableSlots, timeStrToMinutes, type BlockedInterval, type DayHours } from '@/lib/availability'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const NON_BLOCKING_STATUSES = ['cancelled']

// Today's open slots per staff member for the kiosk lobby display. There's
// no service selected yet at this point (a walk-in hasn't chosen one), so
// slots are computed against the shop's shortest active service -- the
// most optimistic real duration+buffers any actual booking could use --
// rather than an arbitrary constant, so the "real availability engine"
// (buffers included) still drives what counts as open.
export async function GET(req: NextRequest) {
  const shopCode = req.nextUrl.searchParams.get('shopCode')?.toUpperCase()
  if (!shopCode) {
    return NextResponse.json({ error: 'shopCode is required' }, { status: 400 })
  }

  const { data: shop } = await supabase
    .from('shops')
    .select('id, hours')
    .eq('shop_code', shopCode)
    .maybeSingle()
  if (!shop) {
    return NextResponse.json({ error: 'Shop not found' }, { status: 404 })
  }

  const { data: barbers } = await supabase
    .from('shop_barbers')
    .select('barber_id, barber_name, alias')
    .eq('shop_id', shop.id)
    .eq('active', true)
  const staffList = (barbers || []).filter(b => b.barber_id)

  const { data: services } = await supabase
    .from('services')
    .select('name, duration_minutes, buffer_before_minutes, buffer_after_minutes')
    .eq('shop_id', shop.id)
    .eq('active', true)
    .order('duration_minutes', { ascending: true })
    .limit(1)
  const referenceService = services?.[0] || { name: null, duration_minutes: 15, buffer_before_minutes: 0, buffer_after_minutes: 0 }

  const now = new Date()
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const dayName = DAY_NAMES[now.getDay()]
  const hoursForDay = ((shop.hours as any[]) || []).find(h => h.day === dayName) as DayHours | undefined

  if (staffList.length === 0) {
    return NextResponse.json({ date, referenceService: { name: referenceService.name, durationMinutes: referenceService.duration_minutes }, staff: [] })
  }

  const barberIds = staffList.map(b => b.barber_id as string)
  const { data: existingAppts } = await supabase
    .from('appointments')
    .select('barber_id, time, status, services(duration_minutes, buffer_before_minutes, buffer_after_minutes)')
    .eq('shop_id', shop.id)
    .eq('date', date)
    .in('barber_id', barberIds)

  const byBarber = new Map<string, BlockedInterval[]>()
  for (const id of barberIds) byBarber.set(id, [])
  for (const appt of existingAppts || []) {
    if (!appt.barber_id || NON_BLOCKING_STATUSES.includes(appt.status)) continue
    const svc = (appt as any).services
    const duration = svc?.duration_minutes ?? 30
    const bufferBefore = svc?.buffer_before_minutes ?? 0
    const bufferAfter = svc?.buffer_after_minutes ?? 0
    const startMin = timeStrToMinutes(appt.time.slice(0, 5))
    byBarber.get(appt.barber_id)?.push({ startMin, endMin: startMin + duration, bufferBeforeMin: bufferBefore, bufferAfterMin: bufferAfter })
  }

  const staff = staffList.map(b => ({
    barberId: b.barber_id as string,
    name: b.barber_name || b.alias || 'Staff',
    slots: computeAvailableSlots({
      dayHours: hoursForDay,
      existing: byBarber.get(b.barber_id as string) || [],
      serviceDurationMin: referenceService.duration_minutes,
      serviceBufferBeforeMin: referenceService.buffer_before_minutes,
      serviceBufferAfterMin: referenceService.buffer_after_minutes,
    }),
  }))

  return NextResponse.json({
    date,
    referenceService: { name: referenceService.name, durationMinutes: referenceService.duration_minutes },
    staff,
  })
}
