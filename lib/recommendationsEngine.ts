import { SupabaseClient } from '@supabase/supabase-js'

type Recommendation = {
  shop_id: string
  type: 'underbooked_service' | 'staffing_imbalance' | 'pricing_signal'
  title: string
  detail: string
  evidence: Record<string, unknown>
}

const PERIOD_DAYS = 14
const DAY_MS = 86400000

function minutesBetween(from: string, to: string): number {
  const [fh, fm] = from.split(':').map(Number)
  const [th, tm] = to.split(':').map(Number)
  return (th * 60 + tm) - (fh * 60 + fm)
}

function weeklyOpenMinutes(hours: any[]): number {
  if (!Array.isArray(hours)) return 0
  return hours.reduce((sum, h) => {
    if (!h?.open || !h.from || !h.to) return sum
    const mins = minutesBetween(h.from, h.to)
    return sum + (mins > 0 ? mins : 0)
  }, 0)
}

// Computes fresh recommendations for one shop from real, current data.
// Pure read — callers decide how/whether to persist the result.
export async function computeRecommendations(admin: SupabaseClient, shopId: string): Promise<Recommendation[]> {
  const recs: Recommendation[] = []
  const today = new Date()
  const periodStart = new Date(today.getTime() - PERIOD_DAYS * DAY_MS)
  const periodStartStr = periodStart.toISOString().split('T')[0]

  const [{ data: shop }, { data: services }, { data: staff }, { data: appts }] = await Promise.all([
    admin.from('shops').select('id, hours').eq('id', shopId).maybeSingle(),
    admin.from('services').select('id, name, price, duration_minutes').eq('shop_id', shopId).eq('active', true),
    admin.from('shop_barbers').select('barber_id, barber_name, alias').eq('shop_id', shopId).eq('active', true),
    admin.from('appointments')
      .select('id, barber_id, service_id, price, status, date')
      .eq('shop_id', shopId)
      .gte('date', periodStartStr)
      .in('status', ['done', 'completed']),
  ])

  if (!shop) return []
  const serviceList = services ?? []
  const staffList = staff ?? []
  const apptList = appts ?? []
  const serviceById = Object.fromEntries(serviceList.map(s => [s.id, s]))
  const staffName = (barberId: string) => {
    const s = staffList.find(b => b.barber_id === barberId)
    return s?.barber_name || s?.alias || null
  }

  // --- Underbooked services ---
  if (serviceList.length >= 2) {
    const countByService: Record<string, number> = {}
    for (const a of apptList) {
      if (a.service_id) countByService[a.service_id] = (countByService[a.service_id] ?? 0) + 1
    }
    const totalBookings = apptList.filter(a => a.service_id).length
    const avgBookings = totalBookings / serviceList.length

    if (avgBookings >= 3) {
      for (const svc of serviceList) {
        const count = countByService[svc.id] ?? 0
        if (count <= avgBookings * 0.4) {
          recs.push({
            shop_id: shopId,
            type: 'underbooked_service',
            title: `"${svc.name}" is underbooked`,
            detail: `${svc.name} was booked ${count} time${count === 1 ? '' : 's'} in the last ${PERIOD_DAYS} days, versus a shop average of ${avgBookings.toFixed(1)} bookings per service. Consider promoting it or checking if it's easy for clients to find.`,
            evidence: { service_name: svc.name, booking_count: count, shop_average_bookings: Math.round(avgBookings * 10) / 10, period_days: PERIOD_DAYS },
          })
        }
      }
    }
  }

  // --- Staffing imbalance ---
  if (staffList.length >= 2) {
    const weeklyMinutes = weeklyOpenMinutes(shop.hours)
    const capacityMinutes = weeklyMinutes * (PERIOD_DAYS / 7)

    if (capacityMinutes > 0) {
      const bookedMinutesByStaff: Record<string, number> = {}
      for (const a of apptList) {
        if (!a.barber_id || !a.service_id) continue
        const duration = serviceById[a.service_id]?.duration_minutes ?? 0
        bookedMinutesByStaff[a.barber_id] = (bookedMinutesByStaff[a.barber_id] ?? 0) + duration
      }

      const loads = staffList.map(b => ({
        barberId: b.barber_id,
        name: b.barber_name || b.alias || 'Staff member',
        loadPct: Math.round(((bookedMinutesByStaff[b.barber_id] ?? 0) / capacityMinutes) * 100),
      })).sort((a, b) => b.loadPct - a.loadPct)

      const busiest = loads[0]
      const quietest = loads[loads.length - 1]

      if (busiest && quietest && busiest.barberId !== quietest.barberId && (busiest.loadPct - quietest.loadPct) >= 30) {
        recs.push({
          shop_id: shopId,
          type: 'staffing_imbalance',
          title: `${busiest.name} is booked heavier than ${quietest.name}`,
          detail: `Over the last ${PERIOD_DAYS} days, ${busiest.name} used ${busiest.loadPct}% of available chair time versus ${quietest.loadPct}% for ${quietest.name}. Consider shifting new bookings toward ${quietest.name} or reviewing ${busiest.name}'s schedule for overbooking risk.`,
          evidence: { busiest: { name: busiest.name, load_pct: busiest.loadPct }, quietest: { name: quietest.name, load_pct: quietest.loadPct }, period_days: PERIOD_DAYS },
        })
      }
    }
  }

  // --- Pricing signals: only when there's real comparable-service data ---
  // Exclude $0 services — those are intentionally free (e.g. consultations),
  // not underpriced, so comparing them against paid services is meaningless.
  const pricedServices = serviceList.filter(s => s.price != null && Number(s.price) > 0 && s.duration_minutes != null)
  for (const svc of pricedServices) {
    const comparable = pricedServices.filter(s =>
      s.id !== svc.id && Math.abs((s.duration_minutes ?? 0) - (svc.duration_minutes ?? 0)) <= 15
    )
    if (comparable.length < 2) continue
    const avgComparablePrice = comparable.reduce((s, c) => s + Number(c.price), 0) / comparable.length
    if (avgComparablePrice > 0 && Number(svc.price) <= avgComparablePrice * 0.7) {
      recs.push({
        shop_id: shopId,
        type: 'pricing_signal',
        title: `"${svc.name}" is priced below similar services`,
        detail: `${svc.name} is $${Number(svc.price).toFixed(2)} (${svc.duration_minutes} min), while ${comparable.length} other service${comparable.length === 1 ? '' : 's'} of similar length average $${avgComparablePrice.toFixed(2)}. Worth checking whether this is intentional.`,
        evidence: {
          service_name: svc.name,
          price: Number(svc.price),
          duration_minutes: svc.duration_minutes,
          comparable_services: comparable.map(c => ({ name: c.name, price: Number(c.price), duration_minutes: c.duration_minutes })),
          comparable_avg_price: Math.round(avgComparablePrice * 100) / 100,
        },
      })
    }
  }

  return recs
}
