/**
 * CalendarClient - full-screen interactive calendar.
 * Owns the Apple-style month carousel, selected-day dock, and modal state.
 */
'use client'

import { useMemo, useState, type WheelEvent } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { CalendarDays, ChevronLeft, ChevronRight, FolderOpen, Link2, Plus, Target } from 'lucide-react'
import { DayDetailModal } from '@/components/DayDetailModal'
import { EventCategoryModal } from '@/components/EventCategoryModal'
import { IcsModal } from '@/components/IcsModal'
import { expandRepeatingEvent } from '@/lib/services/repeatExpander'

interface CalendarEventItem {
  occurrenceId: string
  sourceEventId: string
  title: string
  startAt: string
  endAt: string
  color?: string | null
  categoryId?: string | null
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

type RepeatFrequency = 'day' | 'week' | 'month' | 'year'

interface CreatedCalendarEventItem {
  id: string
  title: string
  startAt: string
  endAt: string
  color?: string | null
  categoryId?: string | null
  repeatFrequency?: RepeatFrequency | null
  repeatInterval?: number | null
  repeatEndsAt?: string | null
}

interface CalendarClientProps {
  initialEvents: CalendarEventItem[]
  initialIcsEvents: IcsEventItem[]
  eventCategories: EventCategory[]
  icsUrl: string | null
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function toLocalDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function startOfLocalToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function monthLabel(d: Date) {
  return d.toLocaleString('default', { month: 'long', year: 'numeric' })
}

function dateLabel(d: Date) {
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function timeLabel(d: Date) {
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function dateFromKey(key: string) {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function buildMonthDays(month: Date) {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1)
  const startDow = firstDay.getDay()
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(firstDay)
    d.setDate(1 - startDow + i)
    return d
  })
}

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

  function navigateToToday() {
    setDirection(today.getTime() >= currentMonth.getTime() ? 1 : -1)
    setSelectedDay(todayKey)
    setModalStartsInAddMode(false)
    setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1))
  }

  function handleCarouselWheel(event: WheelEvent<HTMLDivElement>) {
    if (Math.abs(event.deltaX) <= Math.abs(event.deltaY) || Math.abs(event.deltaX) < 40) return
    navigate(event.deltaX > 0 ? 1 : -1)
  }

  function handleDayClick(key: string) {
    setSelectedDay(key)
  }

  function handleAddEventClick(key: string) {
    setModalStartsInAddMode(true)
    setModalDay(key)
  }

  function expandCreatedEvent(event: CreatedCalendarEventItem): CalendarEventItem[] {
    const rangeFrom = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 3, 1)
    const rangeTo = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 7, 0, 23, 59, 59, 999)
    return expandRepeatingEvent({
      id: event.id,
      title: event.title,
      startAt: new Date(event.startAt),
      endAt: new Date(event.endAt),
      repeatFrequency: event.repeatFrequency ?? null,
      repeatInterval: event.repeatInterval ?? null,
      repeatEndsAt: event.repeatEndsAt ? new Date(event.repeatEndsAt) : null,
    }, rangeFrom, rangeTo).map(occurrence => ({
      ...occurrence,
      startAt: occurrence.startAt.toISOString(),
      endAt: occurrence.endAt.toISOString(),
      color: event.color ?? null,
      categoryId: event.categoryId ?? null,
    }))
  }

  function renderPreviewMonth(month: Date, position: 'previous' | 'next') {
    const label = monthLabel(month)
    const days = buildMonthDays(month)

    return (
      <button
        key={`${position}-${month.toISOString()}`}
        type="button"
        aria-label={`${position === 'previous' ? 'Previous' : 'Next'} month preview: ${label}`}
        onClick={() => navigateToMonth(month)}
        className={[
          'hidden md:flex shrink-0 w-[18rem] flex-col rounded-2xl border border-border bg-card/70 p-3 text-left opacity-55 shadow-sm transition-all hover:bg-muted/50 hover:opacity-80',
          position === 'previous' ? '-ml-24' : '-mr-24',
        ].join(' ')}
      >
        <span className="mb-3 text-xs font-semibold text-muted-foreground">{label}</span>
        <span className="grid grid-cols-7 gap-1" aria-hidden="true">
          {days.slice(0, 35).map(day => {
            const key = toLocalDateKey(day)
            const inMonth = day.getMonth() === month.getMonth()
            const hasDots = (eventsByDate.get(key)?.length ?? 0) + (icsEventsByDate.get(key)?.length ?? 0) > 0
            return (
              <span
                key={key}
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
      </button>
    )
  }

  function renderCurrentMonth(month: Date) {
    const days = buildMonthDays(month)
    const activeMonthLabel = monthLabel(month)

    return (
      <motion.section
        key={`current-${month.toISOString()}`}
        initial={{ opacity: 0, x: direction * 40 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: direction * -40 }}
        transition={{ duration: 0.25, ease: 'easeInOut' }}
        className="shrink-0 w-full max-w-4xl rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4"
        aria-label={`${activeMonthLabel} calendar`}
      >
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
                aria-label={isCurrentMonth ? `Select ${day.toLocaleDateString(undefined, {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}` : undefined}
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
                  'relative flex min-h-[3.25rem] flex-col items-center justify-start rounded-xl pt-1 text-xs sm:min-h-[4rem]',
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

                {totalDots > 0 && (
                  <div className="relative z-10 mt-1 flex flex-wrap justify-center gap-0.5 px-1">
                    {dayEvents.slice(0, 2).map((ev, i) => {
                      const cat = categories.find(c => c.id === ev.categoryId)
                      return <span key={`e${i}`} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: ev.color ?? cat?.color ?? '#6366f1' }} />
                    })}
                    {dayIcsEvents.slice(0, 1).map((_, i) => <span key={`i${i}`} className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />)}
                    {totalDots > 3 && <span className="text-[8px] text-muted-foreground">+{totalDots - 3}</span>}
                  </div>
                )}
              </motion.div>
            )
          })}
        </div>
      </motion.section>
    )
  }

  const selectedDockItems = [
    ...selectedEvents.map(ev => ({
      id: ev.occurrenceId,
      title: ev.title,
      startAt: new Date(ev.startAt),
      color: ev.color ?? categories.find(c => c.id === ev.categoryId)?.color ?? '#6366f1',
    })),
    ...selectedIcsEvents.map(ev => ({
      id: ev.uid,
      title: ev.title,
      startAt: new Date(ev.startAt),
      color: '#94a3b8',
    })),
  ]

  return (
    <div className="fixed inset-0 bg-background overflow-hidden flex flex-col pt-[60px]">
      <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 rounded-full border border-border/50 bg-background/90 backdrop-blur-md shadow-lg px-4 py-0">
        <span className="text-[13px] font-extrabold tracking-widest text-foreground select-none">SENTINEL</span>
        <div className="h-5 w-px bg-border/60" aria-hidden="true" />
        <Link
          href="/"
          className="flex items-center gap-1.5 rounded-xl px-4 min-h-[44px] text-[13px] font-medium text-muted-foreground hover:bg-muted/60 transition-colors"
        >
          <Target className="h-4 w-4" aria-hidden="true" />
          Triggers
        </Link>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-xl bg-primary text-primary-foreground px-4 min-h-[44px] text-[13px] font-semibold cursor-default"
          aria-current="page"
        >
          <CalendarDays className="h-4 w-4" aria-hidden="true" />
          Calendar
        </button>
      </div>

      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={navigateToToday}
            className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-muted"
          >
            Today
          </button>
          <button aria-label="Previous month" onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h1 className="text-sm font-semibold min-w-[140px] text-center">{monthLabel(currentMonth)}</h1>
          <button aria-label="Next month" onClick={() => navigate(1)} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setManageCatsOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted transition-colors"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Categories
          </button>
          <button
            onClick={() => setIcsOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted transition-colors"
          >
            <Link2 className="h-3.5 w-3.5" />
            {icsUrl ? 'Calendar connected' : 'Connect Calendar'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden px-3 py-3">
        <div className="mx-auto flex h-full max-w-7xl flex-col gap-3">
          <div
            data-testid="month-carousel"
            onWheel={handleCarouselWheel}
            className="flex min-h-0 flex-1 items-center justify-center gap-4 overflow-hidden"
          >
            {renderPreviewMonth(carouselMonths[0], 'previous')}
            <AnimatePresence mode="wait" initial={false}>
              {renderCurrentMonth(carouselMonths[1])}
            </AnimatePresence>
            {renderPreviewMonth(carouselMonths[2], 'next')}
          </div>

          {selectedDay && selectedDate && (
            <motion.section
              data-testid="selected-day-dock"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="mx-auto w-full max-w-4xl shrink-0 rounded-2xl border border-border bg-card p-3 shadow-sm"
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
                {selectedDockItems.map(item => (
                  <div key={item.id} className="flex items-center gap-2 rounded-lg border border-border/70 bg-background px-3 py-2 text-xs">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="min-w-0 flex-1 truncate font-medium">{item.title}</span>
                    <span className="shrink-0 font-mono text-muted-foreground">{timeLabel(item.startAt)}</span>
                  </div>
                ))}
                {selectedDockItems.length === 0 && (
                  <p className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground sm:col-span-2">
                    No events scheduled.
                  </p>
                )}
              </div>
            </motion.section>
          )}
        </div>
      </div>

      {modalDay && modalDate && (
        <DayDetailModal
          date={modalDate}
          events={modalEvents.map(ev => ({ ...ev, startAt: new Date(ev.startAt), endAt: new Date(ev.endAt) }))}
          icsEvents={modalIcsEvents.map(ev => ({ ...ev, startAt: new Date(ev.startAt), endAt: new Date(ev.endAt) }))}
          eventCategories={categories}
          startInAddMode={modalStartsInAddMode}
          onClose={() => {
            setModalDay(null)
            setSelectedDay(null)
            setModalStartsInAddMode(false)
          }}
          onEventCreated={event => setLocalEvents(prev => [...prev, ...expandCreatedEvent(event)])}
          onEventDeleted={id => setLocalEvents(prev => prev.filter(e => e.sourceEventId !== id))}
        />
      )}

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
