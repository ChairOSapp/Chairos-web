import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { readPortalSession } from '@/lib/portalSession'
import { resolvePortalClient } from '@/lib/portalData'
import { computeAvailableSlots, timeStrToMinutes, type DayHours } from '@/lib/availability'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const SCAN_DAYS_AHEAD = 21

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + days)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// One-tap rebook: same service, same staff (if one was assigned), first
// open slot starting tomorrow -- scans forward day by day using the same
// buffer-aware availability logic as the public booking page rather than
// just re-picking the original weekday/time blind.
export async function POST(req: NextRequest) {
  const session = readPortalSession(req)
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { appointmentId } = await req.json()
  if (!appointmentId) return NextResponse.json({ error: 'appointmentId is required' }, { status: 400 })

  const admin = getAdmin()
  const portalClient = await resolvePortalClient(admin, session.phone)
  if (!portalClient) return NextResponse.json({ error: 'No client record found' }, { status: 404 })

  // Verifies ownership -- the referenced appointment must actually belong
  // to this session's client, not just any appointment id the caller sends.
  const { data: original } = await admin
    .from('appointments')
    .select('id, shop_id, barber_id, service_id, client_id')
    .eq('id', appointmentId)
    .eq('client_id', portalClient.clientId)
    .maybeSingle()
  if (!original) return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })

  const [{ data: shop }, { data: service }] = await Promise.all([
    admin.from('shops').select('id, name, owner_id, hours').eq('id', original.shop_id).maybeSingle(),
    admin.from('services').select('id, name, price, duration_minutes, buffer_before_minutes, buffer_after_minutes, active').eq('id', original.service_id).maybeSingle(),
  ])
  if (!shop || !service || !service.active) {
    return NextResponse.json({ error: 'That service is no longer available to book' }, { status: 400 })
  }

  let barberIds: string[]
  if (original.barber_id) {
    barberIds = [original.barber_id]
  } else {
    const { data: barbers } = await admin.from('shop_barbers').select('barber_id').eq('shop_id', shop.id).eq('active', true)
    barberIds = (barbers || []).map(b => b.barber_id).filter(Boolean)
  }

  let foundDate: string | null = null
  let foundTime: string | null = null

  for (let i = 1; i <= SCAN_DAYS_AHEAD && !foundDate; i++) {
    const candidateDate = addDays(new Date().toISOString().split('T')[0], i)
    const dayName = DAY_NAMES[new Date(candidateDate + 'T12:00:00').getDay()]
    const hoursForDay = ((shop.hours as any[]) || []).find(h => h.day === dayName) as DayHours | undefined
    if (!hoursForDay?.open) continue

    const { data: existingAppts } = await admin
      .from('appointments')
      .select('barber_id, time, status, services(duration_minutes, buffer_before_minutes, buffer_after_minutes)')
      .eq('shop_id', shop.id)
      .eq('date', candidateDate)
      .in('barber_id', barberIds.length > 0 ? barberIds : ['00000000-0000-0000-0000-000000000000'])

    for (const barberId of barberIds.length > 0 ? barberIds : [null]) {
      const blocked = (existingAppts || [])
        .filter(a => a.barber_id === barberId && a.status !== 'cancelled')
        .map(a => {
          const svc = (a as any).services
          const start = timeStrToMinutes(a.time.slice(0, 5))
          return { startMin: start, endMin: start + (svc?.duration_minutes ?? 30), bufferBeforeMin: svc?.buffer_before_minutes ?? 0, bufferAfterMin: svc?.buffer_after_minutes ?? 0 }
        })

      const slots = computeAvailableSlots({
        dayHours: hoursForDay,
        existing: blocked,
        serviceDurationMin: service.duration_minutes,
        serviceBufferBeforeMin: service.buffer_before_minutes,
        serviceBufferAfterMin: service.buffer_after_minutes,
      })

      if (slots.length > 0) {
        foundDate = candidateDate
        const [time, period] = slots[0].split(' ')
        const [hours, minutes] = time.split(':')
        let h = parseInt(hours)
        if (period === 'PM' && h !== 12) h += 12
        if (period === 'AM' && h === 12) h = 0
        foundTime = `${h.toString().padStart(2, '0')}:${minutes}:00`
        break
      }
    }
  }

  if (!foundDate || !foundTime) {
    return NextResponse.json({ error: `No open slots in the next ${SCAN_DAYS_AHEAD} days -- try booking directly on the shop's page.` }, { status: 409 })
  }

  const newApptId = randomUUID()
  const { error: insertErr } = await admin.from('appointments').insert({
    id: newApptId,
    shop_id: shop.id,
    barber_id: original.barber_id,
    service_id: service.id,
    client_id: portalClient.clientId,
    client_name: portalClient.fullName || 'Client',
    client_phone: portalClient.phone,
    client_email: portalClient.email,
    date: foundDate,
    time: foundTime,
    price: service.price,
    status: 'pending',
    payment_status: 'unpaid',
    source: 'portal',
  })
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  if (shop.owner_id) {
    await admin.from('notifications').insert({
      user_id: shop.owner_id,
      shop_id: shop.id,
      type: 'booking',
      title: 'New booking',
      body: `${portalClient.fullName || 'A client'} rebooked ${service.name} via the client portal on ${foundDate} at ${foundTime}`,
      read: false,
    })
  }

  return NextResponse.json({
    appointmentId: newApptId,
    shopName: shop.name,
    serviceName: service.name,
    date: foundDate,
    time: foundTime,
  })
}
