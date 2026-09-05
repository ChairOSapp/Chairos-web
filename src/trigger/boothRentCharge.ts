import { schedules } from "@trigger.dev/sdk"
import { createClient } from "@supabase/supabase-js"
import { squareClientFor } from "@/lib/square"
import { sendNotification } from "@/lib/notify"
import { logger } from "@/lib/logger"

// Chair/booth rental billing -- a recurring charge from a renting
// barber/stylist to the shop owner, entirely separate from client/
// appointment payments (Task 2's reconciliation). Reuses the existing
// shop_barbers.compensation_type='booth_rent' + booth_rent_payments data
// model (already had owner-facing view + manual mark-paid UI at
// /dashboard/chair) rather than introducing a second, parallel
// "recurring charge" table -- this only adds what was missing: generating
// each period's charge on schedule, and paying it automatically off the
// barber's card on file when one exists.
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
      .select('id, shop_id, barber_id, barber_name, alias, booth_rent_amount, square_customer_id, square_card_id')
      .eq('compensation_type', 'booth_rent')
      .eq('active', true)
      .eq('booth_rent_due_day', todayWeekday)
      .not('booth_rent_amount', 'is', null)

    if (error) throw error
    if (!dueBarbers || dueBarbers.length === 0) return { due: 0, charged: 0, failed: 0, skipped: 0 }

    let charged = 0, failed = 0, skipped = 0

    for (const sb of dueBarbers) {
      const amount = Number(sb.booth_rent_amount)

      // Idempotent: a prior run today (or a retry) that already created
      // this period's row is a no-op here, not a duplicate charge.
      const { data: existing } = await supabase
        .from('booth_rent_payments')
        .select('id, paid, square_payment_id')
        .eq('shop_barber_id', sb.id)
        .eq('due_date', today)
        .maybeSingle()

      let paymentRowId: string
      if (existing) {
        if (existing.paid || existing.square_payment_id) { skipped++; continue }
        paymentRowId = existing.id
      } else {
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
        paymentRowId = inserted.id
      }

      if (!sb.square_customer_id || !sb.square_card_id) {
        skipped++
        await supabase.from('automation_logs').insert({
          type: 'booth_rent_charge',
          payload: { shopBarberId: sb.id, boothRentPaymentId: paymentRowId, amount },
          result: 'skipped_no_card_on_file',
        })
        // Nudge the barber themselves -- they're the one who'd add a card.
        if (sb.barber_id) {
          await sendNotification({
            userId: sb.barber_id,
            shopId: sb.shop_id,
            type: 'billing',
            title: 'Booth rent due',
            body: `Your $${amount.toFixed(2)} booth rent is due today. Add a card on file in your settings so it's charged automatically, or pay your shop owner directly.`,
          })
        }
        continue
      }

      const { data: shop } = await supabase.from('shops').select('owner_id').eq('id', sb.shop_id).maybeSingle()
      const { data: ownerSquare } = shop?.owner_id
        ? await supabase.from('square_accounts').select('square_access_token, square_location_id').eq('user_id', shop.owner_id).maybeSingle()
        : { data: null as any }

      if (!ownerSquare?.square_access_token) {
        skipped++
        await supabase.from('automation_logs').insert({
          type: 'booth_rent_charge',
          payload: { shopBarberId: sb.id, boothRentPaymentId: paymentRowId, amount },
          result: 'skipped_owner_not_connected_to_square',
        })
        continue
      }

      const client = squareClientFor(ownerSquare.square_access_token)
      const barberLabel = sb.barber_name || sb.alias || 'Staff'
      let result: string
      try {
        const { payment } = await client.payments.create({
          sourceId: sb.square_card_id,
          customerId: sb.square_customer_id,
          idempotencyKey: `boothrent-${paymentRowId}`,
          amountMoney: { amount: BigInt(Math.round(amount * 100)), currency: 'USD' },
          locationId: ownerSquare.square_location_id || undefined,
          note: `ChairOS booth rent — ${barberLabel} — week of ${today}`,
          referenceId: `boothrent:${paymentRowId}`,
        })
        if (payment?.status === 'COMPLETED') {
          await supabase.from('booth_rent_payments').update({
            paid: true, paid_at: new Date().toISOString(), square_payment_id: payment.id,
          }).eq('id', paymentRowId)
          result = `charged:${payment.id}`
          charged++
        } else {
          result = `not_completed:${payment?.status}`
          failed++
        }
      } catch (err: any) {
        result = `charge_failed:${err.message}`
        failed++
      }

      await supabase.from('automation_logs').insert({
        type: 'booth_rent_charge',
        payload: { shopBarberId: sb.id, boothRentPaymentId: paymentRowId, amount },
        result,
      })

      if (!result.startsWith('charged')) {
        if (shop?.owner_id) {
          await sendNotification({
            userId: shop.owner_id,
            shopId: sb.shop_id,
            type: 'billing',
            title: 'Booth rent charge failed',
            body: `Couldn't charge ${barberLabel}'s card on file for this week's $${amount.toFixed(2)} booth rent. You can mark it paid manually once collected.`,
          })
        }
      }
    }

    logger.info('booth_rent_charge_run_complete', { due: dueBarbers.length, charged, failed, skipped })
    return { due: dueBarbers.length, charged, failed, skipped }
}

export const boothRentCharge = schedules.task({
  id: "booth-rent-charge",
  cron: "0 12 * * *", // 8am ET daily
  run: runBoothRentCharge,
})
