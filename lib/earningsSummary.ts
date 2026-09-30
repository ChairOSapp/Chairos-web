import { SupabaseClient } from '@supabase/supabase-js'
import { fromDollars, add, multiply, toCents, toDinero } from './money'

export interface EarningsSummary {
  totalRevenue: number
  compensation: number
  totalTips: number
  appointmentCount: number
  compensationType: string | null
  commissionRate: number | null
  boothRentPaid: number
}

// Same formula already used in app/dashboard/staff/[id]/earnings/page.tsx --
// barberCut = revenue * commission_rate (commission) or full revenue
// (booth_rent), plus tips. Kept identical on purpose: this is what the app
// already shows the owner and barber as "earnings" everywhere else, and the
// 1099-style report is explicitly unofficial/reference-only rather than a
// stricter independent re-derivation of Box 1.
export async function computeEarningsSummary(
  supabase: SupabaseClient,
  shopId: string,
  barberId: string,
  startDate: string,
  endDate: string
): Promise<EarningsSummary> {
  const { data: shopBarber } = await supabase
    .from('shop_barbers')
    .select('compensation_type, commission_rate')
    .eq('shop_id', shopId)
    .eq('barber_id', barberId)
    .maybeSingle()

  const { data: appointments } = await supabase
    .from('appointments')
    .select('price')
    .eq('shop_id', shopId)
    .eq('barber_id', barberId)
    .eq('status', 'done')
    .gte('date', startDate)
    .lte('date', endDate)

  const { data: tips } = await supabase
    .from('tips')
    .select('amount')
    .eq('shop_id', shopId)
    .eq('barber_id', barberId)
    .gte('created_at', startDate)
    .lte('created_at', `${endDate}T23:59:59`)

  const { data: rentPayments } = await supabase
    .from('booth_rent_payments')
    .select('total_due')
    .eq('shop_id', shopId)
    .eq('barber_id', barberId)
    .eq('paid', true)
    .gte('paid_at', startDate)
    .lte('paid_at', `${endDate}T23:59:59`)

  // Integer-cents summation via dinero: each amount converted once at the
  // boundary, summed as integers. Commission multiplies in cents.
  const totalRevenueDinero = (appointments ?? []).reduce(
    (sum, a) => add(sum, fromDollars(parseFloat(a.price) || 0)),
    toDinero(0)
  )
  const compensationBaseDinero =
    shopBarber?.compensation_type === 'commission'
      ? multiply(totalRevenueDinero, shopBarber?.commission_rate || 0.7)
      : totalRevenueDinero
  const totalTipsDinero = (tips ?? []).reduce(
    (sum, t) => add(sum, fromDollars(parseFloat(t.amount) || 0)),
    toDinero(0)
  )
  const boothRentPaidDinero = (rentPayments ?? []).reduce(
    (sum, r) => add(sum, fromDollars(parseFloat(r.total_due) || 0)),
    toDinero(0)
  )

  const totalRevenue = toCents(totalRevenueDinero) / 100
  const totalTips = toCents(totalTipsDinero) / 100
  const boothRentPaid = toCents(boothRentPaidDinero) / 100
  const compensation = toCents(add(compensationBaseDinero, totalTipsDinero)) / 100

  return {
    totalRevenue,
    compensation,
    totalTips,
    appointmentCount: (appointments ?? []).length,
    compensationType: shopBarber?.compensation_type ?? null,
    commissionRate: shopBarber?.commission_rate ?? null,
    boothRentPaid,
  }
}
