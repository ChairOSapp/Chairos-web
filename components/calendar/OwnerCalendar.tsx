'use client'
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { EventClickArg, DateSelectArg, DatesSetArg, EventContentArg } from '@fullcalendar/core'
import { createClient } from '@/lib/supabase'
import AppointmentPopover from './AppointmentPopover'
import WalkInPopover from './WalkInPopover'
import QuickBookModal from './QuickBookModal'
import DayGlance, { type CalView } from './DayGlance'
import { AnimatePresence } from '@/components/motion'
import { useVerticalLabels } from '@/lib/VerticalContext'
import { STAFF_COLORS, tint, statusMeta, fmtTime12, fmtTimeShort, fmtPrice, toDateStr } from './calendarTheme'
import { waitingLabel, type WalkIn } from '@/lib/walkIns'

function addMins(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + mins
  return `${String(Math.floor(total / 60) % 24).padStart(2,'0')}:${String(total % 60).padStart(2,'0')}:00`
}

// "14:30" minutes-since-midnight -> "2:30 PM" for the drag-create block label.
function fmtMinutes(mins: number): string {
  let h = Math.floor(mins / 60)
  const m = mins % 60
  const ap = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${String(m).padStart(2, '0')} ${ap}`
}

function getDateLabel(view: CalView, d: Date): string {  if (view === 'timeGridDay') return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  if (view === 'timeGridWeek') {
    const end = new Date(d); end.setDate(d.getDate() + 6)
    const s = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const e = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    return `${s} – ${e}`
  }
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

const FC_CSS = `
.chairos-cal .fc-timegrid-now-indicator-line { border-color: #dc2626; border-top-width: 2px; }
.chairos-cal .fc-timegrid-now-indicator-arrow { border-top-color: #dc2626; border-bottom-color: #dc2626; }
.chairos-cal .fc-day-today { background: ${tint('#4B5320', 0.05)} !important; }
.chairos-cal .fc-col-header-cell.fc-day-today .fc-col-header-cell-cushion { color: #4B5320; font-weight: 800; }
.chairos-cal .fc-timegrid-slot { height: 40px; }
.chairos-cal .drag-new-block { transition: top 90ms ease-out; }
.chairos-cal .fc-event { box-shadow: none; background: transparent; border: none; }
.chairos-cal .fc-daygrid-event { background: transparent; border: none; }
.chairos-cal .fc-v-event .fc-event-main { padding: 0; }
`

interface Props {
  shopId: string
  shopName: string
  shopCode?: string
  openBookOnLoad?: boolean
}

export default function OwnerCalendar({ shopId, shopCode, openBookOnLoad }: Props) {
  const { staffLabel } = useVerticalLabels()
  const [view, setView] = useState<CalView>('dayGridMonth')
  const [viewStart, setViewStart] = useState(new Date())
  const [viewRange, setViewRange] = useState<{ start: Date; end: Date } | null>(null)
  const [filterBarberId, setFilterBarberId] = useState<string | null>(null)
  const [appointments, setAppointments] = useState<any[]>([])
  const [barbers, setBarbers] = useState<any[]>([])
  const [services, setServices] = useState<any[]>([])
  const [popover, setPopover] = useState<{ appt: any; barberName: string; x: number; y: number } | null>(null)
  const [walkInPopover, setWalkInPopover] = useState<{ walkIn: WalkIn; x: number; y: number } | null>(null)
  const [walkIns, setWalkIns] = useState<WalkIn[]>([])
  const [bookSlot, setBookSlot] = useState<{ date: string; time: string; barberId?: string } | null>(null)
  const [showBook, setShowBook] = useState(openBookOnLoad || false)
  const calRef = useRef<FullCalendar>(null)
  const calWrapRef = useRef<HTMLDivElement>(null)
  // Floating 15-min block for the long-press-to-create gesture (Day view).
  const [dragNew, setDragNew] = useState<{ top: number; left: number; width: number; height: number; minutes: number } | null>(null)
  const supabase = useMemo(() => createClient(), [])

  const loadAppointments = useCallback(async () => {
    const now = new Date()
    const past = new Date(now.getFullYear(), now.getMonth() - 3, 1)
    const future = new Date(now.getFullYear(), now.getMonth() + 4, 0)
    const { data } = await supabase
      .from('appointments')
      .select('*, services(name, price)')
      .eq('shop_id', shopId)
      .gte('date', toDateStr(past))
      .lte('date', toDateStr(future))
      .order('date').order('time', { ascending: true })
    setAppointments(data || [])
  }, [shopId, supabase])

  useEffect(() => {
    async function init() {
      const [{ data: b }, { data: s }] = await Promise.all([
        supabase.from('shop_barbers').select('barber_id, barber_name, alias, joined_at').eq('shop_id', shopId).eq('active', true).order('joined_at', { ascending: true }),
        supabase.from('services').select('id, name, price').eq('shop_id', shopId).eq('active', true).order('price', { ascending: true }),
      ])
      setBarbers(b || [])
      setServices(s || [])
      await loadAppointments()
    }
    init()
  }, [shopId, supabase, loadAppointments])

  useEffect(() => {
    const channel = supabase.channel('owner-cal-appts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `shop_id=eq.${shopId}` }, loadAppointments)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [shopId, supabase, loadAppointments])

  // Today's waiting walk-ins — shown as distinct unassigned blocks.
  const loadWalkIns = useCallback(async () => {
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    const { data } = await supabase
      .from('walk_ins')
      .select('*')
      .eq('shop_id', shopId)
      .eq('status', 'waiting')
      .gte('created_at', startOfDay.toISOString())
      .order('created_at', { ascending: true })
    setWalkIns((data as WalkIn[]) || [])
  }, [shopId, supabase])

  useEffect(() => {
    loadWalkIns()
    const channel = supabase.channel('owner-cal-walkins')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'walk_ins', filter: `shop_id=eq.${shopId}` }, loadWalkIns)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [shopId, supabase, loadWalkIns])

  const barberColorMap = useMemo(() => {
    const m: Record<string, string> = {}
    barbers.forEach((b, i) => { m[b.barber_id] = STAFF_COLORS[i % STAFF_COLORS.length] })
    return m
  }, [barbers])

  const barberNameFor = useCallback((id?: string) => {
    if (!id) return ''
    const b = barbers.find(x => x.barber_id === id)
    return b?.barber_name || b?.alias || ''
  }, [barbers])

  // Appointments in the current view (for filter-chip counts)
  const rangeAppointments = useMemo(() => {
    if (!viewRange) return appointments
    const s = toDateStr(viewRange.start)
    const e = toDateStr(viewRange.end)
    return appointments.filter(a => a.date >= s && a.date < e)
  }, [appointments, viewRange])

  const visibleAppointments = useMemo(() => {
    if (!filterBarberId) return appointments
    return appointments.filter(a => a.barber_id === filterBarberId)
  }, [appointments, filterBarberId])

  const fcEvents = useMemo(() => {
    const apptEvents = visibleAppointments.map(a => {
      const timeStr = a.time || '09:00:00'
      const color = barberColorMap[a.barber_id] || '#65655F'
      return {
        id: a.id,
        title: a.client_name || 'Walk-in',
        start: `${a.date}T${timeStr}`,
        end: `${a.date}T${addMins(timeStr, 30)}`,
        backgroundColor: 'transparent',
        borderColor: 'transparent',
        textColor: 'inherit',
        extendedProps: {
          ...a,
          _color: color,
          serviceName: a.services?.name || '',
        },
      }
    })
    // Walk-ins sit in the timeline at the moment they checked in —
    // visually distinct from booked appointments.
    const walkInEvents = walkIns.map(w => {
      const start = new Date(w.created_at)
      const end = new Date(start.getTime() + 30 * 60000)
      return {
        id: `walkin-${w.id}`,
        title: `Walk-in · ${w.client_name}`,
        start: start.toISOString(),
        end: end.toISOString(),
        backgroundColor: 'transparent',
        borderColor: 'transparent',
        textColor: 'inherit',
        extendedProps: {
          _walkIn: true,
          _walkInData: w,
        },
      }
    })
    return [...apptEvents, ...walkInEvents]
  }, [visibleAppointments, walkIns, barberColorMap])

  function handleEventClick(info: EventClickArg) {
    info.jsEvent.preventDefault()
    const appt = info.event.extendedProps
    if (appt._walkIn) {
      setWalkInPopover({ walkIn: appt._walkInData as WalkIn, x: info.jsEvent.clientX, y: info.jsEvent.clientY })
      return
    }
    const barberId = appt.barber_id
    const barberName = barberNameFor(barberId) || staffLabel
    setPopover({ appt: { ...appt, id: info.event.id }, barberName, x: info.jsEvent.clientX, y: info.jsEvent.clientY })
  }

  function handleSelect(info: DateSelectArg) {
    const dateStr = info.startStr.split('T')[0]
    const timeStr = info.startStr.includes('T') ? info.startStr.split('T')[1].slice(0,8) : '09:00:00'
    // Prefill the filtered barber so front-desk booking matches what's on screen.
    setBookSlot({ date: dateStr, time: timeStr, barberId: filterBarberId ?? undefined })
    setShowBook(true)
    calRef.current?.getApi().unselect()
  }

  function handleDatesSet(info: DatesSetArg) {
    setViewStart(info.start)
    setViewRange({ start: info.start, end: info.end })
  }

  function changeView(v: CalView) {
    setView(v)
    calRef.current?.getApi().changeView(v)
  }

  // Date navigation — resolve the FullCalendar API at click time so the ref is
  // always fresh (never a stale or undefined render-time capture).
  const goToday = useCallback(() => calRef.current?.getApi().today(), [])
  const goPrev = useCallback(() => calRef.current?.getApi().prev(), [])
  const goNext = useCallback(() => calRef.current?.getApi().next(), [])
  const gotoDate = useCallback((dateStr: string) => calRef.current?.getApi().gotoDate(dateStr), [])

  function renderEventContent(arg: EventContentArg) {
    const props = arg.event.extendedProps

    // Walk-in blocks: dashed amber outline, clearly not a booked appointment.
    if (props._walkIn) {
      const w = props._walkInData as WalkIn
      const firstName = (w.client_name || 'Walk-in').split(' ')[0]
      if (arg.view.type === 'dayGridMonth') {
        return (
          <div className="flex items-center gap-1 px-1 py-px overflow-hidden">
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 border border-dashed border-amber-600" />
            <span className="text-[10px] font-medium truncate text-amber-700">
              Walk-in {firstName}
            </span>
          </div>
        )
      }
      const claimedColor = w.requested_barber_id ? barberColorMap[w.requested_barber_id] : undefined
      return (
        <div
          className="h-full w-full rounded-md px-2 py-1 overflow-hidden flex flex-col justify-center border-2 border-dashed"
          style={{
            borderColor: claimedColor || '#d97706',
            background: claimedColor ? tint(claimedColor, 0.08) : 'rgba(217,119,6,0.07)',
          }}
        >
          <div className="text-[12px] font-bold truncate" style={{ color: '#92400e' }}>
            Walk-in · {firstName}
          </div>
          <div className="text-[11px] leading-tight truncate" style={{ color: '#b45309' }}>
            {waitingLabel(w.created_at)}
            {claimedColor ? ` · ${barberNameFor(w.requested_barber_id || '')}` : ''}
          </div>
        </div>
      )
    }

    const color: string = props._color || '#65655F'
    const meta = statusMeta(props.status)
    const name = (arg.event.title || 'Walk-in').split(' ')[0]
    const price = fmtPrice(props.price)

    if (arg.view.type === 'dayGridMonth') {
      return (
        <div className="flex items-center gap-1 px-1 py-px overflow-hidden">
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
          <span
            className="text-[10px] font-medium truncate"
            style={{
              color: 'var(--color-text-primary)',
              opacity: meta.dimmed ? 0.6 : meta.strike ? 0.45 : 1,
              textDecoration: meta.strike ? 'line-through' : 'none',
            }}
          >
            {fmtTimeShort(props.time)} {name}
          </span>
        </div>
      )
    }

    return (
      <div
        className="h-full w-full rounded-md px-2 py-1 overflow-hidden flex flex-col justify-center gap-0.5"
        style={{
          background: tint(color, 0.13),
          borderLeft: `3px solid ${color}`,
          opacity: meta.dimmed ? 0.62 : meta.strike ? 0.45 : 1,
        }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: meta.dot }} />
          <span
            className="text-[12px] font-bold truncate"
            style={{ color: 'var(--color-text-primary)', textDecoration: meta.strike ? 'line-through' : 'none' }}
          >
            {meta.dimmed ? '✓ ' : ''}{name}
          </span>
          <span className="ml-auto text-[11px] font-semibold flex-shrink-0 font-mono" style={{ color: 'var(--color-text-secondary)' }}>
            {price}
          </span>
        </div>
        {props.serviceName && (
          <div className="text-[11px] leading-tight truncate pl-3" style={{ color: 'var(--color-text-secondary)' }}>
            {props.serviceName} · {fmtTime12(props.time)}
          </div>
        )}
      </div>
    )
  }

  // Long-press-to-create (Apple Calendar style) — Day view only, touch only.
  // Hold a finger on empty time: a 15-min block appears under it showing the
  // time, follows the drag snapping to 15-min increments, and on release the
  // booking sheet opens with that time (and the filtered barber) prefilled.
  // Native touch listeners with a non-passive touchmove: the first move after
  // the hold calls preventDefault(), which is what stops iOS Safari from
  // hijacking the gesture into a scroll. Mouse keeps FullCalendar's native
  // drag-select; presses starting on existing events are left to FullCalendar.
  useEffect(() => {
    const wrap = calWrapRef.current
    if (!wrap || view !== 'timeGridDay') return

    const SLOT_MIN = 7 * 60
    const SLOT_MAX = 22 * 60
    const SNAP = 15
    const HOLD_MS = 350
    const MOVE_TOL = 12

    let press: { x: number; y: number; timer: ReturnType<typeof setTimeout> } | null = null
    let dragging = false
    let curMinutes: number | null = null

    const geom = () => {
      const slots = wrap.querySelector('.fc-timegrid-slots') as HTMLElement | null
      const lane = wrap.querySelector('.fc-timegrid-cols .fc-timegrid-col') as HTMLElement | null
      const slotEl = wrap.querySelector('.fc-timegrid-slot') as HTMLElement | null
      if (!slots || !lane || !slotEl) return null
      return {
        wrapRect: wrap.getBoundingClientRect(),
        slotsRect: slots.getBoundingClientRect(),
        laneRect: lane.getBoundingClientRect(),
        slotH: slotEl.getBoundingClientRect().height, // one 15-min row
      }
    }

    const minutesAt = (clientY: number): number | null => {
      const g = geom()
      if (!g || g.slotH <= 0) return null
      const raw = SLOT_MIN + ((clientY - g.slotsRect.top) / g.slotH) * SNAP
      return Math.min(SLOT_MAX - SNAP, Math.max(SLOT_MIN, Math.round(raw / SNAP) * SNAP))
    }

    const place = (minutes: number) => {
      const g = geom()
      if (!g) return
      curMinutes = minutes
      setDragNew({
        top: (g.slotsRect.top - g.wrapRect.top) + wrap.scrollTop + ((minutes - SLOT_MIN) / SNAP) * g.slotH,
        left: (g.laneRect.left - g.wrapRect.left) + wrap.scrollLeft + 3,
        width: Math.max(48, g.laneRect.width - 6),
        height: g.slotH,
        minutes,
      })
    }

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      const t = e.touches[0]
      const target = e.target as HTMLElement
      if (!target.closest('.fc-timegrid-slots') || target.closest('.fc-event')) return
      const sx = t.clientX, sy = t.clientY
      press = {
        x: sx, y: sy,
        timer: setTimeout(() => {
          press = null
          const m = minutesAt(sy)
          if (m == null) return
          dragging = true
          place(m)
        }, HOLD_MS),
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0]
      if (!t) return
      if (press) {
        // Drifted before the hold fired — it's a scroll, bail out quietly.
        if (Math.hypot(t.clientX - press.x, t.clientY - press.y) > MOVE_TOL) {
          clearTimeout(press.timer)
          press = null
        }
        return
      }
      if (dragging) {
        e.preventDefault() // take over the gesture; blocks scroll hijack
        const m = minutesAt(t.clientY)
        if (m != null && m !== curMinutes) place(m)
      }
    }

    const finish = (commit: boolean) => {
      if (press) { clearTimeout(press.timer); press = null }
      if (!dragging) return
      dragging = false
      const m = curMinutes
      curMinutes = null
      setDragNew(null)
      if (commit && m != null) {
        const api = calRef.current?.getApi()
        const dateStr = api ? toDateStr(api.getDate()) : toDateStr(new Date())
        const hh = String(Math.floor(m / 60)).padStart(2, '0')
        const mm = String(m % 60).padStart(2, '0')
        // Open the booking sheet with the placed time prefilled, plus the
        // currently filtered barber (Everyone -> no prefill).
        setBookSlot({ date: dateStr, time: `${hh}:${mm}:00`, barberId: filterBarberId ?? undefined })
        setShowBook(true)
      }
    }

    const onTouchEnd = () => finish(true)
    const onTouchCancel = () => finish(false)

    wrap.addEventListener('touchstart', onTouchStart, { passive: true })
    wrap.addEventListener('touchmove', onTouchMove, { passive: false })
    wrap.addEventListener('touchend', onTouchEnd)
    wrap.addEventListener('touchcancel', onTouchCancel)
    return () => {
      wrap.removeEventListener('touchstart', onTouchStart)
      wrap.removeEventListener('touchmove', onTouchMove)
      wrap.removeEventListener('touchend', onTouchEnd)
      wrap.removeEventListener('touchcancel', onTouchCancel)
      if (press) clearTimeout(press.timer)
    }
  }, [view, filterBarberId])

  return (
    <div className="chairos-cal flex flex-col w-full" style={{ height: 'calc(100dvh - 56px)' }}>
      <style>{FC_CSS}</style>

      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-warm-100 border-b border-warm-200 flex-shrink-0 flex-wrap gap-y-2">
        {/* View tabs */}
        <div className="flex gap-1 bg-warm-200 rounded-xl p-1">
          {([['timeGridDay','Day'],['timeGridWeek','Week'],['dayGridMonth','Month']] as [CalView,string][]).map(([v,label]) => (
            <button key={v} onClick={() => changeView(v)}
              className={`px-4 py-2 rounded-lg text-[13px] font-semibold transition-colors min-h-[44px] ${view===v ? 'bg-warm-50 text-od-green shadow-sm' : 'text-charcoal-500 hover:text-charcoal-900'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Date nav — one grouped, thumb-friendly control cluster */}
        <div className="flex items-center gap-1 bg-warm-200 rounded-xl p-1 flex-shrink-0">
          <button onClick={goToday}
            className="px-4 py-2 rounded-lg text-[13px] font-bold bg-warm-50 text-charcoal-700 shadow-sm hover:text-od-green transition-colors min-h-[44px]">
            Today
          </button>
          <button onClick={goPrev} aria-label="Previous period"
            className="w-11 h-11 rounded-lg flex items-center justify-center text-2xl text-charcoal-600 hover:bg-warm-50 hover:text-charcoal-900 transition-colors">
            ‹
          </button>
          <label className="relative flex items-center justify-center gap-1.5 px-2 min-h-[44px] rounded-lg cursor-pointer hover:bg-warm-50 transition-colors" title="Jump to a date">
            <span className="text-[15px] font-bold text-charcoal-900 leading-tight text-center whitespace-nowrap">{getDateLabel(view, viewStart)}</span>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-charcoal-400 flex-shrink-0" aria-hidden="true">
              <rect x="3" y="4.5" width="18" height="16" rx="3" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
            </svg>
            {/* Visually hidden but tappable native date input — opens the OS
                date picker on mobile Safari. opacity-0 (never display:none). */}
            <input
              type="date"
              value={toDateStr(viewStart)}
              onChange={(e) => { if (e.target.value) gotoDate(e.target.value); e.target.blur() }}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              aria-label="Jump to a date"
            />
          </label>
          <button onClick={goNext} aria-label="Next period"
            className="w-11 h-11 rounded-lg flex items-center justify-center text-2xl text-charcoal-600 hover:bg-warm-50 hover:text-charcoal-900 transition-colors">
            ›
          </button>
        </div>

        {/* Book */}
        <button
          onClick={() => { setBookSlot(null); setShowBook(true) }}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-od-green hover:opacity-90 text-white text-[13px] font-bold rounded-xl transition-opacity min-h-[44px]">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 4v16m8-8H4"/></svg>
          Book appointment
        </button>
      </div>

      {/* Staff filter + legend */}
      {barbers.length > 1 && (
        <div className="flex items-center gap-2 px-4 py-2 bg-warm-100 border-b border-warm-200 overflow-x-auto flex-shrink-0">
          <button
            onClick={() => setFilterBarberId(null)}
            className={`flex-shrink-0 px-3 py-2 rounded-full text-xs font-bold border transition-colors min-h-[44px] ${!filterBarberId ? 'bg-charcoal-900 text-warm-50 border-charcoal-900' : 'bg-warm-50 text-charcoal-600 border-warm-300 hover:border-charcoal-400'}`}
          >
            Everyone
          </button>
          {barbers.map(b => {
            const color = barberColorMap[b.barber_id]
            const count = rangeAppointments.filter(a => a.barber_id === b.barber_id).length
            const active = filterBarberId === b.barber_id
            return (
              <button
                key={b.barber_id}
                onClick={() => setFilterBarberId(active ? null : b.barber_id)}
                className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold border transition-colors min-h-[44px] ${active ? 'bg-charcoal-900 text-warm-50 border-charcoal-900' : 'bg-warm-50 text-charcoal-600 border-warm-300 hover:border-charcoal-400'}`}
              >
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                {(b.barber_name || b.alias || '').split(' ')[0]}
                <span className={active ? 'text-warm-50/60' : 'text-charcoal-400'}>{count}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Day at a glance */}
      <DayGlance appointments={visibleAppointments} view={view} viewRange={viewRange} barberNameFor={barberNameFor} walkInCount={walkIns.length} />

      {/* Calendar */}
      <div ref={calWrapRef} className="flex-1 overflow-auto bg-warm-50 relative select-none">
        <FullCalendar
          ref={calRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={false}
          height="100%"
          expandRows={true}
          stickyHeaderDates={true}
          fixedWeekCount={false}
          events={fcEvents}
          slotMinTime="07:00:00"
          slotMaxTime="22:00:00"
          slotDuration="00:15:00"
          slotLabelInterval="01:00:00"
          nowIndicator={true}
          selectable={true}
          selectMirror={true}
          // Touch range-select is replaced by the custom long-press-to-create
          // gesture below (fixed 15-min block with a live time label), so push
          // FullCalendar's own touch long-press select effectively out of reach.
          // Mouse drag-select is untouched.
          selectLongPressDelay={86400000}
          select={handleSelect}
          eventClick={handleEventClick}
          eventContent={renderEventContent}
          datesSet={handleDatesSet}
          eventMinHeight={36}
          dayMaxEventRows={4}
          dateClick={(info) => {
            if (view === 'dayGridMonth') {
              calRef.current?.getApi().gotoDate(info.date)
              changeView('timeGridDay')
            }
          }}
        />
        {/* Floating 15-min block for the long-press-to-create gesture */}
        {dragNew && (
          <div
            className="absolute z-30 pointer-events-none drag-new-block"
            style={{ top: dragNew.top, left: dragNew.left, width: dragNew.width, height: dragNew.height }}
          >
            <div className="w-full h-full rounded-lg border-2 border-od-green bg-od-green/25 shadow-lg flex items-center justify-center">
              <span className="text-[12px] font-bold text-charcoal-900 bg-warm-50/95 rounded-md px-1.5 py-0.5 shadow-sm">
                {fmtMinutes(dragNew.minutes)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Appointment popover */}
      <AnimatePresence>
        {popover && (
          <AppointmentPopover
            appointment={popover.appt}
            barberName={popover.barberName}
            accentColor={barberColorMap[popover.appt.barber_id]}
            x={popover.x}
            y={popover.y}
            isOwner={true}
            onClose={() => setPopover(null)}
            onUpdated={loadAppointments}
          />
        )}
      </AnimatePresence>

      {/* Walk-in popover */}
      <AnimatePresence>
        {walkInPopover && (
          <WalkInPopover
            walkIn={walkInPopover.walkIn}
            shopId={shopId}
            barbers={barbers}
            services={services}
            isOwner={true}
            solo={barbers.length === 1}
            x={walkInPopover.x}
            y={walkInPopover.y}
            onClose={() => setWalkInPopover(null)}
            onChanged={loadWalkIns}
          />
        )}
      </AnimatePresence>

      {/* Quick book */}
      {showBook && (
        <QuickBookModal
          shopId={shopId}
          initialDate={bookSlot?.date}
          initialTime={bookSlot?.time}
          initialBarberId={bookSlot?.barberId}
          barbers={barbers}
          services={services}
          onCreated={loadAppointments}
          onClose={() => { setShowBook(false); setBookSlot(null) }}
        />
      )}
    </div>
  )
}
