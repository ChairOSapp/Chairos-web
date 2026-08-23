// Server-side slot availability, buffer-aware. There was no real
// availability computation anywhere in the app before this — the public
// booking page rendered a fixed list of times regardless of what was
// already booked. This is the first real implementation, and buffers are
// part of it from the start rather than bolted on.

export interface DayHours {
  open: boolean
  from: string // "HH:MM", 24h
  to: string // "HH:MM", 24h
}

export interface BlockedInterval {
  /** Minutes since midnight the existing appointment starts. */
  startMin: number
  /** Minutes since midnight the existing appointment ends. */
  endMin: number
  bufferBeforeMin: number
  bufferAfterMin: number
}

export interface AvailabilityParams {
  dayHours: DayHours | undefined
  existing: BlockedInterval[]
  serviceDurationMin: number
  serviceBufferBeforeMin: number
  serviceBufferAfterMin: number
  slotIntervalMin?: number
}

/** "09:00" or "9:00 AM" -> minutes since midnight. */
export function timeStrToMinutes(t: string): number {
  const ampmMatch = t.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (ampmMatch) {
    let h = parseInt(ampmMatch[1], 10)
    const m = parseInt(ampmMatch[2], 10)
    const period = ampmMatch[3].toUpperCase()
    if (period === 'PM' && h !== 12) h += 12
    if (period === 'AM' && h === 12) h = 0
    return h * 60 + m
  }
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}

/** minutes since midnight -> "9:00 AM" */
export function minutesToDisplayTime(mins: number): string {
  const h24 = Math.floor(mins / 60)
  const m = mins % 60
  const period = h24 >= 12 ? 'PM' : 'AM'
  const h12 = h24 % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

/**
 * Returns available start times (as "9:00 AM" strings) for a service of
 * the given duration + buffers, against a day's working hours and a list
 * of already-blocked intervals for one staff member. Each existing
 * appointment occupies [start - itsBufferBefore, end + itsBufferAfter];
 * a candidate slot occupies [start - newBufferBefore, end + newBufferAfter].
 * A slot is available only if that occupied range doesn't overlap any
 * existing occupied range. Buffers never affect the working-hours fit
 * check (only the actual appointment start/end must fit within hours) so
 * they can't produce negative-time slots at the edges of the day.
 */
export function computeAvailableSlots({
  dayHours,
  existing,
  serviceDurationMin,
  serviceBufferBeforeMin,
  serviceBufferAfterMin,
  slotIntervalMin = 30,
}: AvailabilityParams): string[] {
  if (!dayHours || !dayHours.open) return []

  const openMin = timeStrToMinutes(dayHours.from)
  const closeMin = timeStrToMinutes(dayHours.to)
  if (closeMin <= openMin) return []

  const slots: string[] = []
  for (let candidateStart = openMin; candidateStart + serviceDurationMin <= closeMin; candidateStart += slotIntervalMin) {
    const candidateEnd = candidateStart + serviceDurationMin
    const occupiedStart = candidateStart - serviceBufferBeforeMin
    const occupiedEnd = candidateEnd + serviceBufferAfterMin

    const conflicts = existing.some(block => {
      const blockedStart = block.startMin - block.bufferBeforeMin
      const blockedEnd = block.endMin + block.bufferAfterMin
      return occupiedStart < blockedEnd && occupiedEnd > blockedStart
    })

    if (!conflicts) slots.push(minutesToDisplayTime(candidateStart))
  }

  return slots
}
