/**
 * CalendarClient - full-screen interactive calendar.
 * Owns the Apple-style month carousel, selected-day dock, and modal state.
 */
'use client'

import React, { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from 'react'
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'
import { CalendarDays, ChevronLeft, ChevronRight, FolderOpen, Link2, Maximize2, Minimize2, Plus, Rows3 } from 'lucide-react'
import { AppHeader } from '@/components/AppHeader'
import { DayDetailModal } from '@/components/DayDetailModal'
import { EventCategoryModal } from '@/components/EventCategoryModal'
import { EventDetailSheet } from '@/components/EventDetailSheet'
import { IcsModal } from '@/components/IcsModal'
import { VerticalCalendar } from '@/components/VerticalCalendar'
import type { EventOccurrence } from '@/lib/types/calendar'
import {
  DOW, MONTHS, toLocalDateKey, startOfLocalToday, monthLabel, monthAnchorKey,
  formatAccessibleDate, dateLabel, timeLabel, compactTimeLabel,
  dateFromKey, buildMonthDays, buildMonthRange, extendMonthRange,
} from '@/lib/calendar/calendarView'

// localStorage key persisting the user's calendar view preference.
const VIEW_STORAGE_KEY = 'sentinel.calendarView'

type CalendarEventItem = {
  occurrenceId: string
  sourceEventId: string
  title: string
  startAt: string
  endAt: string
  notes?: string | null
  color?: string | null
  categoryId?: string | null
  rrule?: string | null
  isOverride?: boolean
  originalDate?: string | null
}

interface IcsEventItem {
  uid: string
  title: string
  startAt: string
  endAt: string
}

interface EventCategory {
  id: string
  name: string
  color: string
}

interface CreatedCalendarEventItem {
  id: string
  title: string
  startAt: string
  endAt: string
  color?: string | null
  categoryId?: string | null
  rrule?: string | null
  exdates?: string[] | null
}

interface CalendarClientProps {
  initialEvents: CalendarEventItem[]
  initialIcsEvents: IcsEventItem[]
  eventCategories: EventCategory[]
  icsUrl: string | null
}

// Date/format helpers (DOW, MONTHS, toLocalDateKey, buildMonthDays, etc.)
// now live in lib/calendar/calendarView.ts and are shared with VerticalCalendar.

export function CalendarClient({
  initialEvents,
  initialIcsEvents,
  eventCategories: initialCategories,
  icsUrl: initialIcsUrl,
}: CalendarClientProps) {
  const [today] = useState(() => startOfLocalToday())
  const [currentMonth, setCurrentMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [modalDay, setModalDay] = useState<string | null>(null)
  const [modalStartsInAddMode, setModalStartsInAddMode] = useState(false)
  const [manageCatsOpen, setManageCatsOpen] = useState(false)
  const [icsOpen, setIcsOpen] = useState(false)
  const [categories, setCategories] = useState(initialCategories)
  const [localEvents, setLocalEvents] = useState(initialEvents)
  const [icsUrl, setIcsUrl] = useState(initialIcsUrl)
  const [direction, setDirection] = useState(1)
  const [editingEvent, setEditingEvent] = useState<EventOccurrence | null>(null)
  const [dragStartX, setDragStartX] = useState<number | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const wheelState = useRef({ amount: 0, direction: 0, lastFlipAt: 0, streak: 0 })
  const isInitialMount = useRef(true)

  // View mode — 'scroll' (vertical, default) or 'month' (horizontal carousel),
  // persisted to localStorage. Lazy initializer reads the stored preference.
  const [viewMode, setViewMode] = useState<'scroll' | 'month'>(() => {
    if (typeof window === 'undefined') return 'scroll'
    return window.localStorage.getItem(VIEW_STORAGE_KEY) === 'month' ? 'month' : 'scroll'
  })
  useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem(VIEW_STORAGE_KEY, viewMode)
  }, [viewMode])

  // Loaded month anchors for the vertical scroll view (12 back / 12 forward),
  // extended lazily as the user scrolls or jumps. A pending key drives auto-scroll.
  const [monthRange, setMonthRange] = useState(() => buildMonthRange(today, 12, 12))
  const [scrollToKey, setScrollToKey] = useState<string | null>(null)

  // Re-fetch the event window whenever the user navigates to a new month.
  // Skip the very first render — the server already supplied initialEvents.
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }
    void loadMonth(currentMonth)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMonth])

  const todayKey = toLocalDateKey(today)

  const carouselMonths = useMemo(() => {
    return [-1, 0, 1].map(offset => new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1))
  }, [currentMonth])

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEventItem[]>()
    for (const ev of localEvents) {
      const key = toLocalDateKey(new Date(ev.startAt))
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(ev)
    }
    return map
  }, [localEvents])

  const icsEventsByDate = useMemo(() => {
    const map = new Map<string, IcsEventItem[]>()
    for (const ev of initialIcsEvents) {
      const key = toLocalDateKey(new Date(ev.startAt))
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(ev)
    }
    return map
  }, [initialIcsEvents])

  const modalDate = modalDay ? dateFromKey(modalDay) : null
  const modalEvents = modalDay ? (eventsByDate.get(modalDay) ?? []) : []
  const modalIcsEvents = modalDay ? (icsEventsByDate.get(modalDay) ?? []) : []
  const selectedDate = selectedDay ? dateFromKey(selectedDay) : null
  const selectedEvents = selectedDay ? (eventsByDate.get(selectedDay) ?? []) : []
  const selectedIcsEvents = selectedDay ? (icsEventsByDate.get(selectedDay) ?? []) : []

  function navigate(delta: number) {
    setDirection(delta)
    setSelectedDay(null)
    setModalStartsInAddMode(false)
    setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() + delta, 1))
  }

  function navigateToMonth(month: Date) {
    setDirection(month.getTime() >= currentMonth.getTime() ? 1 : -1)
    setSelectedDay(null)
    setModalStartsInAddMode(false)
    setCurrentMonth(new Date(month.getFullYear(), month.getMonth(), 1))
  }

  function navigateFromScroll(direction: 1 | -1) {
    const now = Date.now()
    const state = wheelState.current
    if (state.direction === direction && now - state.lastFlipAt < 900) {
      state.streak += 1
    } else {
      state.streak = 1
    }
    state.direction = direction
    state.lastFlipAt = now
    navigate(direction * (state.streak >= 4 ? 2 : 1))
  }

  function handleCarouselWheel(event: WheelEvent<HTMLDivElement>) {
    if (Math.abs(event.deltaX) < Math.abs(event.deltaY) * 0.8) return

    const direction = event.deltaX > 0 ? 1 : -1
    const state = wheelState.current
    if (state.direction !== direction) {
      state.amount = 0
      state.direction = direction
    }

    state.amount += Math.abs(event.deltaX)
    if (state.amount < 90) return

    state.amount = 0
    navigateFromScroll(direction)
  }

  function handleCarouselPointerDown(event: PointerEvent<HTMLDivElement>) {
    setDragStartX(event.clientX)
  }

  function handleCarouselPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (dragStartX === null) return

    const deltaX = event.clientX - dragStartX
    setDragStartX(null)
    if (Math.abs(deltaX) < 80) return

    navigate(deltaX < 0 ? 1 : -1)
  }

  function handleCarouselKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!isExpanded) return
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      navigate(1)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      navigate(-1)
    }
  }

  function handleDayClick(key: string) {
    setSelectedDay(key)
  }

  function handleAddEventClick(key: string) {
    setModalStartsInAddMode(true)
    setModalDay(key)
  }

  // Fetch events in [from, to]. Replaces local events by default, or merges
  // (dedupe by occurrenceId) when extending the vertical view's loaded window.
  // Repeat fields are intentionally not re-expanded here — repeat changes reflect after next navigation (accepted tradeoff).
  async function loadRange(from: Date, to: Date, opts: { merge?: boolean } = {}) {
    const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() })
    const res = await fetch(`/api/calendar/events?${params}`)
    if (!res?.ok) return
    const events = await res.json() as CalendarEventItem[]
    setLocalEvents(prev => {
      if (!opts.merge) return events
      const byId = new Map(prev.map(e => [e.occurrenceId, e]))
      for (const e of events) byId.set(e.occurrenceId, e)
      return [...byId.values()]
    })
  }

  // Carousel month navigation loads a ±window around the centered month.
  async function loadMonth(month: Date) {
    const rangeFrom = new Date(month.getFullYear(), month.getMonth() - 3, 1)
    const rangeTo = new Date(month.getFullYear(), month.getMonth() + 7, 0, 23, 59, 59, 999)
    await loadRange(rangeFrom, rangeTo)
  }

  // In scroll mode, keep events loaded across the full month range (merging so
  // server-supplied initialEvents and prior fetches are preserved).
  useEffect(() => {
    if (viewMode !== 'scroll' || monthRange.length === 0) return
    const first = monthRange[0]
    const last = monthRange[monthRange.length - 1]
    const to = new Date(last.getFullYear(), last.getMonth() + 1, 0, 23, 59, 59, 999)
    void loadRange(first, to, { merge: true })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, monthRange])

  // Scroll-view callbacks.
  function handleScrollSelectDay(key: string) {
    setModalStartsInAddMode(false)
    setModalDay(key)
  }

  function handleReachEnd(side: 'past' | 'future') {
    setMonthRange(r => extendMonthRange(r, side, 6))
  }

  function handleJumpRequest(month: Date) {
    setMonthRange(buildMonthRange(month, 12, 12))
    setScrollToKey(monthAnchorKey(month))
  }

  function jumpToToday() {
    const key = monthAnchorKey(today)
    if (!monthRange.some(m => monthAnchorKey(m) === key)) setMonthRange(buildMonthRange(today, 12, 12))
    setScrollToKey(key)
  }

  function renderCalendarCard(month: Date, role: 'prev' | 'center' | 'next') {
    const monthKey = `${month.getFullYear()}-${month.getMonth()}`
    const isCenter = role === 'center'
    const label = monthLabel(month)
    const days = buildMonthDays(month)

    return (
      <motion.div
        key={monthKey}
        layout
        initial={{ opacity: 0, x: direction * 80 }}
        animate={{ opacity: isCenter ? 1 : isExpanded ? 0 : 0.7, x: 0 }}
        exit={{ opacity: 0, x: direction * -80 }}
        transition={{
          layout: { duration: 0.4, ease: [0.4, 0, 0.2, 1] },
          opacity: { duration: 0.25 },
          x: { duration: 0.35, ease: [0.4, 0, 0.2, 1] },
        }}
        role={isCenter ? 'region' : 'button'}
        aria-label={
          isCenter
            ? `${label} calendar`
            : `${role === 'prev' ? 'Previous' : 'Next'} month preview: ${label}`
        }
        tabIndex={isCenter ? undefined : isExpanded ? -1 : 0}
        onClick={!isCenter && !isExpanded ? () => navigateToMonth(month) : undefined}
        onKeyDown={
          !isCenter && !isExpanded
            ? (e: React.KeyboardEvent<HTMLDivElement>) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  navigateToMonth(month)
                }
              }
            : undefined
        }
        className={[
          'rounded-2xl border border-border bg-card shadow-sm',
          isCenter
            ? `relative shrink-0 w-full p-3 sm:p-4 ${isExpanded ? (selectedDay ? 'h-full max-w-6xl pb-8 overflow-y-auto' : 'h-[min(42rem,calc(100vh-14rem))] max-w-6xl pb-8 overflow-y-auto') : 'max-w-xl'}`
            : isExpanded
              ? 'w-0 overflow-hidden p-0'
              : 'hidden w-[18rem] shrink-0 flex-col p-3 opacity-70 cursor-pointer hover:bg-muted/50 hover:opacity-90 md:flex',
        ].join(' ')}
      >
        {isCenter ? (
          <>
            {/* Corner expand/collapse button */}
            <button
              type="button"
              aria-label={isExpanded ? 'Collapse calendar' : 'Expand calendar'}
              onClick={() => setIsExpanded(prev => !prev)}
              className="absolute top-2 right-2 z-10 flex h-7 w-7 items-center justify-center rounded-lg bg-muted/40 hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={isExpanded ? 'min' : 'max'}
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.7 }}
                  transition={{ duration: 0.15 }}
                >
                  {isExpanded
                    ? <Minimize2 className="h-3.5 w-3.5" />
                    : <Maximize2 className="h-3.5 w-3.5" />}
                </motion.span>
              </AnimatePresence>
            </button>
            <button
              type="button"
              aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${label} calendar`}
              onClick={() => setIsExpanded(prev => !prev)}
              className="mb-2 inline-flex max-w-full whitespace-nowrap rounded-lg px-2 py-1 text-left text-base font-semibold tracking-normal text-foreground transition-colors hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {label}
            </button>
            <div className="grid grid-cols-7 mb-1">
              {DOW.map((d, i) => {
                const isTodayCol = month.getMonth() === today.getMonth() && month.getFullYear() === today.getFullYear() && i === today.getDay()
                return (
                  <div key={d} className="text-center py-1">
                    <span className={`text-[10px] font-mono ${isTodayCol ? 'text-primary font-bold' : 'text-muted-foreground'}`}>{d}</span>
                  </div>
                )
              })}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {days.map(day => {
                const key = toLocalDateKey(day)
                const isCurrentMonth = day.getMonth() === month.getMonth()
                const isToday = key === todayKey
                const isSelected = key === selectedDay
                const dayEvents = eventsByDate.get(key) ?? []
                const dayIcsEvents = icsEventsByDate.get(key) ?? []
                const totalDots = dayEvents.length + dayIcsEvents.length

                return (
                  <motion.div
                    key={key}
                    data-testid={`calendar-day-${key}`}
                    role={isCurrentMonth ? 'button' : undefined}
                    aria-label={isCurrentMonth ? `Select ${formatAccessibleDate(day)}` : undefined}
                    tabIndex={isCurrentMonth ? 0 : -1}
                    onClick={() => { if (isCurrentMonth) handleDayClick(key) }}
                    onKeyDown={e => {
                      if (isCurrentMonth && (e.key === 'Enter' || e.key === ' ')) {
                        if (e.key === ' ') e.preventDefault()
                        handleDayClick(key)
                      }
                    }}
                    whileHover={isCurrentMonth ? { scale: 1.03 } : {}}
                    whileTap={isCurrentMonth ? { scale: 0.97 } : {}}
                    className={[
                      'relative flex flex-col items-center justify-start overflow-hidden rounded-xl text-xs',
                      isExpanded ? 'min-h-40 h-auto px-1 py-1.5' : 'aspect-square pt-1',
                      isCurrentMonth ? 'text-foreground cursor-pointer' : 'text-muted-foreground/30 cursor-default',
                      isSelected ? 'bg-muted shadow-sm' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    <span className={[
                      'relative z-10 flex h-6 w-6 items-center justify-center text-xs font-medium',
                      isToday ? 'font-bold text-primary' : '',
                      isSelected ? 'rounded-full bg-primary text-primary-foreground' : '',
                    ].filter(Boolean).join(' ')}>
                      {day.getDate()}
                    </span>

                    {isToday && !isSelected && <span className="relative z-10 h-1 w-1 rounded-full bg-primary" />}

                    {totalDots > 0 && !isExpanded && (
                      <div className="relative z-10 mt-1 flex flex-wrap justify-center gap-0.5 px-1">
                        {dayEvents.slice(0, 2).map((ev, i) => {
                          const cat = categories.find(c => c.id === ev.categoryId)
                          return <span key={`e${i}`} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: ev.color ?? cat?.color ?? '#6366f1' }} />
                        })}
                        {dayIcsEvents.slice(0, 1).map((_, i) => <span key={`i${i}`} className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />)}
                        {totalDots > 3 && <span className="text-[8px] text-muted-foreground">+{totalDots - 3}</span>}
                      </div>
                    )}

                    {totalDots > 0 && isExpanded && (
                      <div className="relative z-10 mt-1 flex w-full min-w-0 flex-col gap-0.5 px-0.5">
                        {dayEvents.slice(0, 8).map((ev, i) => {
                          const cat = categories.find(c => c.id === ev.categoryId)
                          return (
                            <div
                              key={`e${i}`}
                              className="flex min-w-0 items-center gap-1 rounded bg-muted/55 px-1 py-0.5 text-[9px] leading-none text-foreground"
                              title={`${compactTimeLabel(ev.startAt)} ${ev.title}`}
                            >
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: ev.color ?? cat?.color ?? '#6366f1' }} />
                              <span className="shrink-0 font-medium tabular-nums">{compactTimeLabel(ev.startAt)}</span>
                              <span data-testid={`calendar-event-title-${ev.occurrenceId}`} className="min-w-0 truncate text-left text-muted-foreground">
                                {ev.title}
                              </span>
                            </div>
                          )
                        })}
                        {dayIcsEvents.slice(0, 1).map((ev, i) => (
                          <div
                            key={`i${i}`}
                            className="flex min-w-0 items-center gap-1 rounded bg-muted/45 px-1 py-0.5 text-[9px] leading-none text-foreground"
                            title={`${compactTimeLabel(ev.startAt)} ${ev.title}`}
                          >
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                            <span className="shrink-0 font-medium tabular-nums">{compactTimeLabel(ev.startAt)}</span>
                            <span className="min-w-0 truncate text-left text-muted-foreground">{ev.title}</span>
                          </div>
                        ))}
                        {totalDots > 9 && <span className="pl-1 text-[9px] leading-none text-muted-foreground">+{totalDots - 9}</span>}
                      </div>
                    )}
                  </motion.div>
                )
              })}
            </div>
          </>
        ) : (
          <>
            <motion.span
              layoutId={`${monthKey}-label`}
              transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
              className="mb-3 block text-xs font-medium text-muted-foreground/90"
            >
              {label}
            </motion.span>
            <span className="grid grid-cols-7 gap-1" aria-hidden="true">
              {days.map(day => {
                const key = toLocalDateKey(day)
                const inMonth = day.getMonth() === month.getMonth()
                const hasDots = (eventsByDate.get(key)?.length ?? 0) + (icsEventsByDate.get(key)?.length ?? 0) > 0
                return (
                  <span
                    key={key}
                    data-preview-day={key}
                    className={[
                      'relative flex h-7 items-center justify-center rounded-md text-[10px]',
                      inMonth ? 'text-foreground' : 'text-muted-foreground/25',
                    ].join(' ')}
                  >
                    {day.getDate()}
                    {hasDots && inMonth && <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary" />}
                  </span>
                )
              })}
            </span>
          </>
        )}
      </motion.div>
    )
  }

  const selectedCalEvents = selectedEvents.map(ev => ({
    ...ev,
    startAtDate: new Date(ev.startAt),
    endAtDate: new Date(ev.endAt),
    resolvedColor: ev.color ?? categories.find(c => c.id === ev.categoryId)?.color ?? '#6366f1',
  }))

  const selectedIcsDockItems = selectedIcsEvents.map(ev => ({
    id: ev.uid,
    title: ev.title,
    startAt: new Date(ev.startAt),
    color: '#6366f1' as string,
  }))

  return (
    <div className="fixed inset-0 bg-background overflow-hidden flex flex-col pt-[76px]">
      <AppHeader active="calendar" position="fixed" />

      <div className="shrink-0 px-3 pb-3">
        <div
          data-testid="calendar-controls-island"
          className="mx-auto flex w-full max-w-xl flex-wrap items-center justify-between gap-2 rounded-full border border-border/60 bg-background/90 px-3 py-2 shadow-lg backdrop-blur-md"
        >
          {/* Segmented view toggle — Scroll (vertical, default) vs Month (carousel) */}
          <div data-testid="calendar-view-toggle" className="flex items-center gap-1 rounded-full bg-muted/50 p-0.5">
            <button
              type="button"
              aria-pressed={viewMode === 'scroll'}
              onClick={() => setViewMode('scroll')}
              className={`flex h-8 items-center gap-1.5 rounded-full px-3 text-xs transition-colors ${viewMode === 'scroll' ? 'bg-background font-semibold text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Rows3 className="h-3.5 w-3.5" />
              Scroll
            </button>
            <button
              type="button"
              aria-pressed={viewMode === 'month'}
              onClick={() => setViewMode('month')}
              className={`flex h-8 items-center gap-1.5 rounded-full px-3 text-xs transition-colors ${viewMode === 'month' ? 'bg-background font-semibold text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              Month
            </button>
          </div>

          <div className="flex min-w-0 items-center gap-2">
            {viewMode === 'scroll' && (
              <button
                onClick={jumpToToday}
                className="flex h-9 items-center gap-1.5 rounded-full border border-border px-3 text-xs transition-colors hover:bg-muted"
              >
                Today
              </button>
            )}
            <button
              onClick={() => setManageCatsOpen(true)}
              className="flex h-9 items-center gap-1.5 rounded-full border border-border px-3 text-xs transition-colors hover:bg-muted"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              Categories
            </button>
            <button
              onClick={() => setIcsOpen(true)}
              className="flex h-9 items-center gap-1.5 rounded-full border border-border px-3 text-xs transition-colors hover:bg-muted"
            >
              <Link2 className="h-3.5 w-3.5" />
              {icsUrl ? 'Calendar connected' : 'Connect Calendar'}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden px-3 py-2">
        {viewMode === 'scroll' ? (
          <div className="mx-auto h-full max-w-3xl">
            <VerticalCalendar
              today={today}
              months={monthRange}
              eventsByDate={eventsByDate}
              icsEventsByDate={icsEventsByDate}
              categories={categories}
              onSelectDay={handleScrollSelectDay}
              onReachEnd={handleReachEnd}
              onJumpRequest={handleJumpRequest}
              scrollToKey={scrollToKey}
              onScrolled={() => setScrollToKey(null)}
            />
          </div>
        ) : (
        <div data-testid="calendar-stack" className={`mx-auto flex max-w-7xl ${isExpanded && selectedDay ? 'h-full flex-row items-start gap-3' : 'flex-col items-center gap-1'}`}>
          {/* Left panel — visible only in expanded view when a day is selected */}
          {isExpanded && selectedDay && selectedDate && (
            <motion.section
              data-testid="selected-day-panel"
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2 }}
              className="flex h-full w-72 shrink-0 flex-col overflow-y-auto rounded-2xl border border-border bg-card p-3 shadow-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Selected day</p>
                  <h2 className="text-sm font-semibold">{dateLabel(selectedDate)}</h2>
                </div>
                <button
                  type="button"
                  onClick={() => handleAddEventClick(selectedDay)}
                  className="flex h-9 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Add event
                </button>
              </div>

              <div className="mt-3 flex flex-col gap-2">
                {selectedCalEvents.map(ev => (
                  <button
                    key={ev.occurrenceId}
                    type="button"
                    onClick={() => setEditingEvent({
                      occurrenceId: ev.occurrenceId,
                      sourceEventId: ev.sourceEventId,
                      title: ev.title,
                      startAt: ev.startAtDate,
                      endAt: ev.endAtDate,
                      notes: ev.notes ?? null,
                      color: ev.color ?? null,
                      categoryId: ev.categoryId ?? null,
                      rrule: ev.rrule ?? null,
                      isOverride: ev.isOverride ?? false,
                      originalDate: ev.originalDate ?? null,
                    })}
                    aria-label={ev.title}
                    className="flex items-center gap-2 rounded-lg border border-border/70 bg-background px-3 py-2 text-left text-xs transition-colors hover:bg-muted/50"
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: ev.resolvedColor }} />
                    <span className="min-w-0 flex-1 truncate font-medium">{ev.title}</span>
                    <span className="shrink-0 font-mono text-muted-foreground">{timeLabel(ev.startAtDate)}</span>
                    <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" aria-hidden="true" />
                  </button>
                ))}
                {selectedIcsDockItems.map(item => (
                  <div key={item.id} className="flex items-center gap-2 rounded-lg border border-border/70 bg-background px-3 py-2 text-xs">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="min-w-0 flex-1 truncate font-medium">{item.title}</span>
                    <span className="shrink-0 font-mono text-muted-foreground">{timeLabel(item.startAt)}</span>
                  </div>
                ))}
                {selectedCalEvents.length === 0 && selectedIcsDockItems.length === 0 && (
                  <p className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                    No events scheduled.
                  </p>
                )}
              </div>
            </motion.section>
          )}

          <LayoutGroup id="calendar">
          <div
            data-testid="month-carousel"
            onWheel={handleCarouselWheel}
            onPointerDown={handleCarouselPointerDown}
            onPointerUp={handleCarouselPointerUp}
            onPointerCancel={() => setDragStartX(null)}
            onKeyDown={handleCarouselKeyDown}
            tabIndex={isExpanded ? 0 : -1}
            className={`flex min-h-0 ${isExpanded && selectedDay ? 'flex-1 min-w-0 h-full' : 'w-full'} ${isExpanded ? 'max-w-6xl gap-0' : 'gap-4'} shrink-0 cursor-grab touch-pan-y select-none items-start justify-center overflow-visible pt-1 active:cursor-grabbing`}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              {carouselMonths.map((month, idx) =>
                renderCalendarCard(month, idx === 0 ? 'prev' : idx === 1 ? 'center' : 'next')
              )}
            </AnimatePresence>
          </div>
          </LayoutGroup>

          {!isExpanded && (
            <div
              data-testid="calendar-bottom-navigation"
              className="mx-auto flex w-full max-w-xl shrink-0 items-center justify-center gap-4 pt-2"
            >
              <button aria-label="Previous month" onClick={() => navigate(-1)} className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background/90 shadow-sm transition-colors hover:bg-muted">
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button aria-label="Next month" onClick={() => navigate(1)} className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background/90 shadow-sm transition-colors hover:bg-muted">
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          )}

          {!isExpanded && selectedDay && selectedDate && (
            <motion.section
              data-testid="selected-day-dock"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="mx-auto w-full max-w-xl shrink-0 rounded-2xl border border-border bg-card p-3 shadow-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Selected day</p>
                  <h2 className="text-sm font-semibold">{dateLabel(selectedDate)}</h2>
                </div>
                <button
                  type="button"
                  onClick={() => handleAddEventClick(selectedDay)}
                  className="flex h-9 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Add event
                </button>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {selectedCalEvents.map(ev => (
                  <button
                    key={ev.occurrenceId}
                    type="button"
                    onClick={() => setEditingEvent({
                      occurrenceId: ev.occurrenceId,
                      sourceEventId: ev.sourceEventId,
                      title: ev.title,
                      startAt: ev.startAtDate,
                      endAt: ev.endAtDate,
                      notes: ev.notes ?? null,
                      color: ev.color ?? null,
                      categoryId: ev.categoryId ?? null,
                      rrule: ev.rrule ?? null,
                      isOverride: ev.isOverride ?? false,
                      originalDate: ev.originalDate ?? null,
                    })}
                    aria-label={ev.title}
                    className="flex items-center gap-2 rounded-lg border border-border/70 bg-background px-3 py-2 text-left text-xs transition-colors hover:bg-muted/50"
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: ev.resolvedColor }} />
                    <span className="min-w-0 flex-1 truncate font-medium">{ev.title}</span>
                    <span className="shrink-0 font-mono text-muted-foreground">{timeLabel(ev.startAtDate)}</span>
                    <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" aria-hidden="true" />
                  </button>
                ))}
                {selectedIcsDockItems.map(item => (
                  <div key={item.id} className="flex items-center gap-2 rounded-lg border border-border/70 bg-background px-3 py-2 text-xs">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="min-w-0 flex-1 truncate font-medium">{item.title}</span>
                    <span className="shrink-0 font-mono text-muted-foreground">{timeLabel(item.startAt)}</span>
                  </div>
                ))}
                {selectedCalEvents.length === 0 && selectedIcsDockItems.length === 0 && (
                  <p className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground sm:col-span-2">
                    No events scheduled.
                  </p>
                )}
              </div>
            </motion.section>
          )}
        </div>
        )}
      </div>

      {modalDay && modalDate && (
        <DayDetailModal
          date={modalDate}
          events={modalEvents.map(ev => ({
            occurrenceId: ev.occurrenceId,
            sourceEventId: ev.sourceEventId,
            title: ev.title,
            startAt: new Date(ev.startAt),
            endAt: new Date(ev.endAt),
            notes: ev.notes ?? null,
            color: ev.color ?? null,
            categoryId: ev.categoryId ?? null,
            rrule: ev.rrule ?? null,
            isOverride: ev.isOverride ?? false,
            originalDate: ev.originalDate ?? null,
          }))}
          icsEvents={modalIcsEvents.map(ev => ({ ...ev, startAt: new Date(ev.startAt), endAt: new Date(ev.endAt) }))}
          eventCategories={categories}
          startInAddMode={modalStartsInAddMode}
          onClose={() => {
            setModalDay(null)
            setSelectedDay(null)
            setModalStartsInAddMode(false)
            setEditingEvent(null)
          }}
          onEventCreated={() => { void loadMonth(currentMonth) }}
          onEditEvent={ev => setEditingEvent(ev)}
        />
      )}

      <EventDetailSheet
        event={editingEvent}
        onClose={() => setEditingEvent(null)}
        onSaved={() => {
          void loadMonth(currentMonth)
          setEditingEvent(null)
        }}
        onDeleted={() => {
          void loadMonth(currentMonth)
          setEditingEvent(null)
        }}
      />

      {manageCatsOpen && (
        <EventCategoryModal
          categories={categories}
          onClose={() => setManageCatsOpen(false)}
          onChange={setCategories}
        />
      )}

      {icsOpen && (
        <IcsModal
          currentUrl={icsUrl}
          onClose={() => setIcsOpen(false)}
          onSaved={url => setIcsUrl(url)}
          onDeleted={() => setIcsUrl(null)}
        />
      )}
    </div>
  )
}
