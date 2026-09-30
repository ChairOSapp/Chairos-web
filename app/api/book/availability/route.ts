import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { computeAvailableSlots, timeStrToMinutes, dateIsBeyondHorizon, type BlockedInterval, type DayHours } from '@/lib/availability'
import { resolveTimeZone, nowWallClock, todayInTimeZone } from '@/lib/wallclock'

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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })
  }

  // Booking rules, enforced the same way here and in /api/book/create:
  // past slots must never be offered, and nothing inside the shop's
  // minimum-advance window either ("book at least X ahead"). Evaluated in
  // the customer's timezone (sent by the page; they're overwhelmingly
  // local to the shop), falling back to UTC. Past dates return no slots
  // at all; dates past the booking horizon return the 'too_far' reason.
  const tz = resolveTimeZone(req.nextUrl.searchParams.get('tz'))
  const todayStr = todayInTimeZone(tz)
  if (date < todayStr) {
    return NextResponse.json({ slots: [] })
  }

  const { data: shop } = await supabase
    .from('shops')
    .select('id, hours, min_advance_minutes, max_advance_days, slot_interval_minutes')
    .eq('shop_code', shopCode)
    .maybeSingle()
  if (!shop) {
    return NextResponse.json({ error: 'Shop not found' }, { status: 404 })
  }

  const minAdvanceMin = shop.min_advance_minutes ?? 120
  const maxAdvanceDays = shop.max_advance_days ?? 90
  const slotIntervalMin = shop.slot_interval_minutes ?? 30

  if (dateIsBeyondHorizon(date, todayStr, maxAdvanceDays)) {
    return NextResponse.json({ slots: [], reason: 'too_far', maxAdvanceDays })
  }

  // One-off closure (vacation, holiday, sick day) overrides the weekly plan.
  const { data: exception } = await supabase
    .from('shop_date_exceptions')
    .select('id, note')
    .eq('shop_id', shop.id)
    .eq('date', date)
    .eq('is_closed', true)
    .maybeSingle()
  if (exception) {
    return NextResponse.json({ slots: [], reason: 'closed', note: exception.note ?? null })
  }

  /** 'YYYY-MM-DDTHH:MM:SS' wall clock + N minutes, same format back. */
  const addMinutesToWall = (wall: string, mins: number): string => {
    const [d, t] = wall.split('T')
    const [y, mo, da] = d.split('-').map(Number)
    const [h, mi, s] = t.split(':').map(Number)
    const dt = new Date(y, mo - 1, da, h, mi + mins, s || 0)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`
  }
  const cutoffWall = addMinutesToWall(nowWallClock(tz), minAdvanceMin)
  const dropTooSoonSlots = (slots: string[]): string[] =>
    slots.filter((s) => {
      const mins = timeStrToMinutes(s)
      const hh = String(Math.floor(mins / 60)).padStart(2, '0')
      const mm = String(mins % 60).padStart(2, '0')
      return `${date}T${hh}:${mm}:00` > cutoffWall
    })

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

  // Why a day can have no bookable slots, so the booking page can say the
  // right thing: 'closed' (rest day or one-off closure), 'no_hours'
  // (owner never set hours -- booking is broken until they do), 'full'
  // (open but fully booked). 'too_far' is returned earlier, before this
  // point, when the date is past the shop's booking horizon.
  const hoursConfigured = Array.isArray(shop.hours) && (shop.hours as any[]).some(h => h?.open)
  const emptyReason = !hoursForDay || !hoursForDay.open
    ? (hoursConfigured ? 'closed' : 'no_hours')
    : 'full'

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
        slotIntervalMin,
      })
      return NextResponse.json({ slots: dropTooSoonSlots(slots), reason: slots.length > 0 ? null : emptyReason })
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
      slotIntervalMin,
    })
    slots.forEach(s => slotSet.add(s))
  }

  // Order matches earliest-to-latest within the day rather than insertion order.
  const ordered = Array.from(slotSet).sort((a, b) => timeStrToMinutes(a) - timeStrToMinutes(b))

  return NextResponse.json({ slots: dropTooSoonSlots(ordered), reason: ordered.length > 0 ? null : emptyReason })
}
