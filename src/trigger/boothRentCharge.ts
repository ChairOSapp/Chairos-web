import { schedules } from "@trigger.dev/sdk"
import { createClient } from "@supabase/supabase-js"
import { squareClientFor } from "@/lib/square"
import { sendNotification } from "@/lib/notify"
import { logger } from "@/lib/logger"

// Chair/booth rental billing -- a recurring charge from a renting
// barber/stylist to the shop owner, entirely separate from client/
// appointment payments. Reuses the existing
// shop_barbers.compensation_type='booth_rent' + booth_rent_payments data
// model (already had owner-facing view + manual mark-paid UI at
// /dashboard/chair).
//
// FLOW: The daily cron creates each period's payment row (bookkeeping)
// and notifies the shop owner that rent is due. The owner then taps
// "Charge" in the dashboard to actually run the card -- no surprise
// auto-charges. The charge logic lives in runBoothRentChargeForPayment()
// so both the dashboard button and any future automation call the same path.
const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
function todayDateStr(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Separated from the schedules.task wrapper below (mirrors
// depositHoldExpiration.ts importing runReferralNotifications) so the
// actual logic can be invoked directly -- by the cron wrapper here, or
// from a test harness -- rather than only reachable through Trigger.dev.
export async function runBoothRentCharge() {
    const supabase = getSupabase()
    const today = todayDateStr()
    const todayWeekday = DAY_NAMES[new Date(today + 'T12:00:00').getDay()]

    const { data: dueBarbers, error } = await supabase
      .from('shop_barbers')
      .select('id, shop_id, barber_id, barber_name, alias, booth_rent_amount')
      .eq('compensation_type', 'booth_rent')
      .eq('active', true)
      .eq('booth_rent_due_day', todayWeekday)
      .not('booth_rent_amount', 'is', null)

    if (error) throw error
    if (!dueBarbers || dueBarbers.length === 0) return { due: 0, created: 0 }

    let created = 0

    for (const sb of dueBarbers) {
      const amount = Number(sb.booth_rent_amount)

      // Idempotent: a prior run today (or a retry) that already created
      // this period's row is a no-op here, not a duplicate.
      const { data: existing } = await supabase
        .from('booth_rent_payments')
        .select('id')
        .eq('shop_barber_id', sb.id)
        .eq('due_date', today)
        .maybeSingle()

      if (!existing) {
        const { data: inserted, error: insertErr } = await supabase.from('booth_rent_payments').insert({
          shop_id: sb.shop_id,
          barber_id: sb.barber_id,
          shop_barber_id: sb.id,
          amount_due: amount,
          late_fee_amount: 0,
          total_due: amount,
          due_date: today,
          paid: false,
        }).select('id').single()
        if (insertErr || !inserted) {
          logger.error('booth_rent_row_create_failed', { shopBarberId: sb.id, message: insertErr?.message })
          continue
        }
        created++
      }
    }

    // Notify each shop owner that rent is due -- they tap Charge in the
    // dashboard to run the card. No auto-charges.
    const shopIds = [...new Set(dueBarbers.map(sb => sb.shop_id))]
    for (const shopId of shopIds) {
      const { data: shop } = await supabase.from('shops').select('owner_id, name').eq('id', shopId).maybeSingle()
      if (shop?.owner_id) {
        const count = dueBarbers.filter(sb => sb.shop_id === shopId).length
        const total = dueBarbers.filter(sb => sb.shop_id === shopId).reduce((sum, sb) => sum + Number(sb.booth_rent_amount), 0)
        await sendNotification({
          userId: shop.owner_id,
          shopId,
          type: 'billing',
          title: 'Booth rent due',
          body: `${count} booth rent payment${count === 1 ? '' : 's'} totaling $${total.toFixed(2)} ${count === 1 ? 'is' : 'are'} due today. Tap to review and charge.`,
          link: '/dashboard/chair',
        })
      }
    }

    logger.info('booth_rent_charge_run_complete', { due: dueBarbers.length, created })
    return { due: dueBarbers.length, created }
}

/**
 * Charges a single booth rent payment off the barber's card on file.
 * Called from the dashboard when the owner taps "Charge" -- never
 * automatically. Returns { ok, message }.
 */
export async function runBoothRentChargeForPayment(paymentId: string, ownerId: string) {
  const supabase = getSupabase()

  // Load the payment and verify the caller owns the shop.
  const { data: payment } = await supabase
    .from('booth_rent_payments')
    .select('id, shop_id, shop_barber_id, barber_id, amount_due, total_due, paid, square_payment_id, due_date')
    .eq('id', paymentId)
    .maybeSingle()
  if (!payment) return { ok: false, message: 'Payment not found' }
  if (payment.paid || payment.square_payment_id) return { ok: false, message: 'Already paid' }

  const { data: shop } = await supabase.from('shops').select('owner_id').eq('id', payment.shop_id).maybeSingle()
  if (!shop || shop.owner_id !== ownerId) return { ok: false, message: 'Not your shop' }

  const { data: sb } = await supabase
    .from('shop_barbers')
    .select('barber_name, alias, square_customer_id, square_card_id')
    .eq('id', payment.shop_barber_id)
    .maybeSingle()
  if (!sb?.square_customer_id || !sb?.square_card_id) {
    return { ok: false, message: 'No card on file for this barber' }
  }

  const { data: ownerSquare } = await supabase
    .from('square_accounts')
    .select('square_access_token, square_location_id')
    .eq('user_id', ownerId)
    .maybeSingle()
  if (!ownerSquare?.square_access_token) {
    return { ok: false, message: 'Connect Square first to charge cards' }
  }

  const amount = Number(payment.total_due || payment.amount_due)
  const barberLabel = sb.barber_name || sb.alias || 'Staff'
  const client = squareClientFor(ownerSquare.square_access_token)

  try {
    const { payment: sqPayment } = await client.payments.create({
      sourceId: sb.square_card_id,
      customerId: sb.square_customer_id,
      idempotencyKey: `boothrent-${payment.id}`,
      amountMoney: { amount: BigInt(Math.round(amount * 100)), currency: 'USD' },
      locationId: ownerSquare.square_location_id || undefined,
      note: `ChairOS booth rent — ${barberLabel} — week of ${payment.due_date}`,
      referenceId: `boothrent:${payment.id}`,
    })
    if (sqPayment?.status === 'COMPLETED') {
      await supabase.from('booth_rent_payments').update({
        paid: true, paid_at: new Date().toISOString(), square_payment_id: sqPayment.id,
      }).eq('id', payment.id)
      await supabase.from('automation_logs').insert({
        type: 'booth_rent_charge',
        payload: { boothRentPaymentId: payment.id, amount },
        result: `charged:${sqPayment.id}`,
      })
      return { ok: true, message: `Charged $${amount.toFixed(2)}` }
    }
    return { ok: false, message: `Charge didn't complete (${sqPayment?.status})` }
  } catch (err: any) {
    await supabase.from('automation_logs').insert({
      type: 'booth_rent_charge',
      payload: { boothRentPaymentId: payment.id, amount },
      result: `charge_failed:${err.message}`,
    })
    return { ok: false, message: 'Card charge failed' }
  }
}

export const boothRentCharge = schedules.task({
  id: "booth-rent-charge",
  cron: "0 12 * * *", // 8am ET daily
  run: runBoothRentCharge,
})
