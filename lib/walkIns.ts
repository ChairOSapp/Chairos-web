// Shared walk-in helpers: race-safe claim/seat/remove plus display formatting.
// Used by WalkInQueue and the calendar WalkInPopover so both surfaces behave
// identically. All mutations are conditional so two people tapping at once
// can't both win — the loser gets a friendly message and a refresh.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface WalkIn {
  id: string
  shop_id: string
  client_name: string
  client_phone: string
  requested_barber_id: string | null
  service_id: string | null
  status: string
  created_at: string
  called_at: string | null
  completed_at: string | null
  appointment_id: string | null
  client_id: string | null
}

export interface WalkInService {
  id: string
  name: string
  price: number
}

/** "just walked in" / "waiting 12 min" / "waiting 1 hr 5 min" */
export function waitingLabel(createdAt: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(createdAt).getTime()) / 60000))
  if (mins < 1) return 'just walked in'
  if (mins < 60) return `waiting ${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `waiting ${h} hr ${m} min` : `waiting ${h} hr`
}

function todayStr(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function nowTime(): string {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`
}

/**
 * Race-safe claim: only wins if the walk-in is still waiting and unclaimed.
 * Idempotent when this barber already claimed it.
 * Returns 'claimed' | 'taken' (someone else got it / it's no longer waiting).
 */
export async function claimWalkIn(
  supabase: SupabaseClient,
  walkIn: WalkIn,
  barberId: string,
): Promise<'claimed' | 'taken'> {
  if (walkIn.requested_barber_id === barberId) return 'claimed'
  const { data, error } = await supabase
    .from('walk_ins')
    .update({ requested_barber_id: barberId })
    .eq('id', walkIn.id)
    .eq('status', 'waiting')
    .is('requested_barber_id', null)
    .select('id')
  if (error || !data || data.length === 0) return 'taken'
  return 'claimed'
}

/**
 * Race-safe seat: flips waiting -> in_service FIRST (atomic guard), then
 * creates/finds the client and the appointment. If a second tap wins the
 * guard first, this call returns taken: true. If the appointment insert
 * fails after winning the guard, the walk-in is rolled back to waiting.
 */
export async function seatWalkIn(
  supabase: SupabaseClient,
  shopId: string,
  walkIn: WalkIn,
  barberId: string,
  services: WalkInService[],
): Promise<{ appointmentId: string | null; taken: boolean; error?: string }> {
  const { data: locked, error: lockErr } = await supabase
    .from('walk_ins')
    .update({ status: 'in_service', called_at: new Date().toISOString() })
    .eq('id', walkIn.id)
    .eq('status', 'waiting')
    .select('id')
  if (lockErr || !locked || locked.length === 0) {
    return { appointmentId: null, taken: true }
  }

  const rollback = () =>
    supabase.from('walk_ins').update({ status: 'waiting', called_at: null }).eq('id', walkIn.id)

  try {
    const service = services.find(s => s.id === walkIn.service_id)
    const normalizedPhone = (walkIn.client_phone || '').replace(/\D/g, '')
    let clientId: string | null = null
    const { data: rpcData } = await supabase
      .rpc('find_client_for_booking', { p_phone: normalizedPhone, p_shop_id: shopId })
    const existing = (rpcData as any[])?.[0]
    if (existing?.client_id) {
      clientId = existing.client_id
    } else {
      const newId = crypto.randomUUID()
      const { error: newClientErr } = await supabase.from('clients').insert({
        id: newId,
        full_name: walkIn.client_name,
        phone: normalizedPhone,
        total_visits: 0,
        source: 'walk_in',
      })
      clientId = newClientErr ? null : newId
    }

    if (clientId) {
      fetch('/api/book/membership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, shopId }),
      }).catch(() => {})
    }

    const { data: newAppt, error: apptErr } = await supabase
      .from('appointments')
      .insert({
        shop_id: shopId,
        barber_id: barberId,
        service_id: walkIn.service_id,
        client_id: clientId,
        client_name: walkIn.client_name,
        client_phone: walkIn.client_phone,
        date: todayStr(),
        time: nowTime(),
        price: service?.price ?? 0,
        status: 'confirmed',
        source: 'walk_in',
      })
      .select('id')
      .single()

    if (apptErr || !newAppt) {
      await rollback()
      return { appointmentId: null, taken: false, error: "Couldn't create the appointment — please try again." }
    }

    await supabase
      .from('walk_ins')
      .update({ appointment_id: newAppt.id, client_id: clientId })
      .eq('id', walkIn.id)

    return { appointmentId: newAppt.id, taken: false }
  } catch {
    await rollback()
    return { appointmentId: null, taken: false, error: 'Something went wrong — please try again.' }
  }
}

/** Mark a waiting walk-in done (solo quick-serve flow). Race-safe. */
export async function finishWalkIn(
  supabase: SupabaseClient,
  walkInId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('walk_ins')
    .update({ status: 'done', completed_at: new Date().toISOString() })
    .eq('id', walkInId)
    .eq('status', 'waiting')
    .select('id')
  return !error && !!data && data.length > 0
}

/** Remove a waiting walk-in from the queue. Race-safe. */
export async function removeWalkIn(
  supabase: SupabaseClient,
  walkInId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('walk_ins')
    .update({ status: 'cancelled' })
    .eq('id', walkInId)
    .eq('status', 'waiting')
    .select('id')
  return !error && !!data && data.length > 0
}
