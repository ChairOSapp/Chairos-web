import { SupabaseClient } from '@supabase/supabase-js'

export interface EarningsSummary {
  totalRevenue: number
  compensation: number
  totalTips: number
  appointmentCount: number
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

  const totalRevenue = (appointments ?? []).reduce((sum, a) => sum + (parseFloat(a.price) || 0), 0)
  const compensationBase = shopBarber?.compensation_type === 'commission'
    ? totalRevenue * (shopBarber?.commission_rate || 0.7)
    : totalRevenue
  const totalTips = (tips ?? []).reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0)

  return {
    totalRevenue,
    compensation: compensationBase + totalTips,
    totalTips,
    appointmentCount: (appointments ?? []).length,
  }
}
