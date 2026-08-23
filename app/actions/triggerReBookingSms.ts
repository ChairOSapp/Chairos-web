'use server'
import { reBookingSms } from '@/src/trigger/reBookingSms'

type ReBookingPayload = {
  clientPhone: string
  clientName: string
  barberName: string
  shopName: string
  daysSinceVisit: number
  lastServiceName: string
  vertical?: string
}

export async function triggerReBookingSms(payload: ReBookingPayload) {
  const handle = await reBookingSms.trigger(payload)
  return { triggerId: handle.id }
}
