import type { SupabaseClient } from '@supabase/supabase-js'
import { computeAvailableSlots, timeStrToMinutes, type BlockedInterval, type DayHours } from '@/lib/availability'
import { normalizeWaitlistPhone } from '@/lib/waitlistNotify'

// Fill Ahead: the forward-looking sibling of the waitlist Refill.
//
// The Refill fills a chair when an appointment cancels. Fill Ahead fills
// chairs that were never booked: for a target day (usually tomorrow) it
// finds each barber's open slots, matches them to clients who are due for
// their usual service with that barber, and (via the send route) offers
// the slot by text through the exact same waitlist claim machinery the
// Refill uses -- an appointment_waitlist row, a 30-minute exclusive claim
// window, reply YES to book, cascade to the next candidate on expiry.
//
// This module is the read-only planner: it never writes and never sends.
// The send route re-runs the plan at send time (availability may have
// moved since the preview) and performs the writes.

export interface FillAheadCandidate {
  clientId: string
  clientName: string
  clientPhone: string // as stored on the client record; normalized at insert time
  daysSinceVisit: number
}

export interface FillAheadOffer {
  barberId: string
  barberName: string
  serviceId: string
  serviceName: string
  price: number | null
  date: string // YYYY-MM-DD
  time: string // HH:MM, 24h
  timeDisplay: string // "2:00 PM"
  candidates: FillAheadCandidate[] // ranked; [0] is offered first, the rest are claim-cascade backups
}

export interface FillAheadPlan {
  date: string
  offers: FillAheadOffer[]
  totalValue: number
}

// A client is "due" when their last completed visit was 3 weeks to 4
// months ago: inside 3 weeks they are not due yet, beyond 4 months the
// lapse win-back job owns them (it texts on its own cadence and this
// should not double-text the same people with a different pitch).
const DUE_MIN_DAYS = 21
const DUE_MAX_DAYS = 120
const HISTORY_DAYS = 200

const MAX_OFFERS_PER_BARBER = 3
const MAX_OFFERS_PER_SHOP = 10
const MAX_CANDIDATES_PER_OFFER = 3

// "Prime" hours get first pick of a barber's open slots; slots outside
// the window are still offered when nothing prime is open.
const PRIME_START_MIN = 10 * 60
const PRIME_END_MIN = 16 * 60

const NON_BLOCKING_STATUSES = ['cancelled', 'noshow']
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

interface Svc {
  id: string
  name: string
  price: number | null
  duration_minutes: number
  buffer_before_minutes: number | null
  buffer_after_minutes: number | null
}

function daysBetween(fromDate: string, toDate: string): number {
  const ms = Date.parse(`${toDate}T12:00:00`) - Date.parse(`${fromDate}T12:00:00`)
  return Math.round(ms / 86_400_000)
}

function minutesTo24h(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export async function planFillAhead(
  admin: SupabaseClient,
  shopId: string,
  dateStr: string,
  todayStr: string,
): Promise<FillAheadPlan> {
  const empty: FillAheadPlan = { date: dateStr, offers: [], totalValue: 0 }
  if (dateStr < todayStr) return empty

  const { data: shop } = await admin
    .from('shops')
    .select('id, name, hours')
    .eq('id', shopId)
    .maybeSingle()
  if (!shop) return empty

  const dayName = DAY_NAMES[new Date(`${dateStr}T12:00:00`).getDay()]
  const dayHours = ((shop.hours as unknown as DayHours[] | null) || []).find(h => (h as DayHours & { day?: string }).day === dayName) as DayHours | undefined
  if (!dayHours || !dayHours.open) return empty

  const [{ data: barberRows }, { data: serviceRows }] = await Promise.all([
    admin.from('shop_barbers').select('barber_id, barber_name, alias').eq('shop_id', shopId).eq('active', true),
    admin.from('services').select('id, name, price, duration_minutes, buffer_before_minutes, buffer_after_minutes').eq('shop_id', shopId).eq('active', true),
  ])
  const barbers = (barberRows || []).filter(b => b.barber_id) as { barber_id: string; barber_name: string | null; alias: string | null }[]
  const services = (serviceRows || []) as unknown as Svc[]
  if (barbers.length === 0 || services.length === 0) return empty
  const serviceByName = new Map(services.map(s => [s.name, s]))

  // Blocked intervals per barber for the target day.
  const { data: dayAppts } = await admin
    .from('appointments')
    .select('barber_id, time, status, services(duration_minutes, buffer_before_minutes, buffer_after_minutes)')
    .eq('shop_id', shopId)
    .eq('date', dateStr)
  const blockedByBarber = new Map<string, BlockedInterval[]>()
  for (const b of barbers) blockedByBarber.set(b.barber_id, [])
  for (const appt of dayAppts || []) {
    if (!appt.barber_id || NON_BLOCKING_STATUSES.includes(appt.status)) continue
    const svc = (appt as unknown as { services: { duration_minutes: number | null; buffer_before_minutes: number | null; buffer_after_minutes: number | null } | null }).services
    const startMin = timeStrToMinutes(String(appt.time).slice(0, 5))
    blockedByBarber.get(appt.barber_id)?.push({
      startMin,
      endMin: startMin + (svc?.duration_minutes ?? 30),
      bufferBeforeMin: svc?.buffer_before_minutes ?? 0,
      bufferAfterMin: svc?.buffer_after_minutes ?? 0,
    })
  }

  // Per-client history from completed visits (same derivation the lapse
  // job uses: most recent done appointment wins for barber + service).
  const historyStart = new Date(Date.parse(`${todayStr}T12:00:00`) - HISTORY_DAYS * 86_400_000).toISOString().slice(0, 10)
  type HistAppt = { client_id: string | null; client_name: string; barber_id: string | null; date: string; services: { name: string } | null }
  const history: HistAppt[] = []
  {
    const PAGE = 1000
    for (let from = 0; ; from += PAGE) {
      const { data: page } = await admin
        .from('appointments')
        .select('client_id, client_name, barber_id, date, services(name)')
        .eq('shop_id', shopId)
        .eq('status', 'done')
        .gte('date', historyStart)
        .lte('date', todayStr)
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1)
      const rows = (page ?? []) as unknown as HistAppt[]
      history.push(...rows)
      if (rows.length < PAGE) break
    }
  }

  interface LastVisit { clientName: string; barberId: string | null; serviceName: string | null; date: string }
  const lastVisitByClient = new Map<string, LastVisit>()
  for (const appt of history) {
    if (!appt.client_id) continue
    const existing = lastVisitByClient.get(appt.client_id)
    if (!existing || appt.date > existing.date) {
      lastVisitByClient.set(appt.client_id, {
        clientName: appt.client_name,
        barberId: appt.barber_id,
        serviceName: appt.services?.name ?? null,
        date: appt.date,
      })
    }
  }

  // Clients who already have something booked ahead are not due a pitch.
  const { data: futureAppts } = await admin
    .from('appointments')
    .select('client_id')
    .eq('shop_id', shopId)
    .gte('date', todayStr)
    .not('status', 'in', `(${NON_BLOCKING_STATUSES.join(',')},done)`)
    .not('client_id', 'is', null)
  const alreadyBooked = new Set((futureAppts || []).map(a => a.client_id as string))

  // Clients already holding a live waitlist row for the target day (a
  // Refill offer in flight, or a Fill Ahead offer from an earlier send)
  // are not pitched twice in one day.
  const { data: liveWaitlist } = await admin
    .from('appointment_waitlist')
    .select('client_id')
    .eq('shop_id', shopId)
    .eq('desired_date', dateStr)
    .in('status', ['waiting', 'notified'])
    .not('client_id', 'is', null)
  const alreadyInPlay = new Set((liveWaitlist || []).map(w => w.client_id as string))

  // Consent + phone from the client record itself.
  const candidateIds = [...lastVisitByClient.keys()]
  const clientInfo = new Map<string, { phone: string | null; sms_consent: boolean | null }>()
  if (candidateIds.length > 0) {
    const { data: clientRows } = await admin
      .from('clients')
      .select('id, phone, sms_consent')
      .in('id', candidateIds)
    for (const c of clientRows || []) clientInfo.set(c.id, { phone: c.phone, sms_consent: c.sms_consent })
  }

  const offers: FillAheadOffer[] = []

  for (const barber of barbers) {
    if (offers.length >= MAX_OFFERS_PER_SHOP) break

    // This barber's due clients, most overdue first.
    const due: { candidate: FillAheadCandidate; service: Svc }[] = []
    for (const [clientId, last] of lastVisitByClient) {
      if (last.barberId !== barber.barber_id) continue
      if (alreadyBooked.has(clientId) || alreadyInPlay.has(clientId)) continue
      const days = daysBetween(last.date, todayStr)
      if (days < DUE_MIN_DAYS || days > DUE_MAX_DAYS) continue
      const service = last.serviceName ? serviceByName.get(last.serviceName) : undefined
      if (!service) continue
      const info = clientInfo.get(clientId)
      if (!info?.sms_consent || !info.phone) continue
      if (!normalizeWaitlistPhone(info.phone)) continue
      due.push({
        candidate: { clientId, clientName: last.clientName, clientPhone: info.phone, daysSinceVisit: days },
        service,
      })
    }
    due.sort((a, b) => b.candidate.daysSinceVisit - a.candidate.daysSinceVisit)
    if (due.length === 0) continue

    const taken: BlockedInterval[] = [...(blockedByBarber.get(barber.barber_id) || [])]
    const usedClients = new Set<string>()
    let barberOffers = 0

    for (const lead of due) {
      if (barberOffers >= MAX_OFFERS_PER_BARBER || offers.length >= MAX_OFFERS_PER_SHOP) break
      if (usedClients.has(lead.candidate.clientId)) continue
      const svc = lead.service
      const slotDisplays = computeAvailableSlots({
        dayHours,
        existing: taken,
        serviceDurationMin: svc.duration_minutes,
        serviceBufferBeforeMin: svc.buffer_before_minutes ?? 0,
        serviceBufferAfterMin: svc.buffer_after_minutes ?? 0,
      })
      if (slotDisplays.length === 0) continue
      const slotMins = slotDisplays.map(d => timeStrToMinutes(d))
      const chosenMin = slotMins.find(m => m >= PRIME_START_MIN && m < PRIME_END_MIN) ?? slotMins[0]

      // Backups for the claim cascade: the next due clients for this same
      // barber + service (the claim matcher keys on service, so a backup
      // with a different usual service could never be offered this slot).
      const group = due.filter(d => d.service.id === svc.id && !usedClients.has(d.candidate.clientId))
        .slice(0, MAX_CANDIDATES_PER_OFFER)
      if (group.length === 0) continue
      for (const g of group) usedClients.add(g.candidate.clientId)

      offers.push({
        barberId: barber.barber_id,
        barberName: barber.barber_name || barber.alias || 'Staff',
        serviceId: svc.id,
        serviceName: svc.name,
        price: svc.price,
        date: dateStr,
        time: minutesTo24h(chosenMin),
        timeDisplay: slotDisplays[slotMins.indexOf(chosenMin)],
        candidates: group.map(g => g.candidate),
      })
      taken.push({
        startMin: chosenMin,
        endMin: chosenMin + svc.duration_minutes,
        bufferBeforeMin: svc.buffer_before_minutes ?? 0,
        bufferAfterMin: svc.buffer_after_minutes ?? 0,
      })
      barberOffers++
    }
  }

  return {
    date: dateStr,
    offers,
    totalValue: offers.reduce((sum, o) => sum + (o.price ?? 0), 0),
  }
}
