import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { computeAvailableSlots, timeStrToMinutes, type BlockedInterval, type DayHours } from '@/lib/availability'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// Appointments in these statuses no longer occupy the slot.
const NON_BLOCKING_STATUSES = ['cancelled']

export async function GET(req: NextRequest) {
  const shopCode = req.nextUrl.searchParams.get('shopCode')?.toUpperCase()
  const date = req.nextUrl.searchParams.get('date')
  const serviceId = req.nextUrl.searchParams.get('serviceId')
  const barberId = req.nextUrl.searchParams.get('barberId') // omitted/empty = any available barber

  if (!shopCode || !date || !serviceId) {
    return NextResponse.json({ error: 'shopCode, date, and serviceId are required' }, { status: 400 })
  }

  const { data: shop } = await supabase
    .from('shops')
    .select('id, hours')
    .eq('shop_code', shopCode)
    .maybeSingle()
  if (!shop) {
    return NextResponse.json({ error: 'Shop not found' }, { status: 404 })
  }

  const { data: service } = await supabase
    .from('services')
    .select('duration_minutes, buffer_before_minutes, buffer_after_minutes')
    .eq('id', serviceId)
    .eq('shop_id', shop.id)
    .maybeSingle()
  if (!service) {
    return NextResponse.json({ error: 'Service not found' }, { status: 404 })
  }

  const dayName = DAY_NAMES[new Date(date + 'T12:00:00').getDay()]
  const hoursForDay = ((shop.hours as any[]) || []).find(h => h.day === dayName) as DayHours | undefined

  let barberIds: string[]
  if (barberId) {
    barberIds = [barberId]
  } else {
    const { data: barbers } = await supabase
      .from('shop_barbers')
      .select('barber_id')
      .eq('shop_id', shop.id)
      .eq('active', true)
    barberIds = (barbers || []).map(b => b.barber_id).filter(Boolean)
    if (barberIds.length === 0) {
      // No staff on record to scope by — fall back to shop-wide availability
      // (no per-staff conflicts to check against).
      const slots = computeAvailableSlots({
        dayHours: hoursForDay,
        existing: [],
        serviceDurationMin: service.duration_minutes,
        serviceBufferBeforeMin: service.buffer_before_minutes,
        serviceBufferAfterMin: service.buffer_after_minutes,
      })
      return NextResponse.json({ slots })
    }
  }

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
    const list = byBarber.get(appt.barber_id)
    if (list) {
      list.push({ startMin, endMin: startMin + duration, bufferBeforeMin: bufferBefore, bufferAfterMin: bufferAfter })
    }
  }

  const slotSet = new Set<string>()
  for (const id of barberIds) {
    const slots = computeAvailableSlots({
      dayHours: hoursForDay,
      existing: byBarber.get(id) || [],
      serviceDurationMin: service.duration_minutes,
      serviceBufferBeforeMin: service.buffer_before_minutes,
      serviceBufferAfterMin: service.buffer_after_minutes,
    })
    slots.forEach(s => slotSet.add(s))
  }

  // Order matches earliest-to-latest within the day rather than insertion order.
  const ordered = Array.from(slotSet).sort((a, b) => timeStrToMinutes(a) - timeStrToMinutes(b))

  return NextResponse.json({ slots: ordered })
}
