'use server'
import { abandonedBookingRecovery } from '@/src/trigger/abandonedBookingRecovery'

type AbandonedBookingPayload = {
  bookingSessionId: string
  clientPhone: string
  clientName: string
  shopName: string
  barberId: string
  barberName: string
}

export async function triggerAbandonedBooking(payload: AbandonedBookingPayload) {
  const handle = await abandonedBookingRecovery.trigger(payload)
  return { triggerId: handle.id }
}
